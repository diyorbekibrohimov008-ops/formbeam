# FormBeam ⚡

> **Serverless Backends for Static Forms** — Built-in lead magnet delivery, un-paywalled webhooks, multipart file uploads, and native two-way spreadsheet sync for Webflow, Astro, Hugo, Next.js, and static websites.

[![Netlify Status](https://api.netlify.com/api/v1/badges/f9dcf0d3-7c26-4d7b-ad48-dcefc64eaace/deploy-status)](https://app.netlify.com/projects/formbeam/deploys)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Hono](https://img.shields.io/badge/Hono-API-E36002?logo=hono&logoColor=white)](https://hono.dev/)

**Live Production App:** [https://formbeam.netlify.app](https://formbeam.netlify.app)

---

## 🚀 Why FormBeam?

Static site creators using **Formspree** or **Basin** quickly hit painful walls:
1. **Aggressive Quotas:** Formspree's free tier gives just 50 submissions/mo, and $15/mo provides only 200 submissions ($0.075/submission).
2. **Paywalled Webhooks & Storage:** File uploads and third-party webhooks require $30–$90/month tiers.
3. **No Native Automation:** Sending lead magnet whitepapers or syncing with Google Sheets requires external Zapier or Mailchimp subscriptions.

**FormBeam wins on developer ergonomics and pricing:**
- 🎁 **1,000 free submissions/month** on the Free tier. Paid tiers start at **$9/month for 10,000 submissions** (10x cheaper).
- 🔓 **Un-paywalled Webhooks & File Storage:** HMAC-SHA256 signed webhooks and multipart file uploads included on every tier.
- 📄 **Built-in Lead Magnet Delivery:** Auto-generate whitepaper PDFs on-the-fly and dispatch personalized emails with download links and discount codes without Mailchimp.
- 🔄 **Native Two-Way Spreadsheet Sync:** Push submissions directly to Google Sheets and Notion databases out of the box, with audit trails and conflict resolution.
- 🛡️ **Honeypot Spam Filtering:** Block bot spam automatically without counting against your monthly quota.

---

## 🛠️ Tech Stack & Architecture

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Vite
- **Serverless API:** Hono web framework running on Netlify Functions (`api.mts`)
- **Database:** Netlify Database (managed serverless Postgres via `@netlify/database`)
- **Storage:** Netlify Blobs for persistent file uploads and lead magnets
- **Background Cron:** Netlify Scheduled Functions running two-way sync on 15-minute cycles (`sync-cron.mts`)
- **Testing:** Vitest with in-memory PG integration tests (`@netlify/database-dev`)

---

## 📋 Drop-In Integration Snippets

### Standard HTML Form
```html
<form action="https://formbeam.netlify.app/f/your-form-slug" method="POST" enctype="multipart/form-data">
  <!-- Anti-spam Honeypot -->
  <input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off" />
  
  <label>Your Name: <input type="text" name="name" required /></label>
  <label>Email Address: <input type="email" name="email" required /></label>
  <label>Attachment: <input type="file" name="attachment" /></label>
  
  <!-- Optional redirect URL -->
  <input type="hidden" name="_next" value="https://mysite.com/thank-you" />
  
  <button type="submit">Submit</button>
</form>
```

### Next.js / React (Client Action)
```tsx
const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  const formData = new FormData(e.currentTarget);
  
  const res = await fetch("https://formbeam.netlify.app/f/your-form-slug", {
    method: "POST",
    headers: { Accept: "application/json" },
    body: formData,
  });
  
  const data = await res.json();
  if (res.ok) {
    console.log("Submission ID:", data.submissionId);
    if (data.leadMagnetUrl) {
      window.location.href = data.leadMagnetUrl;
    }
  }
};
```

### Astro Component
```astro
---
// src/components/ContactForm.astro
---
<form id="contact-form" class="space-y-4">
  <input type="text" name="_gotcha" class="hidden" />
  <input type="text" name="name" placeholder="Name" required class="input" />
  <input type="email" name="email" placeholder="Email" required class="input" />
  <button type="submit" class="btn">Send</button>
</form>

<script>
  const form = document.getElementById("contact-form") as HTMLFormElement;
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const res = await fetch("https://formbeam.netlify.app/f/your-form-slug", {
      method: "POST",
      headers: { Accept: "application/json" },
      body: new FormData(form),
    });
    if (res.ok) alert("Thanks for submitting!");
  });
</script>
```

---

## ⚡ API Reference

### Public Endpoints
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/f/:slug` | Ingest form submission (JSON, URL-encoded, or Multipart) |
| `OPTIONS`| `/f/:slug` | CORS preflight for browser clients |
| `GET` | `/d/:token` | Stream generated whitepaper PDF lead magnet |
| `GET` | `/api/health` | Service health status check |

### Dashboard & Management Endpoints (Session Cookie Protected)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/demo` | One-click instant interactive demo workspace |
| `GET` | `/api/forms` | List workspace forms with quota telemetry |
| `POST` | `/api/forms` | Create a new form endpoint |
| `GET` | `/api/forms/:id/submissions` | Retrieve submissions with attachments |
| `GET` | `/api/forms/:id/sync` | View Google Sheets & Notion sync status |
| `POST` | `/api/forms/:id/sync/run` | Trigger immediate bidirectional sync |
| `POST` | `/api/forms/:id/webhooks` | Register HMAC-SHA256 signed webhook |

---

## 🧪 Testing & Verification

FormBeam includes a test suite covering cryptography, PDF generation, database repository queries, and Hono API routing:

```bash
# Run unit and integration tests
npm test

# Typecheck codebase
npm run typecheck

# Build production bundle
npm run build
```

---

## 📦 Deployment to Netlify

FormBeam is designed for Netlify's modern serverless primitive stack:

1. Link your Netlify site:
   ```bash
   netlify link
   ```
2. Set the session secret:
   ```bash
   netlify env:set FORMBEAM_SESSION_SECRET <your-random-32-byte-hex> --context production --secret
   ```
3. Deploy preview (provisions Netlify Database and applies migrations):
   ```bash
   netlify deploy --context deploy-preview
   ```
4. Deploy to production:
   ```bash
   netlify deploy --prod --context production
   ```

---

## 📄 License

MIT License. Built with ❤️ for the modern static web.
