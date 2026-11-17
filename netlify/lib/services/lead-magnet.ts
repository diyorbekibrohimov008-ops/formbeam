import type { FormBeamDb } from "../db";
import { randomToken } from "../crypto";
import { generateLeadMagnetPdf } from "../pdf";
import type { BlobStorage } from "../storage";
import type { EmailDelivery, FormConfig, SubmissionRecord, Workspace } from "../types";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    return vars[key] ?? "";
  });
}

export async function deliverLeadMagnet(params: {
  db: FormBeamDb;
  blobs: BlobStorage;
  form: FormConfig;
  workspace: Workspace;
  submission: SubmissionRecord;
  baseUrl: string;
  fetcher?: typeof fetch;
  envResendApiKey?: string;
}): Promise<EmailDelivery | null> {
  const { db, blobs, form, workspace, submission, baseUrl } = params;
  if (!form.leadMagnetEnabled) return null;

  const emailField = form.leadMagnetEmailField || "email";
  const rawRecipient =
    submission.payload[emailField] ??
    submission.submitterEmail ??
    submission.payload.email;
  const recipientEmail = typeof rawRecipient === "string" ? rawRecipient.trim() : "";
  if (!recipientEmail || !recipientEmail.includes("@")) {
    return null;
  }

  // Ensure a downloadable asset exists in Blob storage
  let blobKey = form.leadMagnetBlobKey;
  let filename = form.leadMagnetFilename ?? "lead-magnet.pdf";
  let mimeType = form.leadMagnetMime ?? "application/pdf";

  if (!blobKey || !(await blobs.get(blobKey))) {
    const title = form.leadMagnetTitle ?? `${form.name} Guide`;
    const pdf = generateLeadMagnetPdf({
      title,
      subtitle: `Prepared for ${submission.submitterName || recipientEmail}`,
      discountCode: form.leadMagnetDiscountCode ?? undefined,
      lines: [
        `Thank you for submitting ${form.name}.`,
        "Your requested whitepaper and resources are ready below.",
      ],
    });
    blobKey = `lead-magnets/${form.workspaceId}/${form.id}/auto-guide.pdf`;
    filename = `${form.slug}-guide.pdf`;
    mimeType = "application/pdf";
    await blobs.put(blobKey, pdf, { contentType: mimeType, filename });
    await db.updateForm(form.id, {
      leadMagnetBlobKey: blobKey,
      leadMagnetFilename: filename,
      leadMagnetMime: mimeType,
    });
  }

  const downloadToken = randomToken(18);
  const downloadUrl = `${baseUrl.replace(/\/$/, "")}/d/${downloadToken}`;
  const discountCode = form.leadMagnetDiscountCode ?? "";
  const name = submission.submitterName || "there";

  const plainVars = {
    name,
    email: recipientEmail,
    discount_code: discountCode,
    download_url: downloadUrl,
    form_name: form.name,
  };

  const subject = interpolate(
    form.leadMagnetSubject || "Your download from {{form_name}}",
    plainVars,
  );

  const rawBody =
    form.leadMagnetBody ||
    "Hi {{name}},\n\nYour requested file is ready: {{download_url}}\n\nDiscount code: {{discount_code}}";

  const safeVars: Record<string, string> = {
    name: escapeHtml(name),
    email: escapeHtml(recipientEmail),
    discount_code: discountCode
      ? `<strong style="background:#ecfdf5;color:#065f46;padding:2px 6px;border-radius:4px;">${escapeHtml(discountCode)}</strong>`
      : "",
    download_url: `<a href="${escapeHtml(downloadUrl)}" style="color:#059669;font-weight:600;">Download ${escapeHtml(filename)}</a>`,
    form_name: escapeHtml(form.name),
  };
  const htmlContent = interpolate(escapeHtml(rawBody), safeVars).replace(/\n/g, "<br/>");
  const htmlBody = `<div style="font-family:sans-serif;line-height:1.6;color:#0f172a;">${htmlContent}</div>`;

  const resendKey = workspace.resendApiKey || params.envResendApiKey;
  let transport: "resend" | "outbox" = "outbox";
  let status: "sent" | "outbox_ready" | "failed" = "outbox_ready";
  let providerMessageId: string | null = null;
  let errorMessage: string | null = null;

  if (resendKey) {
    transport = "resend";
    try {
      const fetcher = params.fetcher ?? fetch;
      const asset = await blobs.get(blobKey);
      const attachments = asset
        ? [
            {
              filename,
              content: Buffer.from(asset.data).toString("base64"),
            },
          ]
        : [];

      const res = await fetcher("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: workspace.fromEmail || "FormBeam <onboarding@resend.dev>",
          to: [recipientEmail],
          subject,
          html: htmlBody,
          attachments,
        }),
        signal: AbortSignal.timeout(8000),
      });
      const resText = await res.text();
      if (res.ok) {
        status = "sent";
        try {
          const parsed = JSON.parse(resText) as { id?: string };
          providerMessageId = parsed.id ?? null;
        } catch {
          providerMessageId = null;
        }
      } else {
        status = "failed";
        errorMessage = `Resend HTTP ${res.status}: ${resText.slice(0, 240)}`;
      }
    } catch (err) {
      status = "failed";
      errorMessage = err instanceof Error ? err.message : "Email transport error";
    }
  }

  return db.createEmailDelivery({
    formId: form.id,
    submissionId: submission.id,
    recipientEmail,
    subject,
    htmlBody,
    attachmentFilename: filename,
    downloadToken,
    discountCode: discountCode || null,
    transport,
    status,
    providerMessageId,
    errorMessage,
  });
}
