import { createDemoPasswordHash, type FormBeamDb } from "./db";
import { randomToken, signHmacSha256 } from "./crypto";
import { generateLeadMagnetPdf } from "./pdf";
import type { BlobStorage } from "./storage";
import type { Workspace } from "./types";

const DEMO_EMAIL = "demo@formbeam.dev";

export async function ensureDemoWorkspace(
  db: FormBeamDb,
  blobs: BlobStorage,
): Promise<Workspace> {
  const existing = await db.getDemoWorkspace();
  if (existing) {
    // Ensure the default ebook-download form exists even if user deleted others
    const forms = await db.listForms(existing.id);
    const hasShowcase = forms.some((f) => f.slug === "ebook-download");
    if (hasShowcase) return existing;
  }

  let ws = existing;
  if (!ws) {
    try {
      ws = await db.createWorkspace({
        name: "StaticStack Studio (Demo)",
        email: DEMO_EMAIL,
        passwordHash: createDemoPasswordHash(),
        plan: "free",
        isDemo: true,
      });
    } catch {
      const found = await db.getWorkspaceByEmail(DEMO_EMAIL);
      if (!found) throw new Error("Failed to initialize demo workspace");
      ws = found.workspace;
    }
  }

  const existingForms = await db.listForms(ws.id);
  if (existingForms.some((f) => f.slug === "ebook-download")) {
    return ws;
  }

  // Generate & store real PDF whitepaper in Blob storage
  const pdfBlobKey = `lead-magnets/${ws.id}/static-stack-playbook.pdf`;
  const pdfBytes = generateLeadMagnetPdf({
    title: "The Static-Stack Lead Magnet Playbook",
    subtitle: "How to Ditch Formspree & Zapier on Webflow, Hugo, Astro & Next.js",
    discountCode: "BEAM20",
    lines: [
      "1. Swap your HTML form action URL to FormBeam and get 1,000 free submissions/mo.",
      "2. Accept file uploads and HMAC-signed webhooks without $30-$90/mo paywalls.",
      "3. Auto-attach whitepapers, PDFs, and discount codes directly on form POST.",
      "4. Keep Google Sheets and Notion databases synchronized bidirectionally.",
    ],
  });
  await blobs.put(pdfBlobKey, pdfBytes, {
    contentType: "application/pdf",
    filename: "static-stack-playbook.pdf",
  });

  // Form 1: Showcase Lead Magnet + Two-Way Sync + Webhook
  const ebookForm = await db.createForm({
    workspaceId: ws.id,
    name: "Playbook Lead Magnet",
    slug: "ebook-download",
    honeypotField: "_gotcha",
    leadMagnetEnabled: true,
    leadMagnetTitle: "The Static-Stack Lead Magnet Playbook",
    leadMagnetFilename: "static-stack-playbook.pdf",
    leadMagnetBlobKey: pdfBlobKey,
    leadMagnetMime: "application/pdf",
    leadMagnetDiscountCode: "BEAM20",
    leadMagnetEmailField: "email",
    leadMagnetSubject: "Your Static-Stack Playbook + {{discount_code}}, {{name}}",
    leadMagnetBody:
      "Hi {{name}},\n\nThanks for trying FormBeam! Download your PDF whitepaper here: {{download_url}}\n\nUse promo code {{discount_code}} anytime.",
  });

  // Form 2: Agency Intake with file upload
  const intakeForm = await db.createForm({
    workspaceId: ws.id,
    name: "Webflow Agency Intake",
    slug: "agency-intake",
    honeypotField: "_gotcha",
  });

  // Form 3: Astro Launch Waitlist
  await db.createForm({
    workspaceId: ws.id,
    name: "Astro Launch Waitlist",
    slug: "astro-waitlist",
    honeypotField: "_gotcha",
  });

  // Seed sample webhook + delivery log
  const wh = await db.createWebhook({
    formId: ebookForm.id,
    url: "https://hooks.slack.com/services/T000/B000/DEMO_ECHO",
  });

  const sub1 = await db.createSubmission({
    formId: ebookForm.id,
    workspaceId: ws.id,
    payload: {
      name: "Maya Chen",
      email: "maya@webflowcraft.co",
      company: "WebflowCraft",
      message: "Moving 12 client sites off Formspree Starter",
    },
    submitterEmail: "maya@webflowcraft.co",
    submitterName: "Maya Chen",
    status: "qualified",
    notes: "High-intent agency switcher (12 sites)",
    isSpam: false,
  });

  const sub2 = await db.createSubmission({
    formId: ebookForm.id,
    workspaceId: ws.id,
    payload: {
      name: "Jonas Berg",
      email: "jonas@hugo-docs.org",
      message: "Need Notion two-way sync for developer beta",
    },
    submitterEmail: "jonas@hugo-docs.org",
    submitterName: "Jonas Berg",
    status: "new",
    notes: "",
    isSpam: false,
  });

  await db.createSubmission({
    formId: ebookForm.id,
    workspaceId: ws.id,
    payload: {
      name: "SEO Bot",
      email: "bot@spam.invalid",
      _gotcha: "http://backlinks.invalid",
    },
    submitterEmail: "bot@spam.invalid",
    submitterName: "SEO Bot",
    isSpam: true,
  });

  // Seed file upload on intake form
  const briefBlobKey = `uploads/${intakeForm.id}/sample-brief.txt`;
  const briefBytes = new TextEncoder().encode(
    "Client: Northstar Robotics\nStack: Astro + Tailwind\nTarget launch: Dec 2026\nNeeds: Contact form + RFP PDF upload + Notion CRM sync.\n",
  );
  await blobs.put(briefBlobKey, briefBytes, {
    contentType: "text/plain",
    filename: "northstar-rfp-brief.txt",
  });
  const intakeSub = await db.createSubmission({
    formId: intakeForm.id,
    workspaceId: ws.id,
    payload: {
      name: "Elena Rostova",
      email: "elena@northstar.ai",
      budget: "$15k-$25k",
    },
    submitterEmail: "elena@northstar.ai",
    submitterName: "Elena Rostova",
    status: "contacted",
    notes: "Reviewed RFP attachment",
  });
  await db.createSubmissionFile({
    submissionId: intakeSub.id,
    formId: intakeForm.id,
    fieldName: "rfp_document",
    filename: "northstar-rfp-brief.txt",
    mimeType: "text/plain",
    sizeBytes: briefBytes.byteLength,
    blobKey: briefBlobKey,
  });

  // Seed webhook delivery log & outbox email
  const whPayload = {
    event: "submission.created",
    formSlug: ebookForm.slug,
    submissionId: sub1.id,
    data: sub1.payload,
  };
  await db.createWebhookDelivery({
    webhookId: wh.id,
    submissionId: sub1.id,
    formId: ebookForm.id,
    requestUrl: wh.url,
    signature: signHmacSha256(wh.secret, JSON.stringify(whPayload)),
    payload: whPayload,
    responseStatus: 200,
    responseBody: "{\"ok\":true}",
    durationMs: 42,
    status: "success",
  });

  const dlToken = randomToken(18);
  await db.createEmailDelivery({
    formId: ebookForm.id,
    submissionId: sub1.id,
    recipientEmail: "maya@webflowcraft.co",
    subject: "Your Static-Stack Playbook + BEAM20, Maya Chen",
    htmlBody: `<p>Hi Maya Chen,</p><p>Thanks for trying FormBeam! Download your PDF whitepaper: <a href="/d/${dlToken}">static-stack-playbook.pdf</a></p><p>Use promo code <strong>BEAM20</strong> anytime.</p>`,
    attachmentFilename: "static-stack-playbook.pdf",
    downloadToken: dlToken,
    discountCode: "BEAM20",
    transport: "outbox",
    status: "outbox_ready",
  });

  // Seed active Two-Way Google Sheets & Notion Sync connections + mirror rows
  const gsConn = await db.upsertSyncConnection({
    formId: ebookForm.id,
    provider: "google_sheets",
    enabled: true,
    mode: "sandbox",
    targetName: "Q4 Static Leads (Google Sheet)",
    fieldMapping: { email: "Email", name: "Full Name", status: "Status", notes: "Notes" },
  });
  const ntConn = await db.upsertSyncConnection({
    formId: ebookForm.id,
    provider: "notion",
    enabled: true,
    mode: "sandbox",
    targetName: "Agency Switcher CRM (Notion DB)",
    fieldMapping: { email: "Email", name: "Lead", status: "Stage", notes: "Notes" },
  });

  await db.upsertMirrorRow({
    connectionId: gsConn.id,
    submissionId: sub1.id,
    externalRecordId: "sheet_row_2",
    remoteStatus: "qualified",
    remoteNotes: "High-intent agency switcher (12 sites)",
    remoteData: { email: "maya@webflowcraft.co", name: "Maya Chen" },
  });
  await db.upsertMirrorRow({
    connectionId: ntConn.id,
    submissionId: sub2.id,
    externalRecordId: "notion_page_91a2",
    remoteStatus: "new",
    remoteNotes: "",
    remoteData: { email: "jonas@hugo-docs.org", name: "Jonas Berg" },
  });
  await db.updateSubmission(sub1.id, {
    remoteSheetRowId: "sheet_row_2",
    syncStatus: "synced",
  });
  await db.updateSubmission(sub2.id, {
    remoteNotionPageId: "notion_page_91a2",
    syncStatus: "synced",
  });
  await db.createSyncEvent({
    connectionId: gsConn.id,
    formId: ebookForm.id,
    direction: "outbound_push",
    summary: "Pushed Maya Chen (maya@webflowcraft.co) to Q4 Static Leads (Google Sheet)",
    details: { rowId: "sheet_row_2" },
  });
  await db.createSyncEvent({
    connectionId: ntConn.id,
    formId: ebookForm.id,
    direction: "outbound_push",
    summary: "Created Notion page for Jonas Berg (jonas@hugo-docs.org)",
    details: { pageId: "notion_page_91a2" },
  });

  return ws;
}
