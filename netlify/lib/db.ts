import { randomUUID } from "node:crypto";
import { hashPassword, randomToken, sha256Hex } from "./crypto";
import type {
  EmailDelivery,
  FormConfig,
  PlanTier,
  SubmissionFile,
  SubmissionRecord,
  SubmissionStatus,
  SyncConnection,
  SyncEvent,
  SyncMirrorRow,
  SyncMode,
  SyncProvider,
  WebhookDelivery,
  WebhookRecord,
  Workspace,
} from "./types";

export interface QueryablePool {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: R[] }>;
}

function toIso(val: unknown): string {
  if (val instanceof Date) return val.toISOString();
  return String(val ?? new Date().toISOString());
}

function mapWorkspace(row: Record<string, unknown>): Workspace {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    plan: (row.plan as PlanTier) ?? "free",
    resendApiKey: row.resend_api_key ? String(row.resend_api_key) : null,
    fromEmail: row.from_email ? String(row.from_email) : null,
    isDemo: Boolean(row.is_demo),
    createdAt: toIso(row.created_at),
  };
}

function mapForm(row: Record<string, unknown>): FormConfig {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    name: String(row.name),
    slug: String(row.slug),
    honeypotField: String(row.honeypot_field ?? "_gotcha"),
    redirectUrl: row.redirect_url ? String(row.redirect_url) : null,
    allowedOrigins: row.allowed_origins ? String(row.allowed_origins) : null,
    leadMagnetEnabled: Boolean(row.lead_magnet_enabled),
    leadMagnetTitle: row.lead_magnet_title ? String(row.lead_magnet_title) : null,
    leadMagnetFilename: row.lead_magnet_filename ? String(row.lead_magnet_filename) : null,
    leadMagnetBlobKey: row.lead_magnet_blob_key ? String(row.lead_magnet_blob_key) : null,
    leadMagnetMime: row.lead_magnet_mime ? String(row.lead_magnet_mime) : null,
    leadMagnetDiscountCode: row.lead_magnet_discount_code
      ? String(row.lead_magnet_discount_code)
      : null,
    leadMagnetEmailField: String(row.lead_magnet_email_field ?? "email"),
    leadMagnetSubject: row.lead_magnet_subject ? String(row.lead_magnet_subject) : null,
    leadMagnetBody: row.lead_magnet_body ? String(row.lead_magnet_body) : null,
    createdAt: toIso(row.created_at),
    submissionCount:
      row.submission_count !== undefined ? Number(row.submission_count) : undefined,
    spamCount: row.spam_count !== undefined ? Number(row.spam_count) : undefined,
  };
}

function mapSubmission(row: Record<string, unknown>): SubmissionRecord {
  const payload =
    typeof row.payload_json === "string"
      ? (JSON.parse(row.payload_json) as Record<string, unknown>)
      : ((row.payload_json as Record<string, unknown>) ?? {});
  return {
    id: String(row.id),
    formId: String(row.form_id),
    workspaceId: String(row.workspace_id),
    payload,
    submitterEmail: row.submitter_email ? String(row.submitter_email) : null,
    submitterName: row.submitter_name ? String(row.submitter_name) : null,
    status: (row.status as SubmissionStatus) ?? "new",
    notes: String(row.notes ?? ""),
    isSpam: Boolean(row.is_spam),
    sourceOrigin: row.source_origin ? String(row.source_origin) : null,
    ipAddress: row.ip_address ? String(row.ip_address) : null,
    userAgent: row.user_agent ? String(row.user_agent) : null,
    remoteSheetRowId: row.remote_sheet_row_id ? String(row.remote_sheet_row_id) : null,
    remoteNotionPageId: row.remote_notion_page_id
      ? String(row.remote_notion_page_id)
      : null,
    syncStatus: String(row.sync_status ?? "pending"),
    updatedAt: toIso(row.updated_at),
    createdAt: toIso(row.created_at),
  };
}

function mapFile(row: Record<string, unknown>): SubmissionFile {
  return {
    id: String(row.id),
    submissionId: String(row.submission_id),
    formId: String(row.form_id),
    fieldName: String(row.field_name),
    filename: String(row.filename),
    mimeType: String(row.mime_type),
    sizeBytes: Number(row.size_bytes),
    blobKey: String(row.blob_key),
    createdAt: toIso(row.created_at),
  };
}

function mapWebhook(row: Record<string, unknown>): WebhookRecord {
  return {
    id: String(row.id),
    formId: String(row.form_id),
    url: String(row.url),
    secret: String(row.secret),
    enabled: Boolean(row.enabled),
    createdAt: toIso(row.created_at),
  };
}

function mapWebhookDelivery(row: Record<string, unknown>): WebhookDelivery {
  const payload =
    typeof row.payload_json === "string"
      ? (JSON.parse(row.payload_json) as Record<string, unknown>)
      : ((row.payload_json as Record<string, unknown>) ?? {});
  return {
    id: String(row.id),
    webhookId: String(row.webhook_id),
    submissionId: String(row.submission_id),
    formId: String(row.form_id),
    requestUrl: String(row.request_url),
    signature: String(row.signature),
    payload,
    responseStatus:
      row.response_status !== null && row.response_status !== undefined
        ? Number(row.response_status)
        : null,
    responseBody: row.response_body ? String(row.response_body) : null,
    durationMs:
      row.duration_ms !== null && row.duration_ms !== undefined
        ? Number(row.duration_ms)
        : null,
    status: (row.status as "success" | "failed") ?? "failed",
    createdAt: toIso(row.created_at),
  };
}

function mapEmailDelivery(row: Record<string, unknown>): EmailDelivery {
  return {
    id: String(row.id),
    formId: String(row.form_id),
    submissionId: String(row.submission_id),
    recipientEmail: String(row.recipient_email),
    subject: String(row.subject),
    htmlBody: String(row.html_body),
    attachmentFilename: row.attachment_filename ? String(row.attachment_filename) : null,
    downloadToken: String(row.download_token),
    discountCode: row.discount_code ? String(row.discount_code) : null,
    transport: (row.transport as "resend" | "outbox") ?? "outbox",
    status: (row.status as "sent" | "outbox_ready" | "failed") ?? "outbox_ready",
    providerMessageId: row.provider_message_id ? String(row.provider_message_id) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    createdAt: toIso(row.created_at),
  };
}

function mapSyncConnection(row: Record<string, unknown>): SyncConnection {
  const fieldMapping =
    typeof row.field_mapping_json === "string"
      ? (JSON.parse(row.field_mapping_json) as Record<string, string>)
      : ((row.field_mapping_json as Record<string, string>) ?? {});
  return {
    id: String(row.id),
    formId: String(row.form_id),
    provider: row.provider as SyncProvider,
    mode: (row.mode as SyncMode) ?? "sandbox",
    enabled: Boolean(row.enabled),
    targetId: row.target_id ? String(row.target_id) : null,
    targetName: row.target_name ? String(row.target_name) : null,
    apiToken: row.api_token ? String(row.api_token) : null,
    fieldMapping,
    lastSyncedAt: row.last_synced_at ? toIso(row.last_synced_at) : null,
    createdAt: toIso(row.created_at),
  };
}

function mapMirrorRow(row: Record<string, unknown>): SyncMirrorRow {
  const remoteData =
    typeof row.remote_data_json === "string"
      ? (JSON.parse(row.remote_data_json) as Record<string, unknown>)
      : ((row.remote_data_json as Record<string, unknown>) ?? {});
  return {
    id: String(row.id),
    connectionId: String(row.connection_id),
    submissionId: String(row.submission_id),
    externalRecordId: String(row.external_record_id),
    remoteStatus: (row.remote_status as SubmissionStatus) ?? "new",
    remoteNotes: String(row.remote_notes ?? ""),
    remoteData,
    remoteUpdatedAt: toIso(row.remote_updated_at),
    lastPushedAt: toIso(row.last_pushed_at),
  };
}

function mapSyncEvent(row: Record<string, unknown>): SyncEvent {
  const details =
    typeof row.details_json === "string"
      ? (JSON.parse(row.details_json) as Record<string, unknown>)
      : ((row.details_json as Record<string, unknown>) ?? {});
  return {
    id: String(row.id),
    connectionId: String(row.connection_id),
    formId: String(row.form_id),
    direction: row.direction as SyncEvent["direction"],
    summary: String(row.summary),
    details,
    createdAt: toIso(row.created_at),
  };
}

export function createFormBeamDb(pool: QueryablePool) {
  return {
    async createWorkspace(input: {
      name: string;
      email: string;
      passwordHash: string;
      plan?: PlanTier;
      isDemo?: boolean;
    }): Promise<Workspace> {
      const id = `ws_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
      const { rows } = await pool.query(
        `INSERT INTO workspaces (id, name, email, password_hash, plan, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          id,
          input.name,
          input.email.toLowerCase().trim(),
          input.passwordHash,
          input.plan ?? "free",
          Boolean(input.isDemo),
        ],
      );
      return mapWorkspace(rows[0]);
    },

    async getWorkspaceByEmail(
      email: string,
    ): Promise<{ workspace: Workspace; passwordHash: string } | null> {
      const { rows } = await pool.query(
        `SELECT * FROM workspaces WHERE email = $1 LIMIT 1`,
        [email.toLowerCase().trim()],
      );
      if (rows.length === 0) return null;
      return {
        workspace: mapWorkspace(rows[0]),
        passwordHash: String(rows[0].password_hash),
      };
    },

    async getWorkspaceById(id: string): Promise<Workspace | null> {
      const { rows } = await pool.query(
        `SELECT * FROM workspaces WHERE id = $1 LIMIT 1`,
        [id],
      );
      return rows[0] ? mapWorkspace(rows[0]) : null;
    },

    async getDemoWorkspace(): Promise<Workspace | null> {
      const { rows } = await pool.query(
        `SELECT * FROM workspaces WHERE is_demo = TRUE LIMIT 1`,
      );
      return rows[0] ? mapWorkspace(rows[0]) : null;
    },

    async updateWorkspace(
      id: string,
      patch: {
        name?: string;
        plan?: PlanTier;
        resendApiKey?: string | null;
        fromEmail?: string | null;
      },
    ): Promise<Workspace> {
      const existing = await this.getWorkspaceById(id);
      if (!existing) throw new Error("Workspace not found");
      const { rows } = await pool.query(
        `UPDATE workspaces
         SET name = $2, plan = $3, resend_api_key = $4, from_email = $5
         WHERE id = $1
         RETURNING *`,
        [
          id,
          patch.name ?? existing.name,
          patch.plan ?? existing.plan,
          patch.resendApiKey !== undefined ? patch.resendApiKey : existing.resendApiKey,
          patch.fromEmail !== undefined ? patch.fromEmail : existing.fromEmail,
        ],
      );
      return mapWorkspace(rows[0]);
    },

    async createSession(workspaceId: string): Promise<{ token: string; expiresAt: Date }> {
      const id = `sess_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
      const token = randomToken(24);
      const tokenHash = sha256Hex(token);
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await pool.query(
        `INSERT INTO sessions (id, workspace_id, token_hash, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [id, workspaceId, tokenHash, expiresAt.toISOString()],
      );
      return { token, expiresAt };
    },

    async getWorkspaceBySessionToken(token: string): Promise<Workspace | null> {
      const tokenHash = sha256Hex(token);
      const { rows } = await pool.query(
        `SELECT w.*
         FROM sessions s
         JOIN workspaces w ON w.id = s.workspace_id
         WHERE s.token_hash = $1 AND s.expires_at > NOW()
         LIMIT 1`,
        [tokenHash],
      );
      return rows[0] ? mapWorkspace(rows[0]) : null;
    },

    async deleteSession(token: string): Promise<void> {
      await pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [sha256Hex(token)]);
    },

    async getMonthlySubmissionCount(workspaceId: string): Promise<number> {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS cnt
         FROM submissions
         WHERE workspace_id = $1
           AND is_spam = FALSE
           AND created_at >= date_trunc('month', NOW() AT TIME ZONE 'UTC')`,
        [workspaceId],
      );
      return Number(rows[0]?.cnt ?? 0);
    },

    async listForms(workspaceId: string): Promise<FormConfig[]> {
      const { rows } = await pool.query(
        `SELECT f.*,
           COUNT(s.id) FILTER (WHERE s.is_spam = FALSE)::int AS submission_count,
           COUNT(s.id) FILTER (WHERE s.is_spam = TRUE)::int AS spam_count
         FROM forms f
         LEFT JOIN submissions s ON s.form_id = f.id
         WHERE f.workspace_id = $1
         GROUP BY f.id
         ORDER BY f.created_at DESC`,
        [workspaceId],
      );
      return rows.map(mapForm);
    },

    async getFormById(id: string): Promise<FormConfig | null> {
      const { rows } = await pool.query(`SELECT * FROM forms WHERE id = $1 LIMIT 1`, [id]);
      return rows[0] ? mapForm(rows[0]) : null;
    },

    async getFormBySlug(slug: string): Promise<FormConfig | null> {
      const { rows } = await pool.query(
        `SELECT * FROM forms WHERE slug = $1 LIMIT 1`,
        [slug.toLowerCase().trim()],
      );
      return rows[0] ? mapForm(rows[0]) : null;
    },

    async createForm(input: {
      workspaceId: string;
      name: string;
      slug: string;
      honeypotField?: string;
      redirectUrl?: string | null;
      allowedOrigins?: string | null;
      leadMagnetEnabled?: boolean;
      leadMagnetTitle?: string | null;
      leadMagnetFilename?: string | null;
      leadMagnetBlobKey?: string | null;
      leadMagnetMime?: string | null;
      leadMagnetDiscountCode?: string | null;
      leadMagnetEmailField?: string;
      leadMagnetSubject?: string | null;
      leadMagnetBody?: string | null;
    }): Promise<FormConfig> {
      const id = `frm_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
      const { rows } = await pool.query(
        `INSERT INTO forms (
           id, workspace_id, name, slug, honeypot_field, redirect_url, allowed_origins,
           lead_magnet_enabled, lead_magnet_title, lead_magnet_filename, lead_magnet_blob_key,
           lead_magnet_mime, lead_magnet_discount_code, lead_magnet_email_field,
           lead_magnet_subject, lead_magnet_body
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING *`,
        [
          id,
          input.workspaceId,
          input.name,
          input.slug.toLowerCase().trim(),
          input.honeypotField ?? "_gotcha",
          input.redirectUrl ?? null,
          input.allowedOrigins ?? "*",
          Boolean(input.leadMagnetEnabled),
          input.leadMagnetTitle ?? null,
          input.leadMagnetFilename ?? null,
          input.leadMagnetBlobKey ?? null,
          input.leadMagnetMime ?? "application/pdf",
          input.leadMagnetDiscountCode ?? null,
          input.leadMagnetEmailField ?? "email",
          input.leadMagnetSubject ?? null,
          input.leadMagnetBody ?? null,
        ],
      );
      return mapForm(rows[0]);
    },

    async updateForm(id: string, patch: Partial<FormConfig>): Promise<FormConfig> {
      const cur = await this.getFormById(id);
      if (!cur) throw new Error("Form not found");
      const { rows } = await pool.query(
        `UPDATE forms
         SET name = $2,
             honeypot_field = $3,
             redirect_url = $4,
             allowed_origins = $5,
             lead_magnet_enabled = $6,
             lead_magnet_title = $7,
             lead_magnet_filename = $8,
             lead_magnet_blob_key = $9,
             lead_magnet_mime = $10,
             lead_magnet_discount_code = $11,
             lead_magnet_email_field = $12,
             lead_magnet_subject = $13,
             lead_magnet_body = $14
         WHERE id = $1
         RETURNING *`,
        [
          id,
          patch.name ?? cur.name,
          patch.honeypotField ?? cur.honeypotField,
          patch.redirectUrl !== undefined ? patch.redirectUrl : cur.redirectUrl,
          patch.allowedOrigins !== undefined ? patch.allowedOrigins : cur.allowedOrigins,
          patch.leadMagnetEnabled !== undefined
            ? patch.leadMagnetEnabled
            : cur.leadMagnetEnabled,
          patch.leadMagnetTitle !== undefined
            ? patch.leadMagnetTitle
            : cur.leadMagnetTitle,
          patch.leadMagnetFilename !== undefined
            ? patch.leadMagnetFilename
            : cur.leadMagnetFilename,
          patch.leadMagnetBlobKey !== undefined
            ? patch.leadMagnetBlobKey
            : cur.leadMagnetBlobKey,
          patch.leadMagnetMime !== undefined ? patch.leadMagnetMime : cur.leadMagnetMime,
          patch.leadMagnetDiscountCode !== undefined
            ? patch.leadMagnetDiscountCode
            : cur.leadMagnetDiscountCode,
          patch.leadMagnetEmailField ?? cur.leadMagnetEmailField,
          patch.leadMagnetSubject !== undefined
            ? patch.leadMagnetSubject
            : cur.leadMagnetSubject,
          patch.leadMagnetBody !== undefined ? patch.leadMagnetBody : cur.leadMagnetBody,
        ],
      );
      return mapForm(rows[0]);
    },

    async deleteForm(id: string): Promise<void> {
      await pool.query(`DELETE FROM forms WHERE id = $1`, [id]);
    },

    async createSubmission(input: {
      formId: string;
      workspaceId: string;
      payload: Record<string, unknown>;
      submitterEmail?: string | null;
      submitterName?: string | null;
      isSpam?: boolean;
      sourceOrigin?: string | null;
      ipAddress?: string | null;
      userAgent?: string | null;
      status?: SubmissionStatus;
      notes?: string;
    }): Promise<SubmissionRecord> {
      const id = `sub_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
      const { rows } = await pool.query(
        `INSERT INTO submissions (
           id, form_id, workspace_id, payload_json, submitter_email, submitter_name,
           status, notes, is_spam, source_origin, ip_address, user_agent
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          id,
          input.formId,
          input.workspaceId,
          JSON.stringify(input.payload),
          input.submitterEmail ?? null,
          input.submitterName ?? null,
          input.status ?? "new",
          input.notes ?? "",
          Boolean(input.isSpam),
          input.sourceOrigin ?? null,
          input.ipAddress ?? null,
          input.userAgent ?? null,
        ],
      );
      return mapSubmission(rows[0]);
    },

    async listSubmissions(formId: string): Promise<SubmissionRecord[]> {
      const { rows } = await pool.query(
        `SELECT * FROM submissions WHERE form_id = $1 ORDER BY created_at DESC LIMIT 250`,
        [formId],
      );
      const subs = rows.map(mapSubmission);
      if (subs.length === 0) return [];
      const { rows: fileRows } = await pool.query(
        `SELECT * FROM submission_files WHERE form_id = $1 ORDER BY created_at ASC`,
        [formId],
      );
      const filesBySub = new Map<string, SubmissionFile[]>();
      for (const fr of fileRows) {
        const f = mapFile(fr);
        const list = filesBySub.get(f.submissionId) ?? [];
        list.push(f);
        filesBySub.set(f.submissionId, list);
      }
      return subs.map((s) => ({ ...s, files: filesBySub.get(s.id) ?? [] }));
    },

    async getSubmissionById(id: string): Promise<SubmissionRecord | null> {
      const { rows } = await pool.query(`SELECT * FROM submissions WHERE id = $1 LIMIT 1`, [id]);
      if (!rows[0]) return null;
      const sub = mapSubmission(rows[0]);
      const { rows: fileRows } = await pool.query(
        `SELECT * FROM submission_files WHERE submission_id = $1`,
        [id],
      );
      return { ...sub, files: fileRows.map(mapFile) };
    },

    async updateSubmission(
      id: string,
      patch: {
        status?: SubmissionStatus;
        notes?: string;
        updatedAt?: string;
        remoteSheetRowId?: string | null;
        remoteNotionPageId?: string | null;
        syncStatus?: string;
      },
    ): Promise<SubmissionRecord> {
      const cur = await this.getSubmissionById(id);
      if (!cur) throw new Error("Submission not found");
      const { rows } = await pool.query(
        `UPDATE submissions
         SET status = $2,
             notes = $3,
             remote_sheet_row_id = $4,
             remote_notion_page_id = $5,
             sync_status = $6,
             updated_at = $7
         WHERE id = $1
         RETURNING *`,
        [
          id,
          patch.status ?? cur.status,
          patch.notes !== undefined ? patch.notes : cur.notes,
          patch.remoteSheetRowId !== undefined
            ? patch.remoteSheetRowId
            : cur.remoteSheetRowId,
          patch.remoteNotionPageId !== undefined
            ? patch.remoteNotionPageId
            : cur.remoteNotionPageId,
          patch.syncStatus ?? cur.syncStatus,
          patch.updatedAt ?? new Date().toISOString(),
        ],
      );
      return { ...mapSubmission(rows[0]), files: cur.files ?? [] };
    },

    async deleteSubmission(id: string): Promise<void> {
      await pool.query(`DELETE FROM submissions WHERE id = $1`, [id]);
    },

    async createSubmissionFile(input: {
      submissionId: string;
      formId: string;
      fieldName: string;
      filename: string;
      mimeType: string;
      sizeBytes: number;
      blobKey: string;
    }): Promise<SubmissionFile> {
      const id = `fil_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
      const { rows } = await pool.query(
        `INSERT INTO submission_files (id, submission_id, form_id, field_name, filename, mime_type, size_bytes, blob_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [
          id,
          input.submissionId,
          input.formId,
          input.fieldName,
          input.filename,
          input.mimeType,
          input.sizeBytes,
          input.blobKey,
        ],
      );
      return mapFile(rows[0]);
    },

    async getSubmissionFileById(id: string): Promise<SubmissionFile | null> {
      const { rows } = await pool.query(
        `SELECT * FROM submission_files WHERE id = $1 LIMIT 1`,
        [id],
      );
      return rows[0] ? mapFile(rows[0]) : null;
    },

    async listWebhooks(formId: string): Promise<WebhookRecord[]> {
      const { rows } = await pool.query(
        `SELECT * FROM webhooks WHERE form_id = $1 ORDER BY created_at DESC`,
        [formId],
      );
      return rows.map(mapWebhook);
    },

    async getWebhookById(id: string): Promise<WebhookRecord | null> {
      const { rows } = await pool.query(`SELECT * FROM webhooks WHERE id = $1 LIMIT 1`, [id]);
      return rows[0] ? mapWebhook(rows[0]) : null;
    },

    async createWebhook(input: {
      formId: string;
      url: string;
      secret?: string;
    }): Promise<WebhookRecord> {
      const id = `wh_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
      const secret = input.secret ?? `whsec_${randomToken(16)}`;
      const { rows } = await pool.query(
        `INSERT INTO webhooks (id, form_id, url, secret, enabled)
         VALUES ($1,$2,$3,$4,TRUE)
         RETURNING *`,
        [id, input.formId, input.url, secret],
      );
      return mapWebhook(rows[0]);
    },

    async deleteWebhook(id: string): Promise<void> {
      await pool.query(`DELETE FROM webhooks WHERE id = $1`, [id]);
    },

    async createWebhookDelivery(input: {
      webhookId: string;
      submissionId: string;
      formId: string;
      requestUrl: string;
      signature: string;
      payload: Record<string, unknown>;
      responseStatus: number | null;
      responseBody: string | null;
      durationMs: number | null;
      status: "success" | "failed";
    }): Promise<WebhookDelivery> {
      const id = `whd_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
      const { rows } = await pool.query(
        `INSERT INTO webhook_deliveries (
           id, webhook_id, submission_id, form_id, request_url, signature,
           payload_json, response_status, response_body, duration_ms, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          id,
          input.webhookId,
          input.submissionId,
          input.formId,
          input.requestUrl,
          input.signature,
          JSON.stringify(input.payload),
          input.responseStatus,
          input.responseBody,
          input.durationMs,
          input.status,
        ],
      );
      return mapWebhookDelivery(rows[0]);
    },

    async listWebhookDeliveries(formId: string): Promise<WebhookDelivery[]> {
      const { rows } = await pool.query(
        `SELECT * FROM webhook_deliveries WHERE form_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [formId],
      );
      return rows.map(mapWebhookDelivery);
    },

    async getWebhookDeliveryById(id: string): Promise<WebhookDelivery | null> {
      const { rows } = await pool.query(
        `SELECT * FROM webhook_deliveries WHERE id = $1 LIMIT 1`,
        [id],
      );
      return rows[0] ? mapWebhookDelivery(rows[0]) : null;
    },

    async createEmailDelivery(input: {
      formId: string;
      submissionId: string;
      recipientEmail: string;
      subject: string;
      htmlBody: string;
      attachmentFilename: string | null;
      downloadToken: string;
      discountCode: string | null;
      transport: "resend" | "outbox";
      status: "sent" | "outbox_ready" | "failed";
      providerMessageId?: string | null;
      errorMessage?: string | null;
    }): Promise<EmailDelivery> {
      const id = `eml_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
      const { rows } = await pool.query(
        `INSERT INTO email_deliveries (
           id, form_id, submission_id, recipient_email, subject, html_body,
           attachment_filename, download_token, discount_code, transport, status,
           provider_message_id, error_message
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING *`,
        [
          id,
          input.formId,
          input.submissionId,
          input.recipientEmail,
          input.subject,
          input.htmlBody,
          input.attachmentFilename,
          input.downloadToken,
          input.discountCode,
          input.transport,
          input.status,
          input.providerMessageId ?? null,
          input.errorMessage ?? null,
        ],
      );
      return mapEmailDelivery(rows[0]);
    },

    async listEmailDeliveries(formId: string): Promise<EmailDelivery[]> {
      const { rows } = await pool.query(
        `SELECT * FROM email_deliveries WHERE form_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [formId],
      );
      return rows.map(mapEmailDelivery);
    },

    async getEmailDeliveryByToken(token: string): Promise<EmailDelivery | null> {
      const { rows } = await pool.query(
        `SELECT * FROM email_deliveries WHERE download_token = $1 LIMIT 1`,
        [token],
      );
      return rows[0] ? mapEmailDelivery(rows[0]) : null;
    },

    async listSyncConnections(formId: string): Promise<SyncConnection[]> {
      const { rows } = await pool.query(
        `SELECT * FROM sync_connections WHERE form_id = $1 ORDER BY provider ASC`,
        [formId],
      );
      return rows.map(mapSyncConnection);
    },

    async listAllLiveSyncConnections(): Promise<SyncConnection[]> {
      const { rows } = await pool.query(
        `SELECT * FROM sync_connections WHERE enabled = TRUE AND mode = 'live_api'`,
      );
      return rows.map(mapSyncConnection);
    },

    async upsertSyncConnection(input: {
      formId: string;
      provider: SyncProvider;
      enabled: boolean;
      mode: SyncMode;
      targetId?: string | null;
      targetName?: string | null;
      apiToken?: string | null;
      fieldMapping?: Record<string, string>;
    }): Promise<SyncConnection> {
      const existingRows = await pool.query(
        `SELECT * FROM sync_connections WHERE form_id = $1 AND provider = $2 LIMIT 1`,
        [input.formId, input.provider],
      );
      const existing = existingRows.rows[0];
      if (existing) {
        const { rows } = await pool.query(
          `UPDATE sync_connections
           SET enabled = $3,
               mode = $4,
               target_id = $5,
               target_name = $6,
               api_token = $7,
               field_mapping_json = $8
           WHERE form_id = $1 AND provider = $2
           RETURNING *`,
          [
            input.formId,
            input.provider,
            input.enabled,
            input.mode,
            input.targetId !== undefined ? input.targetId : existing.target_id,
            input.targetName !== undefined ? input.targetName : existing.target_name,
            input.apiToken !== undefined ? input.apiToken : existing.api_token,
            JSON.stringify(
              input.fieldMapping ?? existing.field_mapping_json ?? {},
            ),
          ],
        );
        return mapSyncConnection(rows[0]);
      }

      const id = `syn_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
      const { rows } = await pool.query(
        `INSERT INTO sync_connections (
           id, form_id, provider, mode, enabled, target_id, target_name, api_token, field_mapping_json
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [
          id,
          input.formId,
          input.provider,
          input.mode,
          input.enabled,
          input.targetId ?? null,
          input.targetName ?? null,
          input.apiToken ?? null,
          JSON.stringify(input.fieldMapping ?? {}),
        ],
      );
      return mapSyncConnection(rows[0]);
    },

    async touchSyncConnection(id: string): Promise<void> {
      await pool.query(`UPDATE sync_connections SET last_synced_at = NOW() WHERE id = $1`, [id]);
    },

    async listMirrorRows(formId: string): Promise<SyncMirrorRow[]> {
      const { rows } = await pool.query(
        `SELECT m.*
         FROM sync_mirror_rows m
         JOIN sync_connections c ON c.id = m.connection_id
         WHERE c.form_id = $1
         ORDER BY m.last_pushed_at DESC`,
        [formId],
      );
      return rows.map(mapMirrorRow);
    },

    async listMirrorRowsForConnection(connectionId: string): Promise<SyncMirrorRow[]> {
      const { rows } = await pool.query(
        `SELECT * FROM sync_mirror_rows WHERE connection_id = $1 ORDER BY last_pushed_at DESC`,
        [connectionId],
      );
      return rows.map(mapMirrorRow);
    },

    async getMirrorRowById(id: string): Promise<SyncMirrorRow | null> {
      const { rows } = await pool.query(
        `SELECT * FROM sync_mirror_rows WHERE id = $1 LIMIT 1`,
        [id],
      );
      return rows[0] ? mapMirrorRow(rows[0]) : null;
    },

    async getMirrorRowOwnerWorkspace(rowId: string): Promise<{ formId: string; workspaceId: string } | null> {
      const { rows } = await pool.query(
        `SELECT f.id AS form_id, f.workspace_id
         FROM sync_mirror_rows m
         JOIN sync_connections c ON c.id = m.connection_id
         JOIN forms f ON f.id = c.form_id
         WHERE m.id = $1
         LIMIT 1`,
        [rowId],
      );
      if (!rows[0]) return null;
      return {
        formId: String(rows[0].form_id),
        workspaceId: String(rows[0].workspace_id),
      };
    },

    async upsertMirrorRow(input: {
      connectionId: string;
      submissionId: string;
      externalRecordId: string;
      remoteStatus: SubmissionStatus;
      remoteNotes: string;
      remoteData: Record<string, unknown>;
      remoteUpdatedAt?: string;
    }): Promise<SyncMirrorRow> {
      const id = `mrw_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
      const nowIso = new Date().toISOString();
      const { rows } = await pool.query(
        `INSERT INTO sync_mirror_rows (
           id, connection_id, submission_id, external_record_id, remote_status,
           remote_notes, remote_data_json, remote_updated_at, last_pushed_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (connection_id, submission_id) DO UPDATE SET
           external_record_id = EXCLUDED.external_record_id,
           remote_status = EXCLUDED.remote_status,
           remote_notes = EXCLUDED.remote_notes,
           remote_data_json = EXCLUDED.remote_data_json,
           remote_updated_at = EXCLUDED.remote_updated_at,
           last_pushed_at = EXCLUDED.last_pushed_at
         RETURNING *`,
        [
          id,
          input.connectionId,
          input.submissionId,
          input.externalRecordId,
          input.remoteStatus,
          input.remoteNotes,
          JSON.stringify(input.remoteData),
          input.remoteUpdatedAt ?? nowIso,
          nowIso,
        ],
      );
      return mapMirrorRow(rows[0]);
    },

    async updateMirrorRow(
      id: string,
      patch: { remoteStatus?: SubmissionStatus; remoteNotes?: string },
    ): Promise<SyncMirrorRow> {
      const cur = await this.getMirrorRowById(id);
      if (!cur) throw new Error("Mirror row not found");
      const { rows } = await pool.query(
        `UPDATE sync_mirror_rows
         SET remote_status = $2,
             remote_notes = $3,
             remote_updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          id,
          patch.remoteStatus ?? cur.remoteStatus,
          patch.remoteNotes !== undefined ? patch.remoteNotes : cur.remoteNotes,
        ],
      );
      return mapMirrorRow(rows[0]);
    },

    async createSyncEvent(input: {
      connectionId: string;
      formId: string;
      direction: SyncEvent["direction"];
      summary: string;
      details?: Record<string, unknown>;
    }): Promise<SyncEvent> {
      const id = `sev_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
      const { rows } = await pool.query(
        `INSERT INTO sync_events (id, connection_id, form_id, direction, summary, details_json)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING *`,
        [
          id,
          input.connectionId,
          input.formId,
          input.direction,
          input.summary,
          JSON.stringify(input.details ?? {}),
        ],
      );
      return mapSyncEvent(rows[0]);
    },

    async listSyncEvents(formId: string): Promise<SyncEvent[]> {
      const { rows } = await pool.query(
        `SELECT * FROM sync_events WHERE form_id = $1 ORDER BY created_at DESC LIMIT 60`,
        [formId],
      );
      return rows.map(mapSyncEvent);
    },
  };
}

export type FormBeamDb = ReturnType<typeof createFormBeamDb>;

export function createDemoPasswordHash(): string {
  return hashPassword("demo-workspace-pass");
}
