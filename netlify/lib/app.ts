import { Hono, type Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import type { FormBeamDb } from "./db";
import {
  hashPassword,
  randomToken,
  signSessionCookie,
  verifyHmacSha256,
  verifyPassword,
  verifySessionCookie,
} from "./crypto";
import { ensureDemoWorkspace } from "./demo-seed";
import { generateLeadMagnetPdf } from "./pdf";
import { ingestFormSubmission, IngestionHttpError } from "./services/ingestion";
import { deliverSingleWebhook } from "./services/webhooks";
import { runTwoWaySyncForForm } from "./services/sync";
import type { BlobStorage } from "./storage";
import {
  PLAN_LIMITS,
  type PlanTier,
  type SubmissionStatus,
  type SyncMode,
  type SyncProvider,
  type Workspace,
} from "./types";

export interface AppDeps {
  db: FormBeamDb;
  blobs: BlobStorage;
  fetcher?: typeof fetch;
  getEnv: (key: string) => string | undefined;
  sessionSecret?: string;
  planLimitsOverride?: Record<PlanTier, number>;
}

const SESSION_COOKIE = "fb_session";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function csvCell(val: unknown): string {
  const s = typeof val === "string" ? val : JSON.stringify(val ?? "");
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

function getBaseUrl(req: Request): string {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

const EPHEMERAL_FALLBACK_SECRET = randomToken(32);

export function createApp(deps: AppDeps) {
  const { db, blobs } = deps;
  const app = new Hono();
  const limits = deps.planLimitsOverride ?? PLAN_LIMITS;

  const getSessionSecret = () =>
    deps.sessionSecret ||
    deps.getEnv("FORMBEAM_SESSION_SECRET") ||
    EPHEMERAL_FALLBACK_SECRET;

  async function serializeWorkspace(ws: Workspace) {
    const monthlyUsed = await db.getMonthlySubmissionCount(ws.id);
    return {
      id: ws.id,
      name: ws.name,
      email: ws.email,
      plan: ws.plan,
      fromEmail: ws.fromEmail,
      hasResendKey: Boolean(ws.resendApiKey),
      isDemo: ws.isDemo,
      monthlyUsed,
      monthlyLimit: limits[ws.plan],
    };
  }

  async function resolveAuthWorkspace(req: Request, c: Context) {
    const rawCookie = getCookie(c, SESSION_COOKIE);
    if (!rawCookie) return null;
    const token = verifySessionCookie(rawCookie, getSessionSecret());
    if (!token) return null;
    return db.getWorkspaceBySessionToken(token);
  }

  async function setSession(
    req: Request,
    c: Context,
    workspaceId: string,
  ) {
    const { token } = await db.createSession(workspaceId);
    const signed = signSessionCookie(token, getSessionSecret());
    const isHttps = getBaseUrl(req).startsWith("https://");
    setCookie(c, SESSION_COOKIE, signed, {
      httpOnly: true,
      path: "/",
      sameSite: "Lax",
      secure: isHttps,
      maxAge: 30 * 24 * 60 * 60,
    });
  }

  // Health
  app.get("/api/health", (c) => {
    return c.json({ ok: true, service: "formbeam", timestamp: new Date().toISOString() });
  });

  // Auth routes
  app.get("/api/auth/me", async (c) => {
    const ws = await resolveAuthWorkspace(c.req.raw, c);
    return c.json({ workspace: ws ? await serializeWorkspace(ws) : null });
  });

  app.post("/api/auth/demo", async (c) => {
    const ws = await ensureDemoWorkspace(db, blobs);
    await setSession(c.req.raw, c, ws.id);
    return c.json({ workspace: await serializeWorkspace(ws) });
  });

  app.post("/api/auth/register", async (c) => {
    const schema = z.object({
      name: z.string().min(2).max(80),
      email: z.string().email(),
      password: z.string().min(6).max(128),
    });
    const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
    }
    const existing = await db.getWorkspaceByEmail(parsed.data.email);
    if (existing) {
      return c.json({ error: "An account with that email already exists" }, 409);
    }
    const ws = await db.createWorkspace({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: hashPassword(parsed.data.password),
      plan: "free",
    });
    // Create a starter contact form automatically
    const defaultSlug = `contact-${randomToken(3)}`;
    await db.createForm({
      workspaceId: ws.id,
      name: "Contact Form",
      slug: defaultSlug,
      honeypotField: "_gotcha",
    });
    await setSession(c.req.raw, c, ws.id);
    return c.json({ workspace: await serializeWorkspace(ws) }, 201);
  });

  app.post("/api/auth/login", async (c) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    });
    const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Invalid credentials" }, 400);

    const found = await db.getWorkspaceByEmail(parsed.data.email);
    if (!found || !verifyPassword(parsed.data.password, found.passwordHash)) {
      return c.json({ error: "Invalid email or password" }, 401);
    }
    await setSession(c.req.raw, c, found.workspace.id);
    return c.json({ workspace: await serializeWorkspace(found.workspace) });
  });

  app.post("/api/auth/logout", async (c) => {
    const rawCookie = getCookie(c, SESSION_COOKIE);
    if (rawCookie) {
      const token = verifySessionCookie(rawCookie, getSessionSecret());
      if (token) await db.deleteSession(token);
    }
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  // Workspace update
  app.patch("/api/workspace", async (c) => {
    const ws = await resolveAuthWorkspace(c.req.raw, c);
    if (!ws) return c.json({ error: "Unauthorized" }, 401);
    const schema = z.object({
      name: z.string().min(2).max(80).optional(),
      plan: z.enum(["free", "pro", "scale"]).optional(),
      resendApiKey: z.string().nullable().optional(),
      fromEmail: z.string().nullable().optional(),
    });
    const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Invalid workspace patch" }, 400);
    const updated = await db.updateWorkspace(ws.id, parsed.data);
    return c.json({ workspace: await serializeWorkspace(updated) });
  });

  // Forms CRUD
  app.get("/api/forms", async (c) => {
    const ws = await resolveAuthWorkspace(c.req.raw, c);
    if (!ws) return c.json({ error: "Unauthorized" }, 401);
    const forms = await db.listForms(ws.id);
    return c.json({ forms });
  });

  app.post("/api/forms", async (c) => {
    const ws = await resolveAuthWorkspace(c.req.raw, c);
    if (!ws) return c.json({ error: "Unauthorized" }, 401);
    const schema = z.object({
      name: z.string().min(1).max(80),
      slug: z
        .string()
        .min(2)
        .max(64)
        .regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens"),
      honeypotField: z.string().min(1).max(40).optional(),
      redirectUrl: z.string().url().nullable().optional(),
      allowedOrigins: z.string().nullable().optional(),
      leadMagnetEnabled: z.boolean().optional(),
      leadMagnetTitle: z.string().nullable().optional(),
      leadMagnetDiscountCode: z.string().nullable().optional(),
      leadMagnetEmailField: z.string().optional(),
      leadMagnetSubject: z.string().nullable().optional(),
      leadMagnetBody: z.string().nullable().optional(),
    });
    const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid form input" }, 400);
    }
    const existingSlug = await db.getFormBySlug(parsed.data.slug);
    if (existingSlug) {
      return c.json({ error: `Slug "${parsed.data.slug}" is already taken` }, 409);
    }
    const form = await db.createForm({
      workspaceId: ws.id,
      ...parsed.data,
    });
    return c.json({ form }, 201);
  });

  app.patch("/api/forms/:id", async (c) => {
    const ws = await resolveAuthWorkspace(c.req.raw, c);
    if (!ws) return c.json({ error: "Unauthorized" }, 401);
    const form = await db.getFormById(c.req.param("id"));
    if (!form || form.workspaceId !== ws.id) return c.json({ error: "Form not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const updated = await db.updateForm(form.id, {
      name: typeof body.name === "string" ? body.name : undefined,
      honeypotField: typeof body.honeypotField === "string" ? body.honeypotField : undefined,
      redirectUrl:
        body.redirectUrl === null
          ? null
          : typeof body.redirectUrl === "string" && /^https?:\/\//i.test(body.redirectUrl)
            ? body.redirectUrl
            : undefined,
      allowedOrigins:
        body.allowedOrigins === null || typeof body.allowedOrigins === "string"
          ? body.allowedOrigins
          : undefined,
      leadMagnetEnabled:
        typeof body.leadMagnetEnabled === "boolean" ? body.leadMagnetEnabled : undefined,
      leadMagnetTitle:
        body.leadMagnetTitle === null || typeof body.leadMagnetTitle === "string"
          ? body.leadMagnetTitle
          : undefined,
      leadMagnetDiscountCode:
        body.leadMagnetDiscountCode === null || typeof body.leadMagnetDiscountCode === "string"
          ? body.leadMagnetDiscountCode
          : undefined,
      leadMagnetEmailField:
        typeof body.leadMagnetEmailField === "string" ? body.leadMagnetEmailField : undefined,
      leadMagnetSubject:
        body.leadMagnetSubject === null || typeof body.leadMagnetSubject === "string"
          ? body.leadMagnetSubject
          : undefined,
      leadMagnetBody:
        body.leadMagnetBody === null || typeof body.leadMagnetBody === "string"
          ? body.leadMagnetBody
          : undefined,
    });
    return c.json({ form: updated });
  });

  app.delete("/api/forms/:id", async (c) => {
    const ws = await resolveAuthWorkspace(c.req.raw, c);
    if (!ws) return c.json({ error: "Unauthorized" }, 401);
    const form = await db.getFormById(c.req.param("id"));
    if (!form || form.workspaceId !== ws.id) return c.json({ error: "Form not found" }, 404);
    await db.deleteForm(form.id);
    return c.json({ ok: true });
  });

  // Lead magnet file upload or on-demand PDF generation
  app.post("/api/forms/:id/lead-magnet-file", async (c) => {
    const ws = await resolveAuthWorkspace(c.req.raw, c);
    if (!ws) return c.json({ error: "Unauthorized" }, 401);
    const form = await db.getFormById(c.req.param("id"));
    if (!form || form.workspaceId !== ws.id) return c.json({ error: "Form not found" }, 404);

    const ct = (c.req.header("content-type") ?? "").toLowerCase();
    if (ct.includes("multipart/form-data")) {
      const fd = await c.req.formData();
      const file = fd.get("file");
      if (!file || typeof file === "string") {
        return c.json({ error: "Missing uploaded file" }, 400);
      }
      if (file.size > 4 * 1024 * 1024) {
        return c.json({ error: "File exceeds 4 MB limit" }, 400);
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const safeName = (file.name || "lead-magnet.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `lead-magnets/${ws.id}/${form.id}/${Date.now()}-${safeName}`;
      await blobs.put(key, bytes, {
        contentType: file.type || "application/octet-stream",
        filename: file.name || safeName,
      });
      const updated = await db.updateForm(form.id, {
        leadMagnetBlobKey: key,
        leadMagnetFilename: file.name || safeName,
        leadMagnetMime: file.type || "application/octet-stream",
        leadMagnetEnabled: true,
      });
      return c.json({ form: updated });
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      generateTitle?: string;
      discountCode?: string;
      bodyText?: string;
    };
    const title = body.generateTitle || form.leadMagnetTitle || `${form.name} Playbook`;
    const lines = (body.bodyText || "Delivered directly by FormBeam.")
      .split(/\r?\n/)
      .filter(Boolean);
    const pdfBytes = generateLeadMagnetPdf({
      title,
      subtitle: `Official guide from ${ws.name}`,
      discountCode: body.discountCode || form.leadMagnetDiscountCode || undefined,
      lines,
    });
    const filename = `${form.slug}-whitepaper.pdf`;
    const key = `lead-magnets/${ws.id}/${form.id}/${Date.now()}-${filename}`;
    await blobs.put(key, pdfBytes, { contentType: "application/pdf", filename });
    const updated = await db.updateForm(form.id, {
      leadMagnetTitle: title,
      leadMagnetBlobKey: key,
      leadMagnetFilename: filename,
      leadMagnetMime: "application/pdf",
      leadMagnetEnabled: true,
    });
    return c.json({ form: updated });
  });

  // Submissions & exports
  app.get("/api/forms/:id/submissions", async (c) => {
    const ws = await resolveAuthWorkspace(c.req.raw, c);
    if (!ws) return c.json({ error: "Unauthorized" }, 401);
    const form = await db.getFormById(c.req.param("id"));
    if (!form || form.workspaceId !== ws.id) return c.json({ error: "Form not found" }, 404);
    const submissions = await db.listSubmissions(form.id);
    return c.json({ submissions });
  });

  app.get("/api/forms/:id/export", async (c) => {
    const ws = await resolveAuthWorkspace(c.req.raw, c);
    if (!ws) return c.json({ error: "Unauthorized" }, 401);
    const form = await db.getFormById(c.req.param("id"));
    if (!form || form.workspaceId !== ws.id) return c.json({ error: "Form not found" }, 404);
    const submissions = (await db.listSubmissions(form.id)).filter((s) => !s.isSpam);
    const format = c.req.query("format") === "csv" ? "csv" : "json";

    if (format === "json") {
      return new Response(JSON.stringify(submissions, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${form.slug}-submissions.json"`,
        },
      });
    }

    const keys = new Set<string>();
    for (const s of submissions) {
      for (const k of Object.keys(s.payload)) keys.add(k);
    }
    const payloadCols = Array.from(keys);
    const header = ["id", "createdAt", "status", "notes", "email", "name", ...payloadCols];
    const rows = [header.map(csvCell).join(",")];
    for (const s of submissions) {
      rows.push(
        [
          s.id,
          s.createdAt,
          s.status,
          s.notes,
          s.submitterEmail ?? "",
          s.submitterName ?? "",
          ...payloadCols.map((k) => s.payload[k] ?? ""),
        ]
          .map(csvCell)
          .join(","),
      );
    }
    return new Response(rows.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${form.slug}-submissions.csv"`,
      },
    });
  });

  app.patch("/api/submissions/:id", async (c) => {
    const ws = await resolveAuthWorkspace(c.req.raw, c);
    if (!ws) return c.json({ error: "Unauthorized" }, 401);
    const sub = await db.getSubmissionById(c.req.param("id"));
    if (!sub || sub.workspaceId !== ws.id) return c.json({ error: "Submission not found" }, 404);
    const schema = z.object({
      status: z.enum(["new", "qualified", "contacted", "archived"]).optional(),
      notes: z.string().max(2000).optional(),
    });
    const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Invalid submission patch" }, 400);
    const updated = await db.updateSubmission(sub.id, {
      status: parsed.data.status as SubmissionStatus | undefined,
      notes: parsed.data.notes,
      syncStatus: "pending",
    });
    return c.json({ submission: updated });
  });

  app.delete("/api/submissions/:id", async (c) => {
    const ws = await resolveAuthWorkspace(c.req.raw, c);
    if (!ws) return c.json({ error: "Unauthorized" }, 401);
    const sub = await db.getSubmissionById(c.req.param("id"));
    if (!sub || sub.workspaceId !== ws.id) return c.json({ error: "Submission not found" }, 404);
    await db.deleteSubmission(sub.id);
    return c.json({ ok: true });
  });

  // Download uploaded submission attachment (authenticated workspace member)
  app.get("/api/files/:id", async (c) => {
    const ws = await resolveAuthWorkspace(c.req.raw, c);
    if (!ws) return c.json({ error: "Unauthorized" }, 401);
    const file = await db.getSubmissionFileById(c.req.param("id"));
    if (!file) return c.json({ error: "File not found" }, 404);
    const form = await db.getFormById(file.formId);
    if (!form || form.workspaceId !== ws.id) return c.json({ error: "Forbidden" }, 403);
    const blob = await blobs.get(file.blobKey);
    if (!blob) return c.json({ error: "Blob missing" }, 404);
    const bodyBuf = blob.data.buffer.slice(
      blob.data.byteOffset,
      blob.data.byteOffset + blob.data.byteLength,
    ) as ArrayBuffer;
    return new Response(bodyBuf, {
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${file.filename.replace(/"/g, "")}"`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  });

  // Webhooks
  app.get("/api/forms/:id/webhooks", async (c) => {
    const ws = await resolveAuthWorkspace(c.req.raw, c);
    if (!ws) return c.json({ error: "Unauthorized" }, 401);
    const form = await db.getFormById(c.req.param("id"));
    if (!form || form.workspaceId !== ws.id) return c.json({ error: "Form not found" }, 404);
    const [webhooks, deliveries] = await Promise.all([
      db.listWebhooks(form.id),
      db.listWebhookDeliveries(form.id),
    ]);
    return c.json({ webhooks, deliveries });
  });

  app.post("/api/forms/:id/webhooks", async (c) => {
    const ws = await resolveAuthWorkspace(c.req.raw, c);
    if (!ws) return c.json({ error: "Unauthorized" }, 401);
    const form = await db.getFormById(c.req.param("id"));
    if (!form || form.workspaceId !== ws.id) return c.json({ error: "Form not found" }, 404);
    const schema = z.object({ url: z.string().url() });
    const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Valid https:// webhook URL required" }, 400);
    const parsedWebhookUrl = (() => {
      try {
        const u = new URL(parsed.data.url);
        const h = u.hostname.toLowerCase();
        const isPrivate =
          h === "localhost" ||
          h.endsWith(".local") ||
          h.endsWith(".internal") ||
          /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
        return (u.protocol === "https:" || u.protocol === "http:") && !isPrivate ? u : null;
      } catch {
        return null;
      }
    })();
    if (!parsedWebhookUrl) {
      return c.json({ error: "Webhook URL must target a public https:// endpoint" }, 400);
    }
    const webhook = await db.createWebhook({ formId: form.id, url: parsed.data.url });
    return c.json({ webhook }, 201);
  });

  app.delete("/api/webhooks/:id", async (c) => {
    const ws = await resolveAuthWorkspace(c.req.raw, c);
    if (!ws) return c.json({ error: "Unauthorized" }, 401);
    const wh = await db.getWebhookById(c.req.param("id"));
    if (!wh) return c.json({ error: "Not found" }, 404);
    const form = await db.getFormById(wh.formId);
    if (!form || form.workspaceId !== ws.id) return c.json({ error: "Forbidden" }, 403);
    await db.deleteWebhook(wh.id);
    return c.json({ ok: true });
  });

  app.post("/api/webhook-deliveries/:id/retry", async (c) => {
    const ws = await resolveAuthWorkspace(c.req.raw, c);
    if (!ws) return c.json({ error: "Unauthorized" }, 401);
    const delivery = await db.getWebhookDeliveryById(c.req.param("id"));
    if (!delivery) return c.json({ error: "Delivery not found" }, 404);
    const form = await db.getFormById(delivery.formId);
    if (!form || form.workspaceId !== ws.id) return c.json({ error: "Forbidden" }, 403);
    const [wh, sub] = await Promise.all([
      db.getWebhookById(delivery.webhookId),
      db.getSubmissionById(delivery.submissionId),
    ]);
    if (!wh || !sub) return c.json({ error: "Webhook or submission missing" }, 404);
    const retried = await deliverSingleWebhook({
      db,
      webhook: wh,
      formSlug: form.slug,
      submission: sub,
      fetcher: deps.fetcher,
    });
    return c.json({ delivery: retried });
  });

  // Built-in HMAC-verifying Webhook Echo receiver for zero-setup testing
  app.post("/api/webhook-echo/:formId", async (c) => {
    const formId = c.req.param("formId");
    const rawBody = await c.req.text();
    const signature = c.req.header("X-FormBeam-Signature") ?? "";
    const webhooks = await db.listWebhooks(formId);
    const matched = webhooks.some((w) => verifyHmacSha256(w.secret, rawBody, signature));
    return c.json({
      received: true,
      formId,
      signatureVerified: matched,
      bytes: rawBody.length,
    });
  });

  // Lead magnet outbox
  app.get("/api/forms/:id/emails", async (c) => {
    const ws = await resolveAuthWorkspace(c.req.raw, c);
    if (!ws) return c.json({ error: "Unauthorized" }, 401);
    const form = await db.getFormById(c.req.param("id"));
    if (!form || form.workspaceId !== ws.id) return c.json({ error: "Form not found" }, 404);
    const emails = await db.listEmailDeliveries(form.id);
    return c.json({ emails });
  });

  // Two-Way Sync (Google Sheets & Notion)
  app.get("/api/forms/:id/sync", async (c) => {
    const ws = await resolveAuthWorkspace(c.req.raw, c);
    if (!ws) return c.json({ error: "Unauthorized" }, 401);
    const form = await db.getFormById(c.req.param("id"));
    if (!form || form.workspaceId !== ws.id) return c.json({ error: "Form not found" }, 404);
    const [connections, mirrorRows, events] = await Promise.all([
      db.listSyncConnections(form.id),
      db.listMirrorRows(form.id),
      db.listSyncEvents(form.id),
    ]);
    return c.json({
      connections: connections.map((conn) => ({
        id: conn.id,
        formId: conn.formId,
        provider: conn.provider,
        mode: conn.mode,
        enabled: conn.enabled,
        targetId: conn.targetId,
        targetName: conn.targetName,
        hasApiToken: Boolean(conn.apiToken),
        fieldMapping: conn.fieldMapping,
        lastSyncedAt: conn.lastSyncedAt,
        createdAt: conn.createdAt,
      })),
      mirrorRows,
      events,
    });
  });

  app.put("/api/forms/:id/sync/:provider", async (c) => {
    const ws = await resolveAuthWorkspace(c.req.raw, c);
    if (!ws) return c.json({ error: "Unauthorized" }, 401);
    const form = await db.getFormById(c.req.param("id"));
    if (!form || form.workspaceId !== ws.id) return c.json({ error: "Form not found" }, 404);
    const provider = c.req.param("provider");
    if (provider !== "google_sheets" && provider !== "notion") {
      return c.json({ error: "Unsupported sync provider" }, 400);
    }
    const schema = z.object({
      enabled: z.boolean(),
      mode: z.enum(["sandbox", "live_api"]),
      targetId: z.string().nullable().optional(),
      targetName: z.string().nullable().optional(),
      apiToken: z.string().nullable().optional(),
      fieldMapping: z.record(z.string(), z.string()).optional(),
    });
    const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Invalid sync config" }, 400);

    const conn = await db.upsertSyncConnection({
      formId: form.id,
      provider: provider as SyncProvider,
      enabled: parsed.data.enabled,
      mode: parsed.data.mode as SyncMode,
      targetId: parsed.data.targetId,
      targetName: parsed.data.targetName,
      apiToken: parsed.data.apiToken,
      fieldMapping: parsed.data.fieldMapping,
    });
    return c.json({
      connection: {
        ...conn,
        apiToken: undefined,
        hasApiToken: Boolean(conn.apiToken),
      },
    });
  });

  app.patch("/api/sync-mirror/:rowId", async (c) => {
    const ws = await resolveAuthWorkspace(c.req.raw, c);
    if (!ws) return c.json({ error: "Unauthorized" }, 401);
    const rowId = c.req.param("rowId");
    const owner = await db.getMirrorRowOwnerWorkspace(rowId);
    if (!owner || owner.workspaceId !== ws.id) return c.json({ error: "Mirror row not found" }, 404);
    const schema = z.object({
      remoteStatus: z.enum(["new", "qualified", "contacted", "archived"]).optional(),
      remoteNotes: z.string().max(2000).optional(),
    });
    const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Invalid mirror update" }, 400);
    const row = await db.updateMirrorRow(rowId, parsed.data);
    return c.json({ row });
  });

  app.post("/api/forms/:id/sync/run", async (c) => {
    const ws = await resolveAuthWorkspace(c.req.raw, c);
    if (!ws) return c.json({ error: "Unauthorized" }, 401);
    const form = await db.getFormById(c.req.param("id"));
    if (!form || form.workspaceId !== ws.id) return c.json({ error: "Form not found" }, 404);
    const result = await runTwoWaySyncForForm({
      db,
      formId: form.id,
      fetcher: deps.fetcher,
    });
    return c.json(result);
  });

  // Public Lead Magnet Download Endpoint (CORS open)
  app.get("/d/:token", async (c) => {
    const delivery = await db.getEmailDeliveryByToken(c.req.param("token"));
    if (!delivery) return c.text("Download link expired or invalid", 404);
    const form = await db.getFormById(delivery.formId);
    if (!form || !form.leadMagnetBlobKey) return c.text("Asset not found", 404);
    const blob = await blobs.get(form.leadMagnetBlobKey);
    if (!blob) return c.text("Stored file missing", 404);
    const bodyBuf = blob.data.buffer.slice(
      blob.data.byteOffset,
      blob.data.byteOffset + blob.data.byteLength,
    ) as ArrayBuffer;
    const fname = (delivery.attachmentFilename || form.leadMagnetFilename || "lead-magnet.pdf").replace(/"/g, "");
    return new Response(bodyBuf, {
      status: 200,
      headers: {
        "Content-Type": form.leadMagnetMime || blob.metadata.contentType || "application/pdf",
        "Content-Disposition": `attachment; filename="${fname}"`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
        "Access-Control-Allow-Origin": "*",
      },
    });
  });

  // Public Static Form Ingestion Endpoint (/f/:slug) — CORS enabled explicitly for static sites!
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, X-Requested-With",
  };

  app.options("/f/:slug", (c) => {
    return new Response(null, { status: 204, headers: corsHeaders });
  });

  app.get("/f/:slug", async (c) => {
    const slug = c.req.param("slug");
    if (slug === "ebook-download" || slug === "agency-intake" || slug === "astro-waitlist") {
      await ensureDemoWorkspace(db, blobs);
    }
    const form = await db.getFormBySlug(slug);
    if (!form) return c.json({ ok: false, error: "Endpoint not found" }, 404, corsHeaders);
    return c.json(
      {
        ok: true,
        endpoint: `/f/${form.slug}`,
        method: "POST",
        accepts: ["application/json", "application/x-www-form-urlencoded", "multipart/form-data"],
        honeypotField: form.honeypotField,
        leadMagnetEnabled: form.leadMagnetEnabled,
      },
      200,
      corsHeaders,
    );
  });

  app.post("/f/:slug", async (c) => {
    const slug = c.req.param("slug");
    if (slug === "ebook-download" || slug === "agency-intake" || slug === "astro-waitlist") {
      const existing = await db.getFormBySlug(slug);
      if (!existing) await ensureDemoWorkspace(db, blobs);
    }

    const baseUrl = getBaseUrl(c.req.raw);
    const accept = (c.req.header("accept") ?? "").toLowerCase();
    const ct = (c.req.header("content-type") ?? "").toLowerCase();
    const wantsJson =
      accept.includes("application/json") ||
      ct.includes("application/json") ||
      c.req.header("x-requested-with") === "XMLHttpRequest";

    try {
      const result = await ingestFormSubmission({
        db,
        blobs,
        slug,
        req: c.req.raw,
        baseUrl,
        fetcher: deps.fetcher,
        envResendApiKey: deps.getEnv("RESEND_API_KEY"),
        planLimitsOverride: limits,
      });

      if (wantsJson) {
        return c.json(
          {
            ok: true,
            submissionId: result.submissionId,
            spamFiltered: result.spamFiltered,
            leadMagnetUrl: result.leadMagnetUrl,
            discountCode: result.discountCode,
            webhookDeliveries: result.webhookDeliveries.map((w) => ({
              url: w.requestUrl,
              status: w.status,
              responseStatus: w.responseStatus,
              signature: w.signature,
            })),
            syncResults: result.syncResults,
          },
          result.spamFiltered ? 200 : 201,
          corsHeaders,
        );
      }

      if (result.redirectUrl && /^https?:\/\//i.test(result.redirectUrl)) {
        return new Response(null, {
          status: 303,
          headers: { ...corsHeaders, Location: result.redirectUrl },
        });
      }

      const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Submission Received — FormBeam</title>
<style>body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;max-width:460px;width:100%;box-shadow:0 10px 25px rgba(15,23,42,.06)}
.btn{display:inline-block;margin-top:16px;background:#059669;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;font-size:14px}
.code{background:#ecfdf5;color:#065f46;padding:4px 8px;border-radius:6px;font-family:monospace;font-weight:700}</style>
</head><body><div class="card">
<h1 style="margin:0 0 8px;font-size:22px">Submission received</h1>
<p style="margin:0;color:#475569;font-size:14px">Thanks! Your response was recorded cleanly by FormBeam.</p>
${
  result.leadMagnetUrl
    ? `<div style="margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0">
<p style="margin:0 0 8px;font-size:14px;font-weight:600">Your Lead Magnet is ready:</p>
${result.discountCode ? `<p style="margin:0 0 8px;font-size:13px">Discount code: <span class="code">${escapeHtml(result.discountCode)}</span></p>` : ""}
<a class="btn" href="${escapeHtml(result.leadMagnetUrl)}">Download PDF</a></div>`
    : ""
}
<p style="margin-top:20px"><a href="/" style="font-size:13px;color:#059669;text-decoration:none">← Back to FormBeam</a></p>
</div></body></html>`;
      return new Response(html, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
      });
    } catch (err) {
      if (err instanceof IngestionHttpError) {
        if (wantsJson) {
          return c.json({ ok: false, error: err.message }, err.status as 400 | 403 | 404 | 429, corsHeaders);
        }
        return new Response(`<h1>Error ${err.status}</h1><p>${escapeHtml(err.message)}</p>`, {
          status: err.status,
          headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
        });
      }
      const message = err instanceof Error ? err.message : "Internal Server Error";
      return c.json({ ok: false, error: message }, 500, corsHeaders);
    }
  });

  return app;
}
