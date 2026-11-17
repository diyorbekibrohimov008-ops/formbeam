import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NetlifyDB } from "@netlify/database-dev";
import { Pool } from "pg";
import { createFormBeamDb } from "../netlify/lib/db";
import { createMemoryBlobStorage } from "../netlify/lib/storage";
import { ensureDemoWorkspace } from "../netlify/lib/demo-seed";

let pgDev: NetlifyDB;
let pool: Pool;

beforeAll(async () => {
  pgDev = new NetlifyDB();
  const connectionString = await pgDev.start();
  await pgDev.applyMigrations("./netlify/database/migrations");
  pool = new Pool({ connectionString });
}, 60_000);

afterAll(async () => {
  await pool?.end();
  await pgDev?.stop();
});

describe("FormBeam Postgres repository & demo seed", () => {
  it("creates workspaces, forms, and accurately counts non-spam monthly usage", async () => {
    const db = createFormBeamDb(pool);
    const ws = await db.createWorkspace({
      name: "Acme Static",
      email: "founder@acme.dev",
      passwordHash: "hash_placeholder",
      plan: "free",
      isDemo: false,
    });
    expect(ws.plan).toBe("free");

    const form = await db.createForm({
      workspaceId: ws.id,
      name: "Contact Us",
      slug: "acme-contact",
      honeypotField: "_gotcha",
    });
    expect(form.slug).toBe("acme-contact");

    await db.createSubmission({
      formId: form.id,
      workspaceId: ws.id,
      payload: { name: "Ada", email: "ada@example.com" },
      submitterEmail: "ada@example.com",
      submitterName: "Ada",
      isSpam: false,
    });
    await db.createSubmission({
      formId: form.id,
      workspaceId: ws.id,
      payload: { name: "Bot", _gotcha: "http://spam.test" },
      submitterEmail: null,
      submitterName: "Bot",
      isSpam: true,
    });

    const usage = await db.getMonthlySubmissionCount(ws.id);
    expect(usage).toBe(1);
  });

  it("idempotently seeds the demo workspace with forms, PDF blob, webhooks, and sync rows", async () => {
    const db = createFormBeamDb(pool);
    const blobs = createMemoryBlobStorage();

    const first = await ensureDemoWorkspace(db, blobs);
    const second = await ensureDemoWorkspace(db, blobs);
    expect(first.id).toBe(second.id);

    const forms = await db.listForms(first.id);
    expect(forms.length).toBeGreaterThanOrEqual(3);

    const leadForm = forms.find((f) => f.leadMagnetEnabled);
    expect(leadForm).toBeDefined();
    expect(leadForm?.leadMagnetBlobKey).toBeTruthy();

    const pdfBlob = await blobs.get(leadForm!.leadMagnetBlobKey!);
    expect(pdfBlob).not.toBeNull();
    expect(new TextDecoder().decode(pdfBlob!.data).startsWith("%PDF-1.4")).toBe(true);
  });
});
