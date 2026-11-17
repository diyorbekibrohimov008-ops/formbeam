import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  FileDown,
  FileUp,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Table2,
  Webhook,
  Zap,
} from "lucide-react";
import { api } from "../lib/api";
import { SnippetPanel } from "../components/SnippetPanel";
import type { WorkspaceDto } from "../lib/types";

interface LandingPageProps {
  workspace: WorkspaceDto | null;
  onEnterApp: (ws: WorkspaceDto) => void;
}

interface LiveTestResult {
  ok: boolean;
  status: number;
  submissionId?: string;
  spamFiltered?: boolean;
  leadMagnetUrl?: string | null;
  discountCode?: string | null;
  webhookDeliveries?: Array<{ url: string; status: string; responseStatus: number | null; signature: string }>;
  syncResults?: Array<{ provider: string; direction: string; summary: string }>;
  error?: string;
}

export function LandingPage({ workspace, onEnterApp }: LandingPageProps) {
  const [monthlyVolume, setMonthlyVolume] = useState(1500);
  const [authMode, setAuthMode] = useState<"register" | "login" | null>(null);
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [loadingDemo, setLoadingDemo] = useState(false);

  // Live endpoint tester state
  const [testName, setTestName] = useState("Ada Lovelace");
  const [testEmail, setTestEmail] = useState("ada@analytical.dev");
  const [testNotes, setTestNotes] = useState("Migrating 4 Astro marketing forms off Formspree");
  const [testFile, setTestFile] = useState<File | null>(null);
  const [simulateSpam, setSimulateSpam] = useState(false);
  const [submittingTest, setSubmittingTest] = useState(false);
  const [testResult, setTestResult] = useState<LiveTestResult | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://formbeam.netlify.app";
  const demoEndpoint = `${origin}/f/ebook-download`;

  // Pricing calculation
  const formbeamPrice =
    monthlyVolume <= 1000 ? 0 : monthlyVolume <= 10000 ? 9 : 29;
  const formspreePrice =
    monthlyVolume <= 50
      ? 0
      : monthlyVolume <= 200
        ? 15
        : monthlyVolume <= 1000
          ? 30
          : monthlyVolume <= 5000
            ? 50
            : 90;
  const zapierAddon = 20;
  const formspreeWithAutomation = formspreePrice + zapierAddon;
  const annualSavings = Math.max(0, (formspreeWithAutomation - formbeamPrice) * 12);

  const handleLaunchDemo = async () => {
    setLoadingDemo(true);
    try {
      const { workspace: ws } = await api.launchDemo();
      onEnterApp(ws);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to launch demo");
    } finally {
      setLoadingDemo(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      const res =
        authMode === "register"
          ? await api.register({ name: authName, email: authEmail, password: authPassword })
          : await api.login({ email: authEmail, password: authPassword });
      setAuthMode(null);
      onEnterApp(res.workspace);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Authentication failed");
    }
  };

  const handleLiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingTest(true);
    setTestResult(null);
    try {
      const fd = new FormData();
      fd.append("name", testName);
      fd.append("email", testEmail);
      fd.append("message", testNotes);
      if (testFile) {
        fd.append("attachment", testFile);
      }
      if (simulateSpam) {
        fd.append("_gotcha", "https://spam-bot.invalid");
      }
      const res = await fetch("/f/ebook-download", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: fd,
      });
      const json = (await res.json()) as LiveTestResult;
      setTestResult({ ...json, status: res.status });
    } catch (err) {
      setTestResult({
        ok: false,
        status: 500,
        error: err instanceof Error ? err.message : "Submission failed",
      });
    } finally {
      setSubmittingTest(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-emerald-400">
              <Zap className="h-4 w-4" />
            </div>
            <span className="text-lg font-bold tracking-tight">FormBeam</span>
            <span className="hidden rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 sm:inline-block">
              1,000 Free / mo
            </span>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
            <a href="#live-tester" className="hover:text-slate-950">Live Endpoint</a>
            <a href="#calculator" className="hover:text-slate-950">Formspree Calculator</a>
            <a href="#features" className="hover:text-slate-950">Why Switch</a>
          </nav>
          <div className="flex items-center gap-2.5">
            {workspace ? (
              <button
                type="button"
                onClick={() => onEnterApp(workspace)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
              >
                Open Dashboard <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setAuthError(null);
                    setAuthMode("login");
                  }}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={handleLaunchDemo}
                  disabled={loadingDemo}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60 transition"
                >
                  {loadingDemo ? "Booting Demo…" : "Launch Live Demo"}
                  <ArrowRight className="h-4 w-4 text-emerald-400" />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero + Live Interactive Tester */}
      <section className="mx-auto max-w-6xl px-4 pt-12 pb-16 sm:px-6 lg:pt-16">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 mb-5">
              <Sparkles className="h-3.5 w-3.5" />
              Built for Webflow, Hugo, Astro &amp; Next.js static sites
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-950 sm:text-5xl leading-[1.08]">
              Serverless backends for static forms—
              <span className="text-emerald-600">20x the quota</span>, zero Zapier tax.
            </h1>
            <p className="mt-5 text-lg text-slate-600 leading-relaxed max-w-xl">
              Stop paying Formspree $15/month for 200 submissions or $30–$90 just to unlock file
              uploads and webhooks. FormBeam gives you <strong>1,000 free submissions/month</strong>,
              built-in <strong>PDF lead-magnet delivery</strong>, and{" "}
              <strong>native two-way Google Sheets &amp; Notion sync</strong> out of the box.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleLaunchDemo}
                disabled={loadingDemo}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
              >
                {loadingDemo ? "Loading Demo Workspace…" : "Open Preloaded Demo Dashboard"}
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthError(null);
                  setAuthMode("register");
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition"
              >
                Create Free Account (1,000/mo)
              </button>
            </div>

            <div className="mt-8 grid grid-cols-3 gap-4 border-t border-slate-200 pt-6">
              <div>
                <div className="text-2xl font-bold text-slate-950">1,000</div>
                <div className="text-xs text-slate-500">Free submissions/mo (vs 50)</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-950">$9<span className="text-sm font-medium text-slate-500">/mo</span></div>
                <div className="text-xs text-slate-500">10,000 submissions ($0.0009/sub)</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-950">$0</div>
                <div className="text-xs text-slate-500">File uploads, webhooks &amp; sync</div>
              </div>
            </div>
          </div>

          {/* Interactive Live Endpoint Tester */}
          <div
            id="live-tester"
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/60"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  Live Production Sandbox
                </div>
                <h2 className="text-base font-bold text-slate-950">
                  Test a real POST with File + Lead Magnet + Sync
                </h2>
              </div>
              <span className="rounded-md bg-slate-900 px-2 py-1 font-mono text-[11px] text-emerald-400">
                POST /f/ebook-download
              </span>
            </div>

            <form onSubmit={handleLiveSubmit} className="space-y-3.5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Name</label>
                  <input
                    type="text"
                    required
                    value={testName}
                    onChange={(e) => setTestName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Project Notes</label>
                <input
                  type="text"
                  value={testNotes}
                  onChange={(e) => setTestNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3.5 py-2.5">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
                  <FileUp className="h-4 w-4 text-emerald-600" />
                  <span>{testFile ? testFile.name : "Attach a file (Free on all tiers)"}</span>
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => setTestFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={simulateSpam}
                    onChange={(e) => setSimulateSpam(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  Test honeypot bot filter
                </label>
              </div>
              <button
                type="submit"
                disabled={submittingTest}
                className="w-full rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 transition"
              >
                {submittingTest
                  ? "Submitting to FormBeam Backend..."
                  : "Send Live POST Request"}
              </button>
            </form>

            {testResult && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-950 p-4 text-xs text-slate-100 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold text-emerald-400">
                    HTTP {testResult.status} {testResult.ok ? "OK" : "ERROR"}
                  </span>
                  {testResult.spamFiltered ? (
                    <span className="rounded bg-amber-500/20 px-2 py-0.5 text-amber-300 font-medium">
                      Honeypot Spam Shielded (0 quota used)
                    </span>
                  ) : (
                    <span className="font-mono text-slate-400">{testResult.submissionId}</span>
                  )}
                </div>
                {testResult.error && <p className="text-rose-400">{testResult.error}</p>}
                {testResult.leadMagnetUrl && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-950/70 border border-emerald-700/50 px-3 py-2">
                    <div>
                      <div className="font-semibold text-emerald-300">
                        Lead Magnet Auto-Delivered
                      </div>
                      <div className="text-slate-300">
                        Discount Code: <code className="text-amber-300">{testResult.discountCode}</code>
                      </div>
                    </div>
                    <a
                      href={testResult.leadMagnetUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-500 px-2.5 py-1.5 font-semibold text-slate-950 hover:bg-emerald-400"
                    >
                      <FileDown className="h-3.5 w-3.5" /> Download PDF
                    </a>
                  </div>
                )}
                {testResult.webhookDeliveries && testResult.webhookDeliveries.length > 0 && (
                  <div className="text-slate-300 font-mono text-[11px]">
                    Webhook: {testResult.webhookDeliveries[0].status.toUpperCase()} ({testResult.webhookDeliveries[0].responseStatus}) · {testResult.webhookDeliveries[0].signature.slice(0, 24)}...
                  </div>
                )}
                {testResult.syncResults && testResult.syncResults.length > 0 && (
                  <div className="text-slate-300 text-[11px]">
                    Two-Way Sync: {testResult.syncResults.map((s) => `${s.provider} (${s.summary})`).join(" · ")}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleLaunchDemo}
                  className="text-emerald-400 hover:underline font-medium pt-1 inline-flex items-center gap-1"
                >
                  Inspect full payload, outbox email &amp; two-way sync in Dashboard <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Formspree & Basin Savings Calculator */}
      <section id="calculator" className="border-y border-slate-200 bg-white py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
              Compare your monthly static-form bill
            </h2>
            <p className="mt-2 text-slate-600">
              Incumbents throttle free plans to 50 submissions and charge $30–$90/mo for uploads
              and webhooks—before adding Zapier to sync Google Sheets or send lead magnets.
            </p>
          </div>

          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div>
                <div className="text-sm font-medium text-slate-600">Monthly form submissions</div>
                <div className="text-3xl font-extrabold text-slate-950">
                  {monthlyVolume.toLocaleString()} <span className="text-base font-normal text-slate-500">submissions/mo</span>
                </div>
              </div>
              <div className="rounded-xl bg-emerald-600 px-4 py-2.5 text-white">
                <div className="text-xs uppercase tracking-wider text-emerald-100">Annual Savings</div>
                <div className="text-2xl font-bold">${annualSavings}/yr saved</div>
              </div>
            </div>

            <input
              type="range"
              min={50}
              max={15000}
              step={50}
              value={monthlyVolume}
              onChange={(e) => setMonthlyVolume(Number(e.target.value))}
              className="w-full accent-emerald-600 cursor-pointer"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1 mb-8 font-mono">
              <span>50</span>
              <span>1,000 (Free)</span>
              <span>5,000</span>
              <span>10,000 ($9/mo)</span>
              <span>15,000</span>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border-2 border-emerald-500 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-950">FormBeam</span>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                    Recommended
                  </span>
                </div>
                <div className="mt-3 text-3xl font-extrabold text-slate-950">
                  ${formbeamPrice}<span className="text-sm font-normal text-slate-500">/mo</span>
                </div>
                <ul className="mt-4 space-y-2 text-xs text-slate-700">
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> 1,000 free / $9 for 10,000</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> File uploads &amp; webhooks included</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Built-in PDF lead magnets</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Native two-way Sheets &amp; Notion</li>
                </ul>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="font-bold text-slate-900">Formspree + Zapier</div>
                <div className="mt-3 text-3xl font-extrabold text-slate-900">
                  ${formspreeWithAutomation}<span className="text-sm font-normal text-slate-500">/mo</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  ${formspreePrice}/mo Formspree + ~${zapierAddon}/mo Zapier for Sheets &amp; Mailchimp
                </p>
                <ul className="mt-4 space-y-2 text-xs text-slate-600">
                  <li>• Only 50 free submissions/mo</li>
                  <li>• $15/mo buys only 200 submissions ($0.075/ea)</li>
                  <li>• Uploads &amp; webhooks locked at $30–$90/mo</li>
                  <li>• No native PDF autoresponder or Notion sync</li>
                </ul>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="font-bold text-slate-900">Basin + External Tools</div>
                <div className="mt-3 text-3xl font-extrabold text-slate-900">
                  $19–$49+<span className="text-sm font-normal text-slate-500">/mo</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Requires third-party ESP &amp; automation glue
                </p>
                <ul className="mt-4 space-y-2 text-xs text-slate-600">
                  <li>• No native two-way Notion/Sheets sync</li>
                  <li>• Lead magnet attachments need external ESP</li>
                  <li>• Extra automation maintenance overhead</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Differentiators */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="mb-3 inline-flex rounded-xl bg-emerald-50 p-2.5 text-emerald-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-slate-950">20x Free Quota</h3>
            <p className="mt-1.5 text-sm text-slate-600">
              1,000 real submissions/month free. Pro is $9/month for 10,000—with honeypot spam
              silently excluded from your quota.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="mb-3 inline-flex rounded-xl bg-emerald-50 p-2.5 text-emerald-700">
              <Webhook className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-slate-950">Free Uploads &amp; Webhooks</h3>
            <p className="mt-1.5 text-sm text-slate-600">
              Accept `multipart/form-data` attachments and deliver HMAC-SHA256 signed JSON webhooks
              with 1-click retries on every plan.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="mb-3 inline-flex rounded-xl bg-emerald-50 p-2.5 text-emerald-700">
              <Mail className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-slate-950">Lead Magnet Delivery</h3>
            <p className="mt-1.5 text-sm text-slate-600">
              Upload a PDF whitepaper or generate one on the fly, attach a discount code, and
              auto-deliver on submit without Mailchimp.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="mb-3 inline-flex rounded-xl bg-emerald-50 p-2.5 text-emerald-700">
              <div className="flex items-center gap-1">
                <Table2 className="h-5 w-5" />
                <RefreshCw className="h-3.5 w-3.5" />
              </div>
            </div>
            <h3 className="font-bold text-slate-950">Two-Way Sheets &amp; Notion</h3>
            <p className="mt-1.5 text-sm text-slate-600">
              Push new leads directly to Google Sheets and Notion databases, and pull status/note
              edits right back into FormBeam.
            </p>
          </div>
        </div>

        {/* Drop-in Snippet Preview */}
        <div className="mt-12 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <h3 className="text-xl font-bold text-slate-950 mb-1">
            Swap one `action=` attribute in 10 seconds
          </h3>
          <p className="text-sm text-slate-600 mb-5">
            Works with plain HTML, Next.js, Astro, Hugo, and Webflow without SDK lock-in.
          </p>
          <SnippetPanel endpointUrl={demoEndpoint} honeypotField="_gotcha" leadMagnetEnabled />
        </div>
      </section>

      {/* Auth Modal */}
      {authMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm overscroll-contain">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl overscroll-contain">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-950">
                {authMode === "register" ? "Create your free FormBeam workspace" : "Sign in to FormBeam"}
              </h3>
              <button
                type="button"
                onClick={() => setAuthMode(null)}
                aria-label="Close modal"
                className="text-sm text-slate-500 hover:text-slate-700 rounded p-1"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAuthSubmit} className="space-y-3.5">
              {authMode === "register" && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Workspace Name</label>
                  <input
                    type="text"
                    required
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    placeholder="Acme Static Sites"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="you@domain.com"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              {authError && (
                <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{authError}</div>
              )}
              <button
                type="submit"
                className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                {authMode === "register" ? "Create Free Workspace (1,000/mo)" : "Sign In"}
              </button>
            </form>
            <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
              <button
                type="button"
                onClick={() => setAuthMode(authMode === "register" ? "login" : "register")}
                className="text-emerald-700 font-medium hover:underline"
              >
                {authMode === "register" ? "Already have an account? Sign in" : "Need an account? Sign up free"}
              </button>
              <button
                type="button"
                onClick={handleLaunchDemo}
                className="text-slate-700 font-medium hover:underline"
              >
                Or launch demo →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
