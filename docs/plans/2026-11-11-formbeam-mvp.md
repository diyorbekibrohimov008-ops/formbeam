# FormBeam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy **FormBeam**, a full-stack MVP serverless backend for static websites (Webflow, Hugo, Astro, Next.js) featuring 1,000 free monthly submissions ($9/mo Pro for 10,000), un-paywalled file uploads & HMAC-signed webhooks, built-in lead magnet PDF auto-delivery, and native two-way Google Sheets & Notion sync.

**Architecture:** Vite + React + TypeScript SPA frontend (`src/`) paired with Netlify Functions (`netlify/functions/api.mts` using Hono + `netlify/functions/sync-cron.mts`), backed by Netlify Database (`@netlify/database`, managed Postgres with SQL migrations in `netlify/database/migrations/`) and Netlify Blobs (`@netlify/blobs`) for uploaded submission attachments and downloadable lead-magnet PDFs. Railway was checked first (`create-project`) and rejected because the account's trial had expired; Vercel requires user plugin sign-in; Netlify is authenticated on a fresh Free-tier team (`islom-abdurasulov`) and runs 24/7 online for free.

**Tech Stack:** TypeScript, React 19, Vite, `@netlify/vite-plugin`, Tailwind CSS v4 (or Tailwind + clean custom CSS), Hono, Zod, `@netlify/functions`, `@netlify/database`, `@netlify/blobs`, Vitest + `@netlify/database-dev` (for local Postgres integration tests).

## Global Constraints
- Free tier: 1,000 non-spam submissions/month; Pro tier: $9/month for 10,000 submissions/month; Scale tier: $29/month for 100,000 submissions/month.
- File uploads and webhooks must NEVER be paywalled behind Pro/Scale tiers.
- Public form endpoint `POST /f/:slug` supports `multipart/form-data` (files), `application/x-www-form-urlencoded`, and `application/json`, with CORS enabled only on `/f/:slug` and `/d/:token`.
- Secrets must never appear in `netlify.toml` or `VITE_*` client env vars; read server env vars via `Netlify.env.get()` with test fallback.
- Instantiate `getDatabase()` once at module scope, never per request.
- Deploy preview first before `--prod` when provisioning Netlify Database.

## Review Focus
1. **Multipart File Upload & Binary Limits**: Enforcing max 4 MB per file / 5 files per submission and saving safely to Blob storage without corrupting binary bytes.
2. **Honeypot Spam Filtering**: Silently accepting bot submissions (`_gotcha` non-empty) as spam without incrementing monthly quota, sending lead magnets, firing webhooks, or syncing to Sheets/Notion.
3. **Monthly Quota Enforcement**: Counting only non-spam submissions in the current UTC month and returning `429` JSON (or friendly HTML) once limit is reached.
4. **Two-Way Sync Reconciliation**: Pulling remote edits from Notion/Google Sheets (or sandbox mirror) back into `submissions` when remote timestamp > local `updated_at`, pushing local edits out when local > remote, and logging audit events.
5. **Lead Magnet Delivery & Safe Templating**: Escaping user-supplied fields (`{{name}}`) in HTML emails while still issuing valid signed PDF download URLs (`/d/:token`) and gracefully falling back to persistent Outbox when no external Resend API key is configured.

---

### Task 1: Project Scaffolding, Dependencies & Netlify Config
- [ ] **Step 1**: Write `package.json`, `tsconfig.json`, `vite.config.ts`, `netlify.toml`, `.gitignore`, and `netlify/database/migrations/20261111153000_init.sql`.
- [ ] **Step 2**: Install runtime and dev dependencies via `npm install` (`BypassSandbox: true`).
- [ ] **Step 3**: Verify `npx tsc --noEmit` compiles cleanly.

### Task 2: Core Utilities & Real PDF Generator (`crypto`, `pdf`, `storage`, `types`)
- [ ] **Step 1**: Write failing unit tests in `tests/core.test.ts` for password hashing/verification, HMAC-SHA256 webhook signing, and valid `%PDF-1.4` binary generation.
- [ ] **Step 2**: Run `npx vitest run tests/core.test.ts` to verify failure.
- [ ] **Step 3**: Implement `netlify/lib/types.ts`, `netlify/lib/crypto.ts`, `netlify/lib/pdf.ts`, and `netlify/lib/storage.ts`.
- [ ] **Step 4**: Run `npx vitest run tests/core.test.ts` and verify PASS.

### Task 3: Database Repository & Demo Seed (`db`, `demo-seed`)
- [ ] **Step 1**: Write failing integration tests in `tests/db.test.ts` using `@netlify/database-dev` (`NetlifyDB`) applying `netlify/database/migrations/20261111153000_init.sql` and verifying workspace, form, submission, and quota queries.
- [ ] **Step 2**: Run `npx vitest run tests/db.test.ts` to verify failure.
- [ ] **Step 3**: Implement `netlify/lib/db.ts` and `netlify/lib/demo-seed.ts`.
- [ ] **Step 4**: Run `npx vitest run tests/db.test.ts` and verify PASS.

### Task 4: Backend Services (`ingestion`, `lead-magnet`, `webhooks`, `sync`) & Hono App (`app.ts`)
- [ ] **Step 1**: Write failing end-to-end API tests in `tests/api.test.ts` covering:
  - `POST /f/:slug` with JSON, URL-encoded, and multipart file upload
  - Honeypot spam capture (does not increment quota or fire lead magnet/webhooks)
  - Quota exhaustion (`429`) when hitting plan limit
  - Lead magnet PDF generation + Outbox email + `/d/:token` download
  - HMAC-signed webhook delivery + retry
  - Two-way sync outbound push + inbound pull conflict reconciliation
- [ ] **Step 2**: Run `npx vitest run tests/api.test.ts` to verify failure.
- [ ] **Step 3**: Implement `netlify/lib/services/ingestion.ts`, `netlify/lib/services/lead-magnet.ts`, `netlify/lib/services/webhooks.ts`, `netlify/lib/services/sync.ts`, `netlify/lib/app.ts`, `netlify/functions/api.mts`, and `netlify/functions/sync-cron.mts`.
- [ ] **Step 4**: Run full `npx vitest run` and verify all tests PASS.

### Task 5: Frontend UI (Landing Page + Live Tester + Switcher Calculator + Full Dashboard)
- [ ] **Step 1**: Configure Tailwind CSS & clean typography (`index.html`, `src/index.css`).
- [ ] **Step 2**: Implement `src/lib/api.ts` typed API client and `src/components/SnippetModal.tsx` (HTML, Next.js, Astro, Hugo, Webflow, Formspree/Basin migration converter).
- [ ] **Step 3**: Implement `src/pages/LandingPage.tsx` (Hero, Live Form Tester, Formspree/Basin Cost Calculator, Feature Matrix, 1-Click Demo / Sign-up).
- [ ] **Step 4**: Implement `src/pages/DashboardPage.tsx` (Forms sidebar, Submissions + Attachment Inspector, Lead Magnet Studio + Email Outbox Preview, Webhooks Manager + Delivery Logs, Two-Way Google Sheets & Notion Sync Split-Pane Workspace, Plan/Settings).
- [ ] **Step 5**: Wire `src/App.tsx` and `src/main.tsx`, run `npm run build` and `npx tsc --noEmit`.

### Task 6: Local End-to-End Verification & Live Netlify Deployment
- [ ] **Step 1**: Run full test suite (`npm test`) and production Vite build (`npm run build`).
- [ ] **Step 2**: Authenticate Netlify CLI (`netlify login`) and link/create site on `islom-abdurasulov` team.
- [ ] **Step 3**: Deploy preview first (`npx netlify deploy --build`) so Netlify Database provisions and migrations apply cleanly; check preview URL with `curl`.
- [ ] **Step 4**: Deploy production (`npx netlify deploy --build --prod`), set runtime secrets if needed, and verify live production endpoints (`/`, `/api/health`, `/api/auth/demo`, `POST /f/:slug`, `/d/:token`, `/api/forms/:id/sync/run`) against the live 24/7 HTTPS URL!
