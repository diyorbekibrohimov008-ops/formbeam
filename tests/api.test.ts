import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NetlifyDB } from "@netlify/database-dev";
import { Pool } from "pg";
import { createFormBeamDb } from "../netlify/lib/db";
import { createMemoryBlobStorage } from "../netlify/lib/storage";
import { createApp } from "../netlify/lib/app";
import { verifyHmacSha256 } from "../netlify/lib/crypto";

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

describe("FormBeam end-to-end API", () => {
  it("handles signup, form creation, multipart upload, honeypot, lead magnet PDF, HMAC webhooks, and two-way sync", async () => {
    const db = createFormBeamDb(pool);
    const blobs = createMemoryBlobStorage();

    const capturedWebhooks: Array<{ url: string; body: string; signature: string }> = [];
    const mockFetcher: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const body = typeof init?.body === "string" ? init.body : "";
      const headers = new Headers(init?.headers);
      const signature = headers.get("X-FormBeam-Signature") ?? "";
      capturedWebhooks.push({ url, body, signature });
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const app = createApp({
      db,
      blobs,
      fetcher: mockFetcher,
      getEnv: () => undefined,
      sessionSecret: "test-session-secret-32-chars-minimum",
    });

    // 1. Register workspace
    const regRes = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Indie Studio",
        email: "team@indie.dev",
        password: "password1234",
      }),
    });
    expect(regRes.status).toBe(201);
    const cookie = regRes.headers.get("set-cookie")?.split(";")[0] ?? "";
    expect(cookie).toContain("fb_session=");

    // 2. Create form with lead magnet
    const formRes = await app.request("/api/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        name: "Astro Launch Waitlist",
        slug: "astro-launch",
        honeypotField: "_gotcha",
        leadMagnetEnabled: true,
        leadMagnetTitle: "2026 Static Speed Checklist",
        leadMagnetDiscountCode: "STATIC25",
        leadMagnetSubject: "Your checklist + 25% off, {{name}}",
        leadMagnetBody: "Hi {{name}}, download your guide at {{download_url}} and use code {{discount_code}}.",
      }),
    });
    expect(formRes.status).toBe(201);
    const { form } = (await formRes.json()) as { form: { id: string; slug: string } };
    expect(form.slug).toBe("astro-launch");

    // 3. Add webhook (included free!)
    const whRes = await app.request(`/api/forms/${form.id}/webhooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ url: "https://hooks.example.test/leads" }),
    });
    expect(whRes.status).toBe(201);
    const { webhook } = (await whRes.json()) as { webhook: { secret: string } };

    // 4. Enable Google Sheets & Notion sandbox connections
    const sheetsCfg = await app.request(`/api/forms/${form.id}/sync/google_sheets`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        enabled: true,
        mode: "sandbox",
        targetName: "Astro Leads Sheet",
      }),
    });
    expect(sheetsCfg.status).toBe(200);

    // 5. Submit multipart form with file upload
    const fd = new FormData();
    fd.append("name", "Grace Hopper");
    fd.append("email", "grace@compiler.org");
    fd.append("company", "Cobol Labs");
    fd.append("brief", new File(["Project brief contents"], "brief.txt", { type: "text/plain" }));

    const subRes = await app.request(`/f/${form.slug}`, {
      method: "POST",
      headers: { Accept: "application/json", Origin: "https://astro-site.example" },
      body: fd,
    });
    expect(subRes.status).toBe(201);
    expect(subRes.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const subJson = (await subRes.json()) as {
      ok: boolean;
      submissionId: string;
      leadMagnetUrl: string | null;
    };
    expect(subJson.ok).toBe(true);
    expect(subJson.leadMagnetUrl).toContain("/d/");

    // 6. Verify HMAC webhook fired
    expect(capturedWebhooks).toHaveLength(1);
    expect(capturedWebhooks[0].url).toBe("https://hooks.example.test/leads");
    expect(
      verifyHmacSha256(webhook.secret, capturedWebhooks[0].body, capturedWebhooks[0].signature),
    ).toBe(true);

    // 7. Download Lead Magnet PDF via /d/:token
    const pdfPath = new URL(subJson.leadMagnetUrl!, "http://localhost").pathname;
    const pdfRes = await app.request(pdfPath);
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers.get("Content-Type")).toContain("application/pdf");
    const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());
    expect(new TextDecoder().decode(pdfBytes).startsWith("%PDF-1.4")).toBe(true);

    // 8. Verify uploaded attachment download
    const listRes = await app.request(`/api/forms/${form.id}/submissions`, {
      headers: { Cookie: cookie },
    });
    const listData = (await listRes.json()) as {
      submissions: Array<{ id: string; status: string; files: Array<{ id: string; filename: string }> }>;
    };
    expect(listData.submissions).toHaveLength(1);
    expect(listData.submissions[0].files[0].filename).toBe("brief.txt");

    const fileRes = await app.request(`/api/files/${listData.submissions[0].files[0].id}`, {
      headers: { Cookie: cookie },
    });
    expect(fileRes.status).toBe(200);
    expect(await fileRes.text()).toBe("Project brief contents");

    // 9. Honeypot spam submission must NOT fire webhooks or increment non-spam count
    const spamRes = await app.request(`/f/${form.slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        name: "Spammer",
        email: "bot@spam.invalid",
        _gotcha: "http://buy-links.invalid",
      }),
    });
    expect(spamRes.status).toBe(200);
    expect(capturedWebhooks).toHaveLength(1); // unchanged

    // 10. Two-way sync: edit mirror row in Google Sheet and run bidirectional sync
    const syncStateRes = await app.request(`/api/forms/${form.id}/sync`, {
      headers: { Cookie: cookie },
    });
    const syncState = (await syncStateRes.json()) as {
      mirrorRows: Array<{ id: string; submissionId: string }>;
    };
    expect(syncState.mirrorRows).toHaveLength(1);

    const patchMirror = await app.request(`/api/sync-mirror/${syncState.mirrorRows[0].id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        remoteStatus: "qualified",
        remoteNotes: "Edited directly inside Google Sheet",
      }),
    });
    expect(patchMirror.status).toBe(200);

    const runSync = await app.request(`/api/forms/${form.id}/sync/run`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(runSync.status).toBe(200);

    const afterSyncList = await app.request(`/api/forms/${form.id}/submissions`, {
      headers: { Cookie: cookie },
    });
    const afterSyncJson = (await afterSyncList.json()) as {
      submissions: Array<{ status: string; notes: string; isSpam: boolean }>;
    };
    const realSub = afterSyncJson.submissions.find((s) => !s.isSpam);
    expect(realSub?.status).toBe("qualified");
    expect(realSub?.notes).toBe("Edited directly inside Google Sheet");
  });

  it("enforces monthly submission quota limit on free tier", async () => {
    const db = createFormBeamDb(pool);
    const blobs = createMemoryBlobStorage();
    const app = createApp({
      db,
      blobs,
      getEnv: () => undefined,
      sessionSecret: "test-session-secret-32-chars-minimum",
      planLimitsOverride: { free: 2, pro: 10000, scale: 100000 },
    });

    const reg = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Quota Test",
        email: "quota@test.dev",
        password: "password1234",
      }),
    });
    const cookie = reg.headers.get("set-cookie")?.split(";")[0] ?? "";
    const formRes = await app.request("/api/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ name: "Quota Form", slug: "quota-form" }),
    });
    expect(formRes.status).toBe(201);

    for (let i = 0; i < 2; i++) {
      const ok = await app.request("/f/quota-form", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({ email: `u${i}@test.dev` }).toString(),
      });
      expect(ok.status).toBe(201);
    }

    const blocked = await app.request("/f/quota-form", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: "overflow@test.dev" }),
    });
    expect(blocked.status).toBe(429);
  });
});
