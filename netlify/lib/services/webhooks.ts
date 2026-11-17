import type { FormBeamDb } from "../db";
import { signHmacSha256 } from "../crypto";
import type { FormConfig, SubmissionRecord, WebhookDelivery, WebhookRecord } from "../types";

export async function deliverSingleWebhook(params: {
  db: FormBeamDb;
  webhook: WebhookRecord;
  formSlug: string;
  submission: SubmissionRecord;
  fetcher?: typeof fetch;
}): Promise<WebhookDelivery> {
  const { db, webhook, formSlug, submission } = params;
  const fetcher = params.fetcher ?? fetch;

  const payload = {
    event: "submission.created",
    formId: submission.formId,
    formSlug,
    submissionId: submission.id,
    submittedAt: submission.createdAt,
    data: submission.payload,
    files: (submission.files ?? []).map((f) => ({
      id: f.id,
      fieldName: f.fieldName,
      filename: f.filename,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
    })),
  };

  const bodyStr = JSON.stringify(payload);
  const signature = signHmacSha256(webhook.secret, bodyStr);
  const started = Date.now();

  let responseStatus: number | null = null;
  let responseBody: string | null = null;
  let status: "success" | "failed" = "failed";

  try {
    if (!params.fetcher && !isSafeWebhookUrl(webhook.url)) {
      throw new Error("Blocked unsafe webhook target URL (private or invalid protocol).");
    }
    const res = await fetcher(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-FormBeam-Signature": signature,
        "X-FormBeam-Event": "submission.created",
        "User-Agent": "FormBeam-Webhooks/1.0",
      },
      body: bodyStr,
      signal: AbortSignal.timeout(8000),
    });
    responseStatus = res.status;
    responseBody = (await res.text()).slice(0, 500);
    status = res.ok ? "success" : "failed";
  } catch (err) {
    responseBody = err instanceof Error ? err.message : "Network error";
    status = "failed";
  }

  return db.createWebhookDelivery({
    webhookId: webhook.id,
    submissionId: submission.id,
    formId: submission.formId,
    requestUrl: webhook.url,
    signature,
    payload,
    responseStatus,
    responseBody,
    durationMs: Date.now() - started,
    status,
  });
}

function isSafeWebhookUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    if (parsed.username || parsed.password) {
      return false;
    }
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host === "::1" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe80") ||
      host.includes(":")
    ) {
      return false;
    }
    const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (ipv4) {
      const p = ipv4.slice(1).map(Number);
      if (
        p.some((n) => n > 255) ||
        p[0] === 10 ||
        p[0] === 127 ||
        p[0] === 0 ||
        (p[0] === 169 && p[1] === 254) ||
        (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
        (p[0] === 192 && p[1] === 168) ||
        (p[0] === 100 && p[1] >= 64 && p[1] <= 127)
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export async function dispatchWebhooks(params: {
  db: FormBeamDb;
  form: FormConfig;
  submission: SubmissionRecord;
  fetcher?: typeof fetch;
}): Promise<WebhookDelivery[]> {
  const webhooks = await params.db.listWebhooks(params.form.id);
  const enabled = webhooks.filter((w) => w.enabled);
  if (enabled.length === 0) return [];
  return Promise.all(
    enabled.map((webhook) =>
      deliverSingleWebhook({
        db: params.db,
        webhook,
        formSlug: params.form.slug,
        submission: params.submission,
        fetcher: params.fetcher,
      }),
    ),
  );
}
