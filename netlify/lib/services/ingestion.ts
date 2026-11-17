import type { FormBeamDb } from "../db";
import type { BlobStorage } from "../storage";
import { PLAN_LIMITS, type PlanTier } from "../types";
import { deliverLeadMagnet } from "./lead-magnet";
import { dispatchWebhooks } from "./webhooks";
import { pushSubmissionToIntegrations } from "./sync";

const MAX_FILES = 5;
const MAX_FILE_BYTES = 4 * 1024 * 1024; // Safe under Netlify 6 MB buffered payload ceiling

export interface ParsedFileUpload {
  fieldName: string;
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface ParsedFormPayload {
  fields: Record<string, unknown>;
  files: ParsedFileUpload[];
  nextRedirect: string | null;
}

export async function parseFormSubmissionRequest(
  req: Request,
): Promise<ParsedFormPayload> {
  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
  const fields: Record<string, unknown> = {};
  const files: ParsedFileUpload[] = [];

  if (contentType.includes("application/json")) {
    const raw = (await req.json()) as unknown;
    if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
      Object.assign(fields, raw);
    }
  } else if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") {
        fields[key] = value;
      } else if (value && typeof value === "object" && "arrayBuffer" in value) {
        const fileObj = value as File;
        if (fileObj.size === 0 && !fileObj.name) continue;
        if (files.length >= MAX_FILES) {
          throw new Error(`Maximum ${MAX_FILES} uploaded files per submission.`);
        }
        if (fileObj.size > MAX_FILE_BYTES) {
          throw new Error(`File "${fileObj.name}" exceeds 4 MB per-file upload limit.`);
        }
        const bytes = new Uint8Array(await fileObj.arrayBuffer());
        if (bytes.byteLength > 0) {
          files.push({
            fieldName: key,
            filename: fileObj.name || "upload.bin",
            mimeType: fileObj.type || "application/octet-stream",
            bytes,
          });
        }
      }
    }
  } else {
    const text = await req.text();
    const params = new URLSearchParams(text);
    for (const [key, value] of params.entries()) {
      fields[key] = value;
    }
  }

  const nextRedirect =
    typeof fields._next === "string" && fields._next.startsWith("http")
      ? fields._next
      : null;

  return { fields, files, nextRedirect };
}

function extractEmail(fields: Record<string, unknown>, preferredField: string): string | null {
  const candidates = [
    preferredField,
    "email",
    "Email",
    "EMAIL",
    "e-mail",
    "contact_email",
  ];
  for (const key of candidates) {
    const val = fields[key];
    if (typeof val === "string" && val.includes("@")) {
      return val.trim();
    }
  }
  return null;
}

function extractName(fields: Record<string, unknown>): string | null {
  for (const key of ["name", "Name", "full_name", "fullName"]) {
    const val = fields[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  const first = typeof fields.firstName === "string" ? fields.firstName.trim() : "";
  const last = typeof fields.lastName === "string" ? fields.lastName.trim() : "";
  if (first || last) return `${first} ${last}`.trim();
  return null;
}

export class IngestionHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function ingestFormSubmission(params: {
  db: FormBeamDb;
  blobs: BlobStorage;
  slug: string;
  req: Request;
  baseUrl: string;
  fetcher?: typeof fetch;
  envResendApiKey?: string;
  planLimitsOverride?: Record<PlanTier, number>;
}) {
  const { db, blobs, slug, req, baseUrl } = params;
  const form = await db.getFormBySlug(slug);
  if (!form) {
    throw new IngestionHttpError(404, `Form endpoint "/f/${slug}" not found.`);
  }

  const workspace = await db.getWorkspaceById(form.workspaceId);
  if (!workspace) {
    throw new IngestionHttpError(404, "Workspace not found.");
  }

  const originHeader = req.headers.get("origin");
  if (
    form.allowedOrigins &&
    form.allowedOrigins.trim() !== "*" &&
    originHeader
  ) {
    const allowed = form.allowedOrigins
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (allowed.length > 0 && !allowed.includes(originHeader)) {
      throw new IngestionHttpError(403, `Origin ${originHeader} is not allowed for this form.`);
    }
  }

  let parsed: ParsedFormPayload;
  try {
    parsed = await parseFormSubmissionRequest(req);
  } catch (err) {
    throw new IngestionHttpError(
      400,
      err instanceof Error ? err.message : "Invalid form submission payload",
    );
  }

  const honeypotName = form.honeypotField || "_gotcha";
  const honeypotValue = parsed.fields[honeypotName];
  const isSpam =
    typeof honeypotValue === "string" ? honeypotValue.trim().length > 0 : Boolean(honeypotValue);

  const limits = params.planLimitsOverride ?? PLAN_LIMITS;
  const monthlyLimit = limits[workspace.plan];

  if (!isSpam) {
    const used = await db.getMonthlySubmissionCount(workspace.id);
    if (used >= monthlyLimit) {
      throw new IngestionHttpError(
        429,
        `Monthly quota reached (${used}/${monthlyLimit} submissions on ${workspace.plan} plan). Upgrade to Pro ($9/mo for 10,000 submissions).`,
      );
    }
  }

  // Clean internal fields from stored payload while preserving visible fields
  const storedFields = { ...parsed.fields };
  delete storedFields._next;

  const submission = await db.createSubmission({
    formId: form.id,
    workspaceId: workspace.id,
    payload: storedFields,
    submitterEmail: extractEmail(storedFields, form.leadMagnetEmailField),
    submitterName: extractName(storedFields),
    isSpam,
    sourceOrigin: originHeader,
    ipAddress: req.headers.get("x-nf-client-connection-ip") ?? req.headers.get("x-forwarded-for"),
    userAgent: req.headers.get("user-agent"),
  });

  if (isSpam) {
    return {
      ok: true,
      spamFiltered: true,
      submissionId: submission.id,
      redirectUrl: parsed.nextRedirect ?? form.redirectUrl,
      leadMagnetUrl: null,
      discountCode: null,
      webhookDeliveries: [],
      syncResults: [],
    };
  }

  // Store uploaded attachments in Blob storage
  const savedFiles = [];
  for (const file of parsed.files) {
    const safeName = file.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const blobKey = `uploads/${form.id}/${submission.id}/${Date.now()}-${safeName}`;
    await blobs.put(blobKey, file.bytes, {
      contentType: file.mimeType,
      filename: file.filename,
    });
    const record = await db.createSubmissionFile({
      submissionId: submission.id,
      formId: form.id,
      fieldName: file.fieldName,
      filename: file.filename,
      mimeType: file.mimeType,
      sizeBytes: file.bytes.byteLength,
      blobKey,
    });
    savedFiles.push(record);
  }
  submission.files = savedFiles;

  // Execute built-in automations in parallel
  const [emailDelivery, webhookDeliveries, syncResults] = await Promise.all([
    deliverLeadMagnet({
      db,
      blobs,
      form,
      workspace,
      submission,
      baseUrl,
      fetcher: params.fetcher,
      envResendApiKey: params.envResendApiKey,
    }),
    dispatchWebhooks({
      db,
      form,
      submission,
      fetcher: params.fetcher,
    }),
    pushSubmissionToIntegrations({
      db,
      form,
      submission,
      fetcher: params.fetcher,
    }),
  ]);

  return {
    ok: true,
    spamFiltered: false,
    submissionId: submission.id,
    redirectUrl: parsed.nextRedirect ?? form.redirectUrl,
    leadMagnetUrl: emailDelivery
      ? `${baseUrl.replace(/\/$/, "")}/d/${emailDelivery.downloadToken}`
      : null,
    discountCode: emailDelivery?.discountCode ?? null,
    emailDelivery,
    webhookDeliveries,
    syncResults,
  };
}
