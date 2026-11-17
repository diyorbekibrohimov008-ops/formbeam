import type {
  EmailDeliveryDto,
  FormDto,
  PlanTier,
  SubmissionDto,
  SubmissionStatus,
  SyncConnectionDto,
  SyncEventDto,
  SyncMirrorRowDto,
  SyncMode,
  SyncProvider,
  WebhookDeliveryDto,
  WebhookDto,
  WorkspaceDto,
} from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    ...init,
  });
  const text = await res.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (!res.ok) {
    const errMsg =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new Error(errMsg);
  }
  return data as T;
}

export const api = {
  getMe: () => request<{ workspace: WorkspaceDto | null }>("/api/auth/me"),
  launchDemo: () =>
    request<{ workspace: WorkspaceDto }>("/api/auth/demo", { method: "POST" }),
  register: (body: { name: string; email: string; password: string }) =>
    request<{ workspace: WorkspaceDto }>("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  login: (body: { email: string; password: string }) =>
    request<{ workspace: WorkspaceDto }>("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  updateWorkspace: (body: {
    plan?: PlanTier;
    name?: string;
    resendApiKey?: string | null;
    fromEmail?: string | null;
  }) =>
    request<{ workspace: WorkspaceDto }>("/api/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  listForms: () => request<{ forms: FormDto[] }>("/api/forms"),
  createForm: (body: {
    name: string;
    slug: string;
    honeypotField?: string;
    redirectUrl?: string | null;
    allowedOrigins?: string | null;
  }) =>
    request<{ form: FormDto }>("/api/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  updateForm: (formId: string, body: Partial<FormDto>) =>
    request<{ form: FormDto }>(`/api/forms/${formId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  deleteForm: (formId: string) =>
    request<{ ok: boolean }>(`/api/forms/${formId}`, { method: "DELETE" }),

  uploadLeadMagnetFile: async (
    formId: string,
    payload: { file?: File; generateTitle?: string; discountCode?: string; bodyText?: string },
  ) => {
    if (payload.file) {
      const fd = new FormData();
      fd.append("file", payload.file);
      return request<{ form: FormDto }>(`/api/forms/${formId}/lead-magnet-file`, {
        method: "POST",
        body: fd,
      });
    }
    return request<{ form: FormDto }>(`/api/forms/${formId}/lead-magnet-file`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        generateTitle: payload.generateTitle,
        discountCode: payload.discountCode,
        bodyText: payload.bodyText,
      }),
    });
  },

  listSubmissions: (formId: string) =>
    request<{ submissions: SubmissionDto[] }>(`/api/forms/${formId}/submissions`),
  updateSubmission: (
    submissionId: string,
    body: { status?: SubmissionStatus; notes?: string },
  ) =>
    request<{ submission: SubmissionDto }>(`/api/submissions/${submissionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  deleteSubmission: (submissionId: string) =>
    request<{ ok: boolean }>(`/api/submissions/${submissionId}`, { method: "DELETE" }),

  listWebhooks: (formId: string) =>
    request<{ webhooks: WebhookDto[]; deliveries: WebhookDeliveryDto[] }>(
      `/api/forms/${formId}/webhooks`,
    ),
  createWebhook: (formId: string, url: string) =>
    request<{ webhook: WebhookDto }>(`/api/forms/${formId}/webhooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    }),
  deleteWebhook: (webhookId: string) =>
    request<{ ok: boolean }>(`/api/webhooks/${webhookId}`, { method: "DELETE" }),
  retryWebhookDelivery: (deliveryId: string) =>
    request<{ delivery: WebhookDeliveryDto }>(
      `/api/webhook-deliveries/${deliveryId}/retry`,
      { method: "POST" },
    ),

  listEmails: (formId: string) =>
    request<{ emails: EmailDeliveryDto[] }>(`/api/forms/${formId}/emails`),

  getSyncState: (formId: string) =>
    request<{
      connections: SyncConnectionDto[];
      mirrorRows: SyncMirrorRowDto[];
      events: SyncEventDto[];
    }>(`/api/forms/${formId}/sync`),
  upsertSyncConnection: (
    formId: string,
    provider: SyncProvider,
    body: {
      enabled: boolean;
      mode: SyncMode;
      targetId?: string | null;
      targetName?: string | null;
      apiToken?: string | null;
      fieldMapping?: Record<string, string>;
    },
  ) =>
    request<{ connection: SyncConnectionDto }>(`/api/forms/${formId}/sync/${provider}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  updateMirrorRow: (
    rowId: string,
    body: { remoteStatus?: SubmissionStatus; remoteNotes?: string },
  ) =>
    request<{ row: SyncMirrorRowDto }>(`/api/sync-mirror/${rowId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  runTwoWaySync: (formId: string) =>
    request<{ pushed: number; pulled: number; conflicts: number; events: SyncEventDto[] }>(
      `/api/forms/${formId}/sync/run`,
      { method: "POST" },
    ),
};
