import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Copy,
  Download,
  FileDown,
  FileText,
  Globe,
  Layers,
  LogOut,
  Mail,
  Plus,
  RefreshCw,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  Table2,
  Trash2,
  Upload,
  Webhook,
  Zap,
} from "lucide-react";
import { api } from "../lib/api";
import { SnippetPanel } from "../components/SnippetPanel";
import {
  PLAN_LIMITS,
  PLAN_PRICES,
  type EmailDeliveryDto,
  type FormDto,
  type PlanTier,
  type SubmissionDto,
  type SubmissionStatus,
  type SyncConnectionDto,
  type SyncEventDto,
  type SyncMirrorRowDto,
  type SyncMode,
  type SyncProvider,
  type WebhookDeliveryDto,
  type WebhookDto,
  type WorkspaceDto,
} from "../lib/types";

type ActiveTab = "submissions" | "setup" | "lead-magnet" | "webhooks" | "sync";

interface DashboardPageProps {
  workspace: WorkspaceDto;
  onWorkspaceChange: (ws: WorkspaceDto | null) => void;
  onBackHome: () => void;
}

export function DashboardPage({
  workspace,
  onWorkspaceChange,
  onBackHome,
}: DashboardPageProps) {
  const [forms, setForms] = useState<FormDto[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("submissions");
  const [loadingForms, setLoadingForms] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Per-form tab data
  const [submissions, setSubmissions] = useState<SubmissionDto[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookDto[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryDto[]>([]);
  const [emails, setEmails] = useState<EmailDeliveryDto[]>([]);
  const [syncConnections, setSyncConnections] = useState<SyncConnectionDto[]>([]);
  const [mirrorRows, setMirrorRows] = useState<SyncMirrorRowDto[]>([]);
  const [syncEvents, setSyncEvents] = useState<SyncEventDto[]>([]);

  // Filters & local drafts
  const [searchQuery, setSearchQuery] = useState("");
  const [spamFilter, setSpamFilter] = useState<"all" | "clean" | "spam">("clean");
  const [copiedSlug, setCopiedSlug] = useState(false);

  // Modals
  const [showNewForm, setShowNewForm] = useState(false);
  const [newFormName, setNewFormName] = useState("");
  const [newFormSlug, setNewFormSlug] = useState("");

  const [showSettings, setShowSettings] = useState(false);
  const [settingsPlan, setSettingsPlan] = useState<PlanTier>(workspace.plan);
  const [settingsResendKey, setSettingsResendKey] = useState("");
  const [settingsFromEmail, setSettingsFromEmail] = useState(workspace.fromEmail ?? "");

  const [showTestDrawer, setShowTestDrawer] = useState(false);
  const [testName, setTestName] = useState("Linus Torvalds");
  const [testEmail, setTestEmail] = useState("linus@kernel.example");
  const [testMessage, setTestMessage] = useState("Testing multipart upload + lead magnet + two-way sync");
  const [testFile, setTestFile] = useState<File | null>(null);
  const [testSpam, setTestSpam] = useState(false);

  // Form settings / Lead Magnet drafts
  const selectedForm = forms.find((f) => f.id === selectedFormId) ?? null;
  const [lmEnabled, setLmEnabled] = useState(false);
  const [lmTitle, setLmTitle] = useState("");
  const [lmDiscount, setLmDiscount] = useState("");
  const [lmSubject, setLmSubject] = useState("");
  const [lmBody, setLmBody] = useState("");
  const [lmEmailField, setLmEmailField] = useState("email");
  const [lmCustomBodyText, setLmCustomBodyText] = useState(
    "Thanks for downloading our guide!\nUse your exclusive code inside to save 20% on your first project.",
  );
  const [setupHoneypot, setSetupHoneypot] = useState("_gotcha");
  const [setupRedirect, setSetupRedirect] = useState("");
  const [setupOrigins, setSetupOrigins] = useState("*");

  // Webhook creator
  const [newWebhookUrl, setNewWebhookUrl] = useState("");

  // Sync drafts
  const [mirrorDrafts, setMirrorDrafts] = useState<
    Record<string, { status: SubmissionStatus; notes: string }>
  >({});
  const [subDrafts, setSubDrafts] = useState<
    Record<string, { status: SubmissionStatus; notes: string }>
  >({});
  const [syncTokens, setSyncTokens] = useState<Record<SyncProvider, string>>({
    google_sheets: "",
    notion: "",
  });
  const [syncTargets, setSyncTargets] = useState<
    Record<SyncProvider, { enabled: boolean; mode: SyncMode; targetId: string; targetName: string }>
  >({
    google_sheets: { enabled: false, mode: "sandbox", targetId: "", targetName: "FormBeam Leads Sheet" },
    notion: { enabled: false, mode: "sandbox", targetId: "", targetName: "FormBeam Notion CRM" },
  });

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }, []);

  const refreshWorkspace = useCallback(async () => {
    const { workspace: ws } = await api.getMe();
    if (ws) onWorkspaceChange(ws);
  }, [onWorkspaceChange]);

  const loadForms = useCallback(async () => {
    setLoadingForms(true);
    try {
      const { forms: list } = await api.listForms();
      setForms(list);
      setSelectedFormId((prev) =>
        prev && list.some((f) => f.id === prev) ? prev : list[0]?.id ?? null,
      );
    } finally {
      setLoadingForms(false);
    }
  }, []);

  const loadFormDetails = useCallback(async (formId: string) => {
    const [subRes, whRes, emailRes, syncRes] = await Promise.all([
      api.listSubmissions(formId),
      api.listWebhooks(formId),
      api.listEmails(formId),
      api.getSyncState(formId),
    ]);
    setSubmissions(subRes.submissions);
    const nextSubDrafts: Record<string, { status: SubmissionStatus; notes: string }> = {};
    for (const s of subRes.submissions) {
      nextSubDrafts[s.id] = { status: s.status, notes: s.notes };
    }
    setSubDrafts(nextSubDrafts);

    setWebhooks(whRes.webhooks);
    setDeliveries(whRes.deliveries);
    setEmails(emailRes.emails);
    setSyncConnections(syncRes.connections);
    setMirrorRows(syncRes.mirrorRows);
    const nextMirrorDrafts: Record<string, { status: SubmissionStatus; notes: string }> = {};
    for (const r of syncRes.mirrorRows) {
      nextMirrorDrafts[r.id] = { status: r.remoteStatus, notes: r.remoteNotes };
    }
    setMirrorDrafts(nextMirrorDrafts);
    setSyncEvents(syncRes.events);

    const gs = syncRes.connections.find((c) => c.provider === "google_sheets");
    const nt = syncRes.connections.find((c) => c.provider === "notion");
    setSyncTargets({
      google_sheets: {
        enabled: gs?.enabled ?? false,
        mode: gs?.mode ?? "sandbox",
        targetId: gs?.targetId ?? "",
        targetName: gs?.targetName ?? "FormBeam Leads Sheet",
      },
      notion: {
        enabled: nt?.enabled ?? false,
        mode: nt?.mode ?? "sandbox",
        targetId: nt?.targetId ?? "",
        targetName: nt?.targetName ?? "FormBeam Notion CRM",
      },
    });
  }, []);

  useEffect(() => {
    void loadForms();
  }, [loadForms]);

  useEffect(() => {
    if (!selectedForm) return;
    setLmEnabled(selectedForm.leadMagnetEnabled);
    setLmTitle(selectedForm.leadMagnetTitle ?? "Static-Stack Playbook");
    setLmDiscount(selectedForm.leadMagnetDiscountCode ?? "");
    setLmSubject(selectedForm.leadMagnetSubject ?? "Your requested download: {{form_name}}");
    setLmBody(
      selectedForm.leadMagnetBody ??
        "Hi {{name}},\n\nThanks for reaching out! Download your file here: {{download_url}}\n\nDiscount code: {{discount_code}}",
    );
    setLmEmailField(selectedForm.leadMagnetEmailField || "email");
    setSetupHoneypot(selectedForm.honeypotField || "_gotcha");
    setSetupRedirect(selectedForm.redirectUrl ?? "");
    setSetupOrigins(selectedForm.allowedOrigins ?? "*");
    void loadFormDetails(selectedForm.id);
  }, [selectedForm, loadFormDetails]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const endpointUrl = selectedForm ? `${origin}/f/${selectedForm.slug}` : "";

  const handleCreateForm = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { form } = await api.createForm({
        name: newFormName,
        slug:
          newFormSlug.trim() ||
          newFormName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, ""),
      });
      setForms((prev) => [form, ...prev]);
      setSelectedFormId(form.id);
      setShowNewForm(false);
      setNewFormName("");
      setNewFormSlug("");
      showToast(`Created endpoint /f/${form.slug}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create form");
    }
  };

  const handleDeleteForm = async () => {
    if (!selectedForm || !confirm(`Delete "${selectedForm.name}" and all its submissions?`)) return;
    await api.deleteForm(selectedForm.id);
    await loadForms();
    showToast("Form deleted");
  };

  const handleTestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedForm) return;
    const fd = new FormData();
    fd.append("name", testName);
    fd.append("email", testEmail);
    fd.append("message", testMessage);
    if (testFile) fd.append("attachment", testFile);
    if (testSpam) fd.append(selectedForm.honeypotField || "_gotcha", "spam-bot-payload");

    const res = await fetch(`/f/${selectedForm.slug}`, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: fd,
    });
    const data = (await res.json()) as { ok?: boolean; error?: string; spamFiltered?: boolean };
    if (!res.ok) {
      alert(data.error ?? "Submission failed");
      return;
    }
    setShowTestDrawer(false);
    setTestFile(null);
    await Promise.all([loadForms(), loadFormDetails(selectedForm.id), refreshWorkspace()]);
    showToast(
      data.spamFiltered
        ? "Honeypot triggered — logged as spam (0 quota used)"
        : "Submission received! Webhooks, lead magnet & sync updated.",
    );
  };

  const handleSaveSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedForm) return;
    const { form } = await api.updateForm(selectedForm.id, {
      honeypotField: setupHoneypot,
      redirectUrl: setupRedirect.trim() || null,
      allowedOrigins: setupOrigins.trim() || null,
    });
    setForms((prev) => prev.map((f) => (f.id === form.id ? { ...f, ...form } : f)));
    showToast("Form endpoint settings saved");
  };

  const handleSaveLeadMagnet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedForm) return;
    const { form } = await api.updateForm(selectedForm.id, {
      leadMagnetEnabled: lmEnabled,
      leadMagnetTitle: lmTitle,
      leadMagnetDiscountCode: lmDiscount.trim() || null,
      leadMagnetSubject: lmSubject,
      leadMagnetBody: lmBody,
      leadMagnetEmailField: lmEmailField,
    });
    setForms((prev) => prev.map((f) => (f.id === form.id ? { ...f, ...form } : f)));
    showToast("Lead magnet settings saved");
  };

  const handleUploadLeadMagnet = async (file: File) => {
    if (!selectedForm) return;
    const { form } = await api.uploadLeadMagnetFile(selectedForm.id, { file });
    setForms((prev) => prev.map((f) => (f.id === form.id ? { ...f, ...form } : f)));
    showToast(`Attached ${file.name} to lead magnet`);
  };

  const handleGeneratePdf = async () => {
    if (!selectedForm) return;
    const { form } = await api.uploadLeadMagnetFile(selectedForm.id, {
      generateTitle: lmTitle || `${selectedForm.name} Guide`,
      discountCode: lmDiscount || undefined,
      bodyText: lmCustomBodyText,
    });
    setForms((prev) => prev.map((f) => (f.id === form.id ? { ...f, ...form } : f)));
    showToast("Generated custom PDF whitepaper & stored in Netlify Blobs");
  };

  const handleAddWebhook = async (urlToUse: string) => {
    if (!selectedForm || !urlToUse.trim()) return;
    await api.createWebhook(selectedForm.id, urlToUse.trim());
    setNewWebhookUrl("");
    await loadFormDetails(selectedForm.id);
    showToast("HMAC-signed webhook added (free on all tiers)");
  };

  const handleRetryDelivery = async (deliveryId: string) => {
    if (!selectedForm) return;
    await api.retryWebhookDelivery(deliveryId);
    await loadFormDetails(selectedForm.id);
    showToast("Webhook redelivery attempted");
  };

  const handleSaveSubmissionEdit = async (subId: string) => {
    if (!selectedForm) return;
    const draft = subDrafts[subId];
    if (!draft) return;
    await api.updateSubmission(subId, { status: draft.status, notes: draft.notes });
    await loadFormDetails(selectedForm.id);
    showToast("Submission updated — click Run Two-Way Sync to push changes");
  };

  const handleSaveSyncConfig = async (provider: SyncProvider) => {
    if (!selectedForm) return;
    const cfg = syncTargets[provider];
    await api.upsertSyncConnection(selectedForm.id, provider, {
      enabled: cfg.enabled,
      mode: cfg.mode,
      targetId: cfg.targetId.trim() || null,
      targetName: cfg.targetName.trim() || null,
      apiToken: syncTokens[provider].trim() || undefined,
    });
    setSyncTokens((prev) => ({ ...prev, [provider]: "" }));
    await loadFormDetails(selectedForm.id);
    showToast(`${provider === "google_sheets" ? "Google Sheets" : "Notion"} sync config saved`);
  };

  const handleSaveMirrorEdit = async (rowId: string) => {
    if (!selectedForm) return;
    const draft = mirrorDrafts[rowId];
    if (!draft) return;
    await api.updateMirrorRow(rowId, {
      remoteStatus: draft.status,
      remoteNotes: draft.notes,
    });
    await loadFormDetails(selectedForm.id);
    showToast("Remote Sheet/Notion cell updated — run Two-Way Sync to pull back");
  };

  const handleRunTwoWaySync = async () => {
    if (!selectedForm) return;
    const res = await api.runTwoWaySync(selectedForm.id);
    await loadFormDetails(selectedForm.id);
    showToast(
      `Two-way sync complete: ${res.pushed} pushed, ${res.pulled} pulled, ${res.conflicts} conflicts resolved`,
    );
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const { workspace: updated } = await api.updateWorkspace({
      plan: settingsPlan,
      resendApiKey: settingsResendKey.trim() || undefined,
      fromEmail: settingsFromEmail.trim() || null,
    });
    onWorkspaceChange(updated);
    setSettingsResendKey("");
    setShowSettings(false);
    showToast(`Workspace updated (${updated.plan.toUpperCase()} plan)`);
  };

  const filteredSubmissions = submissions.filter((s) => {
    if (spamFilter === "clean" && s.isSpam) return false;
    if (spamFilter === "spam" && !s.isSpam) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (s.submitterEmail ?? "").toLowerCase().includes(q) ||
      (s.submitterName ?? "").toLowerCase().includes(q) ||
      JSON.stringify(s.payload).toLowerCase().includes(q)
    );
  });

  const quotaPct = Math.min(
    100,
    Math.round((workspace.monthlyUsed / Math.max(1, workspace.monthlyLimit)) * 100),
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl bg-slate-950 px-4 py-3 text-sm font-medium text-emerald-300 shadow-xl border border-emerald-500/30">
          {toast}
        </div>
      )}

      {/* Top Navigation */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackHome}
              className="flex items-center gap-2 font-bold text-slate-950 hover:opacity-80"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-emerald-400">
                <Zap className="h-4 w-4" />
              </span>
              FormBeam
            </button>
            <span className="text-slate-300">/</span>
            <span className="text-sm font-semibold text-slate-800">{workspace.name}</span>
            {workspace.isDemo && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                Live Demo Workspace
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Monthly Quota Meter */}
            <div className="min-w-[190px]">
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-600 mb-1">
                <span>
                  {workspace.plan.toUpperCase()} (${PLAN_PRICES[workspace.plan]}/mo)
                </span>
                <span className="font-mono">
                  {workspace.monthlyUsed.toLocaleString()} / {workspace.monthlyLimit.toLocaleString()}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width] duration-300 ${
                    quotaPct > 85 ? "bg-rose-500" : "bg-emerald-500"
                  }`}
                  style={{ width: `${quotaPct}%` }}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setSettingsPlan(workspace.plan);
                setSettingsFromEmail(workspace.fromEmail ?? "");
                setShowSettings(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Settings className="h-3.5 w-3.5" /> Plan &amp; Email Settings
            </button>
            <button
              type="button"
              onClick={async () => {
                await api.logout();
                onWorkspaceChange(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main Split Layout */}
      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[260px_1fr]">
        {/* Forms Sidebar */}
        <aside className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Form Endpoints ({forms.length})
            </h2>
            <button
              type="button"
              onClick={() => setShowNewForm(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" /> New Form
            </button>
          </div>

          {loadingForms ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
              Loading forms...
            </div>
          ) : forms.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center">
              <p className="text-sm font-medium text-slate-700">No forms yet</p>
              <button
                type="button"
                onClick={() => setShowNewForm(true)}
                className="mt-2 text-xs font-semibold text-emerald-700 hover:underline"
              >
                + Create your first endpoint
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {forms.map((form) => {
                const active = form.id === selectedForm?.id;
                return (
                  <button
                    key={form.id}
                    type="button"
                    onClick={() => setSelectedFormId(form.id)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      active
                        ? "border-emerald-500 bg-emerald-50/70 shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-slate-900 truncate">
                        {form.name}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
                        {form.submissionCount ?? 0}
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-slate-500 truncate">
                      /f/{form.slug}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {form.leadMagnetEnabled && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                          PDF Lead Magnet
                        </span>
                      )}
                      {(form.spamCount ?? 0) > 0 && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                          {form.spamCount} spam blocked
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* Form Workspace */}
        <main className="min-w-0 space-y-5">
          {!selectedForm ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
              Select or create a form endpoint on the left to start receiving submissions.
            </div>
          ) : (
            <>
              {/* Form Header Card */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h1 className="text-xl font-bold text-slate-950">{selectedForm.name}</h1>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <code className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-mono text-emerald-300">
                        POST {endpointUrl}
                      </code>
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(endpointUrl);
                          setCopiedSlug(true);
                          setTimeout(() => setCopiedSlug(false), 1600);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        {copiedSlug ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiedSlug ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowTestDrawer(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      <Send className="h-3.5 w-3.5" /> Test Submit
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteForm}
                      className="rounded-xl border border-rose-200 p-2 text-rose-600 hover:bg-rose-50"
                      title="Delete form"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Tabs */}
                <div className="mt-5 flex flex-wrap gap-1.5 border-t border-slate-100 pt-4">
                  {(
                    [
                      { id: "submissions", label: "Submissions", icon: Layers, count: submissions.filter((s) => !s.isSpam).length },
                      { id: "setup", label: "Embed & Migrator", icon: Globe },
                      { id: "lead-magnet", label: "Lead Magnet & Outbox", icon: Mail, count: emails.length },
                      { id: "webhooks", label: "Webhooks (Free)", icon: Webhook, count: webhooks.length },
                      { id: "sync", label: "Two-Way Sheets & Notion", icon: Table2, count: syncConnections.filter((c) => c.enabled).length },
                    ] as Array<{ id: ActiveTab; label: string; icon: typeof Layers; count?: number }>
                  ).map((t) => {
                    const Icon = t.icon;
                    const active = activeTab === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setActiveTab(t.id)}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                          active
                            ? "bg-slate-950 text-white"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {t.label}
                        {typeof t.count === "number" && (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                              active ? "bg-emerald-500 text-slate-950" : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {t.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* TAB 1: Submissions */}
              {activeTab === "submissions" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search email, name, or payload…"
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs w-60 focus:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                      />
                      {(["clean", "all", "spam"] as const).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setSpamFilter(f)}
                          className={`rounded-lg px-2.5 py-1.5 text-xs font-medium capitalize ${
                            spamFilter === f
                              ? "bg-emerald-100 text-emerald-900 font-semibold"
                              : "text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={`/api/forms/${selectedForm.id}/export?format=csv`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Download className="h-3.5 w-3.5" /> CSV
                      </a>
                      <a
                        href={`/api/forms/${selectedForm.id}/export?format=json`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Download className="h-3.5 w-3.5" /> JSON
                      </a>
                    </div>
                  </div>

                  {filteredSubmissions.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
                      No submissions match this filter. Click <strong>Test Submit</strong> above to send one.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredSubmissions.map((sub) => {
                        const draft = subDrafts[sub.id] ?? { status: sub.status, notes: sub.notes };
                        return (
                          <div
                            key={sub.id}
                            className={`rounded-2xl border bg-white p-5 shadow-xs ${
                              sub.isSpam ? "border-amber-300 bg-amber-50/40" : "border-slate-200"
                            }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-950">
                                    {sub.submitterName || sub.submitterEmail || "Anonymous Submission"}
                                  </span>
                                  {sub.submitterEmail && (
                                    <span className="font-mono text-xs text-slate-500">
                                      &lt;{sub.submitterEmail}&gt;
                                    </span>
                                  )}
                                  {sub.isSpam && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                      <ShieldAlert className="h-3 w-3" /> Honeypot Spam
                                    </span>
                                  )}
                                </div>
                                <div className="mt-0.5 font-mono text-[11px] text-slate-400">
                                  {sub.id} · {new Date(sub.createdAt).toLocaleString()}
                                  {sub.remoteSheetRowId && ` · Sheet: ${sub.remoteSheetRowId}`}
                                  {sub.remoteNotionPageId && ` · Notion: ${sub.remoteNotionPageId}`}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={async () => {
                                  await api.deleteSubmission(sub.id);
                                  await Promise.all([loadForms(), loadFormDetails(selectedForm.id)]);
                                }}
                                className="text-xs text-slate-400 hover:text-rose-600"
                              >
                                Delete
                              </button>
                            </div>

                            <div className="grid gap-2 rounded-xl bg-slate-50 p-3.5 text-xs sm:grid-cols-2">
                              {Object.entries(sub.payload).map(([k, v]) => (
                                <div key={k}>
                                  <span className="font-mono font-semibold text-slate-500">{k}: </span>
                                  <span className="text-slate-900 break-words">
                                    {typeof v === "string" ? v : JSON.stringify(v)}
                                  </span>
                                </div>
                              ))}
                            </div>

                            {sub.files.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {sub.files.map((f) => (
                                  <a
                                    key={f.id}
                                    href={`/api/files/${f.id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                                  >
                                    <FileDown className="h-3.5 w-3.5" />
                                    {f.filename} ({Math.max(1, Math.round(f.sizeBytes / 1024))} KB)
                                  </a>
                                ))}
                              </div>
                            )}

                            {!sub.isSpam && (
                              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                                <select
                                  value={draft.status}
                                  onChange={(e) =>
                                    setSubDrafts((prev) => ({
                                      ...prev,
                                      [sub.id]: { ...draft, status: e.target.value as SubmissionStatus },
                                    }))
                                  }
                                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium bg-white"
                                >
                                  <option value="new">Status: New</option>
                                  <option value="qualified">Status: Qualified</option>
                                  <option value="contacted">Status: Contacted</option>
                                  <option value="archived">Status: Archived</option>
                                </select>
                                <input
                                  type="text"
                                  value={draft.notes}
                                  onChange={(e) =>
                                    setSubDrafts((prev) => ({
                                      ...prev,
                                      [sub.id]: { ...draft, notes: e.target.value },
                                    }))
                                  }
                                  placeholder="CRM notes (synced two-way to Sheets/Notion)..."
                                  className="flex-1 min-w-[200px] rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveSubmissionEdit(sub.id)}
                                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                                >
                                  Save CRM Note
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: Setup & Snippets */}
              {activeTab === "setup" && (
                <div className="space-y-6">
                  <div className="rounded-2xl border border-slate-200 bg-white p-6">
                    <h3 className="text-base font-bold text-slate-950 mb-1">
                      Drop-in Code &amp; Legacy Migration
                    </h3>
                    <p className="text-xs text-slate-500 mb-4">
                      Works via standard HTML form POST or JavaScript fetch, with CORS enabled for all static hosts.
                    </p>
                    <SnippetPanel
                      endpointUrl={endpointUrl}
                      honeypotField={selectedForm.honeypotField}
                      leadMagnetEnabled={selectedForm.leadMagnetEnabled}
                    />
                  </div>

                  <form
                    onSubmit={handleSaveSetup}
                    className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4"
                  >
                    <h3 className="text-base font-bold text-slate-950">Endpoint Protection &amp; Redirects</h3>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Honeypot Field Name
                        </label>
                        <input
                          type="text"
                          value={setupHoneypot}
                          onChange={(e) => setSetupHoneypot(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Post-Submit Redirect URL (optional)
                        </label>
                        <input
                          type="url"
                          value={setupRedirect}
                          onChange={(e) => setSetupRedirect(e.target.value)}
                          placeholder="https://yoursite.com/thank-you"
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Allowed Origins (* or comma-separated)
                        </label>
                        <input
                          type="text"
                          value={setupOrigins}
                          onChange={(e) => setSetupOrigins(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      Save Endpoint Settings
                    </button>
                  </form>
                </div>
              )}

              {/* TAB 3: Lead Magnet Studio & Outbox */}
              {activeTab === "lead-magnet" && (
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-bold text-slate-950">
                          Built-in Lead Magnet Delivery
                        </h3>
                        <p className="text-xs text-slate-500">
                          Auto-attach PDFs, whitepapers &amp; discount codes without Mailchimp or Zapier.
                        </p>
                      </div>
                      <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold">
                        <input
                          type="checkbox"
                          checked={lmEnabled}
                          onChange={(e) => setLmEnabled(e.target.checked)}
                          className="h-4 w-4 rounded text-emerald-600"
                        />
                        Enabled
                      </label>
                    </div>

                    {/* Asset Upload / Instant PDF Generator */}
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-emerald-900">
                          Attached Asset: {selectedForm.leadMagnetFilename ?? "None yet"}
                        </span>
                        <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-white border border-emerald-300 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50">
                          <Upload className="h-3.5 w-3.5" /> Upload PDF / File
                          <input
                            type="file"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void handleUploadLeadMagnet(file);
                            }}
                          />
                        </label>
                      </div>
                      <textarea
                        rows={2}
                        value={lmCustomBodyText}
                        onChange={(e) => setLmCustomBodyText(e.target.value)}
                        className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs"
                        placeholder="Whitepaper content lines..."
                      />
                      <button
                        type="button"
                        onClick={handleGeneratePdf}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        <Sparkles className="h-3.5 w-3.5" /> Generate &amp; Store Real PDF Whitepaper
                      </button>
                    </div>

                    <form onSubmit={handleSaveLeadMagnet} className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Whitepaper / Asset Title
                          </label>
                          <input
                            type="text"
                            value={lmTitle}
                            onChange={(e) => setLmTitle(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Discount Code (optional)
                          </label>
                          <input
                            type="text"
                            value={lmDiscount}
                            onChange={(e) => setLmDiscount(e.target.value)}
                            placeholder="WELCOME20"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                          />
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Form Email Field Name
                          </label>
                          <input
                            type="text"
                            value={lmEmailField}
                            onChange={(e) => setLmEmailField(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Email Subject
                          </label>
                          <input
                            type="text"
                            value={lmSubject}
                            onChange={(e) => setLmSubject(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Autoresponder Body (supports {"{{name}}"}, {"{{download_url}}"}, {"{{discount_code}}"})
                        </label>
                        <textarea
                          rows={4}
                          value={lmBody}
                          onChange={(e) => setLmBody(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                        />
                      </div>
                      <button
                        type="submit"
                        className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        Save Lead Magnet Config
                      </button>
                    </form>
                  </div>

                  {/* Email Outbox Preview */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-slate-950">
                        Autoresponder Outbox ({emails.length})
                      </h3>
                      <span className="text-[11px] text-slate-500">
                        {workspace.hasResendKey ? "Live Resend SMTP Active" : "Built-in Outbox Preview (add Resend key in Settings for live SMTP)"}
                      </span>
                    </div>

                    {emails.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        No lead magnet emails sent for this form yet. Enable above and run Test Submit.
                      </p>
                    ) : (
                      <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
                        {emails.map((em) => (
                          <div key={em.id} className="rounded-xl border border-slate-200 p-4 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-xs font-bold text-slate-900">
                                To: {em.recipientEmail}
                              </div>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                  em.status === "sent"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : em.status === "failed"
                                      ? "bg-rose-100 text-rose-800"
                                      : "bg-sky-100 text-sky-800"
                                }`}
                              >
                                {em.transport} · {em.status}
                              </span>
                            </div>
                            <div className="text-xs font-medium text-slate-700">{em.subject}</div>
                            <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-xs leading-relaxed text-slate-700 border border-slate-100">
                              {em.htmlBody
                                .replace(/<\/(p|div|li|tr|h[1-6]|br\s*\/?)>/gi, "\n")
                                .replace(/<[^>]+>/g, "")
                                .replace(/&nbsp;/g, " ")
                                .replace(/&amp;/g, "&")
                                .replace(/&lt;/g, "<")
                                .replace(/&gt;/g, ">")
                                .trim()}
                            </pre>
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                              {em.discountCode && (
                                <span className="font-mono text-[11px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded">
                                  Code: {em.discountCode}
                                </span>
                              )}
                              <a
                                href={`/d/${em.downloadToken}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                Download {em.attachmentFilename ?? "Attachment"}
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: Webhooks */}
              {activeTab === "webhooks" && (
                <div className="space-y-6">
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-base font-bold text-slate-950">
                          HMAC-SHA256 Signed Webhooks (Included Free)
                        </h3>
                        <p className="text-xs text-slate-500">
                          Every request includes <code>X-FormBeam-Signature: sha256=...</code> for cryptographic verification.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleAddWebhook(`${origin}/api/webhook-echo/${selectedForm.id}`)
                        }
                        className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                      >
                        + Attach Built-in Echo Receiver
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={newWebhookUrl}
                        onChange={(e) => setNewWebhookUrl(e.target.value)}
                        placeholder="https://your-app.com/webhooks/formbeam"
                        className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddWebhook(newWebhookUrl)}
                        className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        Add Endpoint
                      </button>
                    </div>

                    <div className="space-y-2">
                      {webhooks.map((wh) => (
                        <div
                          key={wh.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-mono font-semibold text-slate-900 truncate">
                              {wh.url}
                            </div>
                            <div className="font-mono text-[11px] text-slate-500">
                              Signing Secret: {wh.secret}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              await api.deleteWebhook(wh.id);
                              await loadFormDetails(selectedForm.id);
                            }}
                            className="text-rose-600 hover:underline font-medium"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-6">
                    <h3 className="text-base font-bold text-slate-950 mb-4">
                      Recent Webhook Deliveries ({deliveries.length})
                    </h3>
                    {deliveries.length === 0 ? (
                      <p className="text-xs text-slate-500">No deliveries logged yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {deliveries.map((d) => (
                          <div key={d.id} className="rounded-xl border border-slate-200 p-4 text-xs space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                    d.status === "success"
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-rose-100 text-rose-800"
                                  }`}
                                >
                                  {d.responseStatus ?? "ERR"} · {d.status}
                                </span>
                                <span className="font-mono text-slate-700">{d.requestUrl}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-mono text-slate-400">{d.durationMs ?? 0}ms</span>
                                <button
                                  type="button"
                                  onClick={() => handleRetryDelivery(d.id)}
                                  className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline"
                                >
                                  <RefreshCw className="h-3 w-3" /> Retry
                                </button>
                              </div>
                            </div>
                            <div className="font-mono text-[11px] text-slate-500 truncate">
                              {d.signature}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 5: Native Two-Way Google Sheets & Notion Sync */}
              {activeTab === "sync" && (
                <div className="space-y-6">
                  {/* Connector Config Cards */}
                  <div className="grid gap-5 lg:grid-cols-2">
                    {(["google_sheets", "notion"] as SyncProvider[]).map((provider) => {
                      const cfg = syncTargets[provider];
                      const conn = syncConnections.find((c) => c.provider === provider);
                      const label = provider === "google_sheets" ? "Google Sheets" : "Notion Database";
                      return (
                        <div key={provider} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3.5">
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="font-bold text-slate-950">{label} Two-Way Sync</h3>
                              <p className="text-[11px] text-slate-500">
                                {conn?.lastSyncedAt
                                  ? `Last synced ${new Date(conn.lastSyncedAt).toLocaleString()}`
                                  : "Not synced yet"}
                              </p>
                            </div>
                            <label className="inline-flex items-center gap-2 text-xs font-semibold">
                              <input
                                type="checkbox"
                                checked={cfg.enabled}
                                onChange={(e) =>
                                  setSyncTargets((prev) => ({
                                    ...prev,
                                    [provider]: { ...cfg, enabled: e.target.checked },
                                  }))
                                }
                                className="h-4 w-4 rounded text-emerald-600"
                              />
                              Enabled
                            </label>
                          </div>

                          <div className="grid gap-2.5 sm:grid-cols-2">
                            <div>
                              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                Connection Mode
                              </label>
                              <select
                                value={cfg.mode}
                                onChange={(e) =>
                                  setSyncTargets((prev) => ({
                                    ...prev,
                                    [provider]: { ...cfg, mode: e.target.value as SyncMode },
                                  }))
                                }
                                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                              >
                                <option value="sandbox">Built-in Live Mirror (Zero Setup)</option>
                                <option value="live_api">Live External {label} API</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                Display Name
                              </label>
                              <input
                                type="text"
                                value={cfg.targetName}
                                onChange={(e) =>
                                  setSyncTargets((prev) => ({
                                    ...prev,
                                    [provider]: { ...cfg, targetName: e.target.value },
                                  }))
                                }
                                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                              />
                            </div>
                          </div>

                          {cfg.mode === "live_api" && (
                            <div className="grid gap-2.5 sm:grid-cols-2 rounded-xl bg-slate-50 p-3 border border-slate-200">
                              <div>
                                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                                  {provider === "google_sheets" ? "Spreadsheet ID" : "Notion Database ID"}
                                </label>
                                <input
                                  type="text"
                                  value={cfg.targetId}
                                  onChange={(e) =>
                                    setSyncTargets((prev) => ({
                                      ...prev,
                                      [provider]: { ...cfg, targetId: e.target.value },
                                    }))
                                  }
                                  placeholder={provider === "google_sheets" ? "1BxiMVs0XRA5nFMd..." : "32-char DB UUID"}
                                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                                  {provider === "google_sheets" ? "Google OAuth Access Token" : "Notion Secret Token"}
                                  {conn?.hasApiToken && " (saved)"}
                                </label>
                                <input
                                  type="password"
                                  value={syncTokens[provider]}
                                  onChange={(e) =>
                                    setSyncTokens((prev) => ({ ...prev, [provider]: e.target.value }))
                                  }
                                  placeholder={conn?.hasApiToken ? "•••••••• (leave blank to keep)" : "Paste token..."}
                                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono"
                                />
                              </div>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => handleSaveSyncConfig(provider)}
                            className="rounded-lg bg-slate-950 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                          >
                            Save {label} Connector
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Interactive Bidirectional Mirror & Sync Trigger */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-base font-bold text-slate-950">
                          Interactive Remote Sheet &amp; Notion Mirror ({mirrorRows.length} rows)
                        </h3>
                        <p className="text-xs text-slate-500">
                          Edit any cell directly in the remote Sheet/Notion table below, then click{" "}
                          <strong>Run Two-Way Sync</strong> to reconcile changes back into FormBeam.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleRunTwoWaySync}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Run Two-Way Sync Now
                      </button>
                    </div>

                    {mirrorRows.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        Enable Google Sheets or Notion above and run sync or submit a form to populate remote rows.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200 text-slate-500">
                              <th className="py-2 pr-3 font-semibold">Remote ID</th>
                              <th className="py-2 pr-3 font-semibold">Email / Name</th>
                              <th className="py-2 pr-3 font-semibold">Remote Status</th>
                              <th className="py-2 pr-3 font-semibold">Remote Notes</th>
                              <th className="py-2 font-semibold">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {mirrorRows.map((row) => {
                              const draft = mirrorDrafts[row.id] ?? {
                                status: row.remoteStatus,
                                notes: row.remoteNotes,
                              };
                              return (
                                <tr key={row.id}>
                                  <td className="py-2.5 pr-3 font-mono text-[11px] text-slate-500">
                                    {row.externalRecordId}
                                  </td>
                                  <td className="py-2.5 pr-3 font-medium text-slate-900">
                                    {String(row.remoteData.email ?? row.remoteData.name ?? row.submissionId)}
                                  </td>
                                  <td className="py-2.5 pr-3">
                                    <select
                                      value={draft.status}
                                      onChange={(e) =>
                                        setMirrorDrafts((prev) => ({
                                          ...prev,
                                          [row.id]: { ...draft, status: e.target.value as SubmissionStatus },
                                        }))
                                      }
                                      className="rounded border border-slate-300 px-2 py-1 text-xs bg-white"
                                    >
                                      <option value="new">new</option>
                                      <option value="qualified">qualified</option>
                                      <option value="contacted">contacted</option>
                                      <option value="archived">archived</option>
                                    </select>
                                  </td>
                                  <td className="py-2.5 pr-3">
                                    <input
                                      type="text"
                                      value={draft.notes}
                                      onChange={(e) =>
                                        setMirrorDrafts((prev) => ({
                                          ...prev,
                                          [row.id]: { ...draft, notes: e.target.value },
                                        }))
                                      }
                                      placeholder="Edit remote note..."
                                      className="w-full min-w-[180px] rounded border border-slate-300 px-2.5 py-1 text-xs"
                                    />
                                  </td>
                                  <td className="py-2.5">
                                    <button
                                      type="button"
                                      onClick={() => handleSaveMirrorEdit(row.id)}
                                      className="rounded bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-700"
                                    >
                                      Save Remote Cell
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Audit Log */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-6">
                    <h3 className="text-sm font-bold text-slate-950 mb-3">
                      Sync Audit Trail ({syncEvents.length})
                    </h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {syncEvents.map((ev) => (
                        <div
                          key={ev.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                                ev.direction === "inbound_pull"
                                  ? "bg-sky-100 text-sky-800"
                                  : ev.direction === "conflict_resolved"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-emerald-100 text-emerald-800"
                              }`}
                            >
                              {ev.direction}
                            </span>
                            <span className="text-slate-800">{ev.summary}</span>
                          </div>
                          <span className="font-mono text-[11px] text-slate-400">
                            {new Date(ev.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* New Form Modal */}
      {showNewForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleCreateForm}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4"
          >
            <h3 className="text-lg font-bold">Create Form Endpoint</h3>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Form Name</label>
              <input
                type="text"
                required
                value={newFormName}
                onChange={(e) => setNewFormName(e.target.value)}
                placeholder="Webflow Pricing Contact"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Endpoint Slug (/f/&lt;slug&gt;)
              </label>
              <input
                type="text"
                value={newFormSlug}
                onChange={(e) => setNewFormSlug(e.target.value)}
                placeholder="webflow-pricing"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewForm(false)}
                className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Create Endpoint
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Test Submit Modal */}
      {showTestDrawer && selectedForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleTestSubmit}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">Test POST /f/{selectedForm.slug}</h3>
              <button type="button" onClick={() => setShowTestDrawer(false)} className="text-slate-400">
                ✕
              </button>
            </div>
            <input
              type="text"
              required
              value={testName}
              onChange={(e) => setTestName(e.target.value)}
              placeholder="Name"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="email"
              required
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="Email"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <textarea
              rows={2}
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 p-2.5 text-xs cursor-pointer">
              <Upload className="h-4 w-4 text-emerald-600" />
              <span>{testFile ? testFile.name : "Attach file (optional)"}</span>
              <input
                type="file"
                className="hidden"
                onChange={(e) => setTestFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={testSpam}
                onChange={(e) => setTestSpam(e.target.checked)}
              />
              Fill honeypot field ({selectedForm.honeypotField}) to test bot filtering
            </label>
            <button
              type="submit"
              className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Send Submission
            </button>
          </form>
        </div>
      )}

      {/* Workspace Plan & Resend Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleSaveSettings}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Plan Quota &amp; Live Email Settings</h3>
              <button type="button" onClick={() => setShowSettings(false)} className="text-slate-400">
                ✕
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Select Workspace Plan (All features unlocked on every tier)
              </label>
              <div className="grid gap-2 sm:grid-cols-3">
                {(["free", "pro", "scale"] as PlanTier[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSettingsPlan(p)}
                    className={`rounded-xl border p-3 text-left transition ${
                      settingsPlan === p
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="font-bold capitalize text-sm">{p}</div>
                    <div className="text-lg font-extrabold">${PLAN_PRICES[p]}/mo</div>
                    <div className="text-[11px] text-slate-500">
                      {PLAN_LIMITS[p].toLocaleString()} subs/mo
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Resend API Key (optional, for live SMTP)
                </label>
                <input
                  type="password"
                  value={settingsResendKey}
                  onChange={(e) => setSettingsResendKey(e.target.value)}
                  placeholder={workspace.hasResendKey ? "•••••••• (saved)" : "re_..."}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Sender From Email
                </label>
                <input
                  type="text"
                  value={settingsFromEmail}
                  onChange={(e) => setSettingsFromEmail(e.target.value)}
                  placeholder="FormBeam <hello@yourdomain.com>"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Save Workspace
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
