import type { FormBeamDb } from "../db";
import type {
  FormConfig,
  SubmissionRecord,
  SubmissionStatus,
  SyncConnection,
  SyncEvent,
} from "../types";

const VALID_STATUSES = new Set<SubmissionStatus>(["new", "qualified", "contacted", "archived"]);

function normalizeStatus(raw: unknown): SubmissionStatus | null {
  if (typeof raw !== "string") return null;
  const val = raw.trim().toLowerCase() as SubmissionStatus;
  return VALID_STATUSES.has(val) ? val : null;
}

async function pushToExternalGoogleSheet(
  conn: SyncConnection,
  sub: SubmissionRecord,
  fetcher: typeof fetch,
): Promise<string> {
  if (!conn.apiToken || !conn.targetId) {
    throw new Error("Google Sheets Spreadsheet ID and OAuth token required for live_api mode");
  }
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(conn.targetId)}/values/A1:append?valueInputOption=USER_ENTERED`;
  const row = [
    sub.id,
    sub.createdAt,
    sub.submitterEmail ?? "",
    sub.submitterName ?? "",
    sub.status,
    sub.notes,
    JSON.stringify(sub.payload),
  ];
  const res = await fetcher(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [row] }),
    signal: AbortSignal.timeout(8000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Google Sheets API ${res.status}: ${text.slice(0, 220)}`);
  }
  const json = JSON.parse(text) as { updates?: { updatedRange?: string } };
  return json.updates?.updatedRange ?? `sheet_row_${Date.now()}`;
}

async function pushToExternalNotion(
  conn: SyncConnection,
  sub: SubmissionRecord,
  fetcher: typeof fetch,
): Promise<string> {
  if (!conn.apiToken || !conn.targetId) {
    throw new Error("Notion Database ID and Integration Secret required for live_api mode");
  }
  const titleProp = conn.fieldMapping.name || "Name";
  const emailProp = conn.fieldMapping.email || "Email";
  const statusProp = conn.fieldMapping.status || "Status";
  const notesProp = conn.fieldMapping.notes || "Notes";
  const subIdProp = conn.fieldMapping.submissionId || "Submission ID";

  const res = await fetcher("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.apiToken}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parent: { database_id: conn.targetId },
      properties: {
        [titleProp]: {
          title: [{ text: { content: sub.submitterName || sub.submitterEmail || sub.id } }],
        },
        [emailProp]: {
          email: sub.submitterEmail || undefined,
        },
        [statusProp]: {
          rich_text: [{ text: { content: sub.status } }],
        },
        [notesProp]: {
          rich_text: [{ text: { content: sub.notes || "" } }],
        },
        [subIdProp]: {
          rich_text: [{ text: { content: sub.id } }],
        },
      },
    }),
    signal: AbortSignal.timeout(8000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Notion API ${res.status}: ${text.slice(0, 220)}`);
  }
  const json = JSON.parse(text) as { id?: string };
  return json.id ?? `notion_${Date.now()}`;
}

export async function pushSubmissionToIntegrations(params: {
  db: FormBeamDb;
  form: FormConfig;
  submission: SubmissionRecord;
  fetcher?: typeof fetch;
}): Promise<Array<{ provider: string; direction: string; summary: string }>> {
  const { db, form, submission } = params;
  const fetcher = params.fetcher ?? fetch;
  const connections = await db.listSyncConnections(form.id);
  const enabled = connections.filter((c) => c.enabled);
  const results: Array<{ provider: string; direction: string; summary: string }> = [];

  for (const conn of enabled) {
    let externalId =
      conn.provider === "google_sheets"
        ? `sheet_row_${submission.id.slice(-6)}`
        : `notion_page_${submission.id.slice(-6)}`;
    let summary = "";

    if (conn.mode === "live_api") {
      try {
        externalId =
          conn.provider === "google_sheets"
            ? await pushToExternalGoogleSheet(conn, submission, fetcher)
            : await pushToExternalNotion(conn, submission, fetcher);
        summary = `Live pushed ${submission.submitterEmail || submission.id} (${externalId})`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Live API push failed";
        await db.createSyncEvent({
          connectionId: conn.id,
          formId: form.id,
          direction: "outbound_push",
          summary: `Live API fallback to mirror: ${msg}`,
          details: { submissionId: submission.id, error: msg },
        });
        summary = `Mirrored locally after live API notice: ${msg}`;
      }
    } else {
      summary = `Pushed ${submission.submitterEmail || submission.id} to ${conn.targetName || conn.provider}`;
    }

    await db.upsertMirrorRow({
      connectionId: conn.id,
      submissionId: submission.id,
      externalRecordId: externalId,
      remoteStatus: submission.status,
      remoteNotes: submission.notes,
      remoteData: {
        email: submission.submitterEmail,
        name: submission.submitterName,
        ...submission.payload,
      },
      remoteUpdatedAt: submission.updatedAt,
    });

    if (conn.provider === "google_sheets") {
      await db.updateSubmission(submission.id, {
        remoteSheetRowId: externalId,
        syncStatus: "synced",
        updatedAt: submission.updatedAt,
      });
    } else {
      await db.updateSubmission(submission.id, {
        remoteNotionPageId: externalId,
        syncStatus: "synced",
        updatedAt: submission.updatedAt,
      });
    }

    await db.createSyncEvent({
      connectionId: conn.id,
      formId: form.id,
      direction: "outbound_push",
      summary,
      details: { submissionId: submission.id, externalId },
    });
    await db.touchSyncConnection(conn.id);
    results.push({ provider: conn.provider, direction: "outbound_push", summary });
  }

  return results;
}

export async function runTwoWaySyncForForm(params: {
  db: FormBeamDb;
  formId: string;
  fetcher?: typeof fetch;
}): Promise<{ pushed: number; pulled: number; conflicts: number; events: SyncEvent[] }> {
  const { db, formId } = params;
  const fetcher = params.fetcher ?? fetch;
  const connections = (await db.listSyncConnections(formId)).filter((c) => c.enabled);
  const submissions = (await db.listSubmissions(formId)).filter((s) => !s.isSpam);
  const subById = new Map(submissions.map((s) => [s.id, s]));

  let pushed = 0;
  let pulled = 0;
  let conflicts = 0;
  const emittedEvents: SyncEvent[] = [];

  for (const conn of connections) {
    // 1. Live API inbound pull if configured
    if (conn.mode === "live_api" && conn.apiToken && conn.targetId) {
      try {
        if (conn.provider === "google_sheets") {
          const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(conn.targetId)}/values/A1:G500`;
          const res = await fetcher(url, {
            headers: { Authorization: `Bearer ${conn.apiToken}` },
            signal: AbortSignal.timeout(8000),
          });
          if (res.ok) {
            const body = (await res.json()) as { values?: string[][] };
            for (const row of body.values ?? []) {
              const subId = row[0];
              const sub = subById.get(subId);
              if (!sub) continue;
              const remoteStatus = normalizeStatus(row[4]);
              const remoteNotes = row[5] ?? "";
              if (
                (remoteStatus && remoteStatus !== sub.status) ||
                remoteNotes !== sub.notes
              ) {
                await db.updateSubmission(sub.id, {
                  status: remoteStatus ?? sub.status,
                  notes: remoteNotes,
                  syncStatus: "synced",
                });
                pulled++;
                emittedEvents.push(
                  await db.createSyncEvent({
                    connectionId: conn.id,
                    formId,
                    direction: "inbound_pull",
                    summary: `Pulled Google Sheet updates for ${sub.submitterEmail || sub.id}`,
                    details: { submissionId: sub.id, status: remoteStatus, notes: remoteNotes },
                  }),
                );
              }
            }
          }
        } else if (conn.provider === "notion") {
          const res = await fetcher(
            `https://api.notion.com/v1/databases/${encodeURIComponent(conn.targetId)}/query`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${conn.apiToken}`,
                "Notion-Version": "2022-06-28",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ page_size: 100 }),
              signal: AbortSignal.timeout(8000),
            },
          );
          if (res.ok) {
            const body = (await res.json()) as {
              results?: Array<{
                id: string;
                last_edited_time: string;
                properties: Record<string, { rich_text?: Array<{ plain_text?: string }>; select?: { name?: string } }>;
              }>;
            };
            const subIdProp = conn.fieldMapping.submissionId || "Submission ID";
            const statusProp = conn.fieldMapping.status || "Status";
            const notesProp = conn.fieldMapping.notes || "Notes";
            for (const page of body.results ?? []) {
              const subId = page.properties?.[subIdProp]?.rich_text?.[0]?.plain_text;
              if (!subId) continue;
              const sub = subById.get(subId);
              if (!sub) continue;
              const rawStatus =
                page.properties?.[statusProp]?.select?.name ??
                page.properties?.[statusProp]?.rich_text?.[0]?.plain_text;
              const remoteStatus = normalizeStatus(rawStatus);
              const remoteNotes = page.properties?.[notesProp]?.rich_text?.[0]?.plain_text ?? "";
              if (
                (remoteStatus && remoteStatus !== sub.status) ||
                remoteNotes !== sub.notes
              ) {
                await db.updateSubmission(sub.id, {
                  status: remoteStatus ?? sub.status,
                  notes: remoteNotes,
                  remoteNotionPageId: page.id,
                  syncStatus: "synced",
                });
                pulled++;
                emittedEvents.push(
                  await db.createSyncEvent({
                    connectionId: conn.id,
                    formId,
                    direction: "inbound_pull",
                    summary: `Pulled Notion DB edits for ${sub.submitterEmail || sub.id}`,
                    details: { submissionId: sub.id, pageId: page.id },
                  }),
                );
              }
            }
          }
        }
      } catch (err) {
        emittedEvents.push(
          await db.createSyncEvent({
            connectionId: conn.id,
            formId,
            direction: "inbound_pull",
            summary: `Live API pull warning: ${err instanceof Error ? err.message : "Failed"}`,
          }),
        );
      }
    }

    // 2. Reconcile mirror rows bidirectionally
    const mirrorRows = await db.listMirrorRowsForConnection(conn.id);
    const mirrorBySubId = new Map(mirrorRows.map((m) => [m.submissionId, m]));

    for (const sub of submissions) {
      const mirror = mirrorBySubId.get(sub.id);
      if (!mirror) {
        const externalId =
          conn.provider === "google_sheets"
            ? `sheet_row_${sub.id.slice(-6)}`
            : `notion_page_${sub.id.slice(-6)}`;
        await db.upsertMirrorRow({
          connectionId: conn.id,
          submissionId: sub.id,
          externalRecordId: externalId,
          remoteStatus: sub.status,
          remoteNotes: sub.notes,
          remoteData: {
            email: sub.submitterEmail,
            name: sub.submitterName,
            ...sub.payload,
          },
          remoteUpdatedAt: sub.updatedAt,
        });
        pushed++;
        emittedEvents.push(
          await db.createSyncEvent({
            connectionId: conn.id,
            formId,
            direction: "outbound_push",
            summary: `Backfilled ${sub.submitterEmail || sub.id} to ${conn.targetName || conn.provider}`,
            details: { submissionId: sub.id, externalId },
          }),
        );
        continue;
      }

      const differs =
        mirror.remoteStatus !== sub.status || mirror.remoteNotes !== sub.notes;
      if (!differs) continue;

      const remoteTs = new Date(mirror.remoteUpdatedAt).getTime();
      const localTs = new Date(sub.updatedAt).getTime();

      if (remoteTs > localTs) {
        // Inbound pull from Sheet / Notion mirror into FormBeam submission
        await db.updateSubmission(sub.id, {
          status: mirror.remoteStatus,
          notes: mirror.remoteNotes,
          syncStatus: "synced",
          updatedAt: mirror.remoteUpdatedAt,
        });
        pulled++;
        const isConflict = Math.abs(remoteTs - localTs) < 5000 && localTs > new Date(mirror.lastPushedAt).getTime();
        if (isConflict) conflicts++;
        emittedEvents.push(
          await db.createSyncEvent({
            connectionId: conn.id,
            formId,
            direction: isConflict ? "conflict_resolved" : "inbound_pull",
            summary: `Pulled ${conn.provider === "google_sheets" ? "Google Sheet" : "Notion"} edit for ${sub.submitterEmail || sub.id}: status=${mirror.remoteStatus}`,
            details: {
              submissionId: sub.id,
              remoteStatus: mirror.remoteStatus,
              remoteNotes: mirror.remoteNotes,
            },
          }),
        );
      } else {
        // Outbound push from FormBeam submission to Sheet / Notion mirror
        await db.upsertMirrorRow({
          connectionId: conn.id,
          submissionId: sub.id,
          externalRecordId: mirror.externalRecordId,
          remoteStatus: sub.status,
          remoteNotes: sub.notes,
          remoteData: {
            email: sub.submitterEmail,
            name: sub.submitterName,
            ...sub.payload,
          },
          remoteUpdatedAt: sub.updatedAt,
        });
        pushed++;
        emittedEvents.push(
          await db.createSyncEvent({
            connectionId: conn.id,
            formId,
            direction: "outbound_push",
            summary: `Pushed FormBeam update for ${sub.submitterEmail || sub.id}: status=${sub.status}`,
            details: {
              submissionId: sub.id,
              status: sub.status,
              notes: sub.notes,
            },
          }),
        );
      }
    }

    await db.touchSyncConnection(conn.id);
  }

  return { pushed, pulled, conflicts, events: emittedEvents };
}
