import { useState } from "react";
import { Check, Copy, ArrowRightLeft } from "lucide-react";

type FrameworkKey = "html" | "nextjs" | "astro" | "hugo" | "webflow" | "curl";

interface SnippetPanelProps {
  endpointUrl: string;
  honeypotField: string;
  leadMagnetEnabled?: boolean;
}

export function SnippetPanel({
  endpointUrl,
  honeypotField,
  leadMagnetEnabled,
}: SnippetPanelProps) {
  const [tab, setTab] = useState<FrameworkKey>("html");
  const [copied, setCopied] = useState(false);
  const [legacyUrl, setLegacyUrl] = useState("https://formspree.io/f/xqkrabcd");

  const snippets: Record<FrameworkKey, string> = {
    html: `<form action="${endpointUrl}" method="POST" enctype="multipart/form-data">
  <input type="text" name="name" placeholder="Jane Doe" required />
  <input type="email" name="email" placeholder="jane@company.com" required />
  <input type="file" name="attachment" />
  <!-- Built-in honeypot spam shield (hidden from humans) -->
  <input type="text" name="${honeypotField}" style="display:none" tabindex="-1" autocomplete="off" />
  <button type="submit">${leadMagnetEnabled ? "Send & Get PDF Guide" : "Submit"}</button>
</form>`,
    nextjs: `"use client";
import { useState } from "react";

export function ContactForm() {
  const [status, setStatus] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = await fetch("${endpointUrl}", {
      method: "POST",
      headers: { Accept: "application/json" },
      body: new FormData(e.currentTarget),
    });
    const data = await res.json();
    setStatus(data.ok ? "Sent! Check your inbox." : data.error);
  }

  return (
    <form onSubmit={onSubmit}>
      <input name="name" required />
      <input name="email" type="email" required />
      <input name="brief" type="file" />
      <input name="${honeypotField}" className="hidden" tabIndex={-1} />
      <button type="submit">Submit</button>
      {status && <p>{status}</p>}
    </form>
  );
}`,
    astro: `---
// src/components/LeadForm.astro
---
<form id="fb-form" action="${endpointUrl}" method="POST" enctype="multipart/form-data">
  <input type="text" name="name" required />
  <input type="email" name="email" required />
  <input type="file" name="upload" />
  <input type="text" name="${honeypotField}" hidden tabindex="-1" />
  <button type="submit">Send</button>
</form>`,
    hugo: `<!-- layouts/shortcodes/formbeam.html -->
<form action="${endpointUrl}" method="POST" enctype="multipart/form-data">
  <input type="text" name="name" placeholder="Name" required />
  <input type="email" name="email" placeholder="Email" required />
  <input type="hidden" name="_next" value="{{ .Site.BaseURL }}thank-you/" />
  <input type="text" name="${honeypotField}" style="display:none" />
  <button type="submit">Submit</button>
</form>`,
    webflow: `1. Open Webflow Designer -> Select your Form Block
2. Open Element Settings (D) -> Form Settings
3. Set Action: ${endpointUrl}
4. Set Method: POST
5. Optional: Add hidden Embed field <input type="text" name="${honeypotField}" style="display:none">
6. Publish — file uploads, webhooks, lead magnets & Sheets/Notion sync work instantly.`,
    curl: `curl -X POST "${endpointUrl}" \\
  -H "Accept: application/json" \\
  -F "name=Ada Lovelace" \\
  -F "email=ada@analyticalengine.dev" \\
  -F "company=Lovelace Computing"`,
  };

  const detectedLegacy = legacyUrl.includes("formspree.io")
    ? "Formspree"
    : legacyUrl.includes("usebasin.com")
      ? "Basin"
      : "Legacy Endpoint";

  const copyCode = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-950 text-slate-100 overflow-hidden shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-2.5 bg-slate-900/70">
          <div className="flex flex-wrap items-center gap-1">
            {(["html", "nextjs", "astro", "hugo", "webflow", "curl"] as FrameworkKey[]).map(
              (k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium uppercase tracking-wide transition ${
                    tab === k
                      ? "bg-emerald-500 text-slate-950 font-semibold"
                      : "text-slate-400 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  {k}
                </button>
              ),
            )}
          </div>
          <button
            type="button"
            onClick={() => copyCode(snippets[tab])}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700 transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy snippet"}
          </button>
        </div>
        <pre className="p-4 text-xs leading-relaxed overflow-x-auto font-mono text-emerald-100/95">
          <code>{snippets[tab]}</code>
        </pre>
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-800 mb-2">
          <ArrowRightLeft className="w-3.5 h-3.5" />
          1-Click Formspree / Basin Drop-in Migrator
        </div>
        <div className="grid gap-2 md:grid-cols-[1fr_auto_1fr] items-center">
          <input
            type="url"
            value={legacyUrl}
            onChange={(e) => setLegacyUrl(e.target.value)}
            placeholder="Paste https://formspree.io/f/... or https://usebasin.com/f/..."
            className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <span className="text-xs font-medium text-emerald-800 text-center px-2">
            Replace {detectedLegacy} →
          </span>
          <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 py-2">
            <code className="text-xs font-mono text-emerald-700 truncate flex-1">{endpointUrl}</code>
            <button
              type="button"
              onClick={() => copyCode(endpointUrl)}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 shrink-0"
            >
              Copy URL
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
