export type PlanTier = "free" | "pro" | "scale";

export const PLAN_LIMITS: Record<PlanTier, number> = {
  free: 1000,
  pro: 10000,
  scale: 100000,
};

export const PLAN_PRICES: Record<PlanTier, number> = {
  free: 0,
  pro: 9,
  scale: 29,
};

export type SubmissionStatus = "new" | "qualified" | "contacted" | "archived";
export type SyncProvider = "google_sheets" | "notion";
export type SyncMode = "sandbox" | "live_api";

export interface Workspace {
  id: string;
  name: string;
  email: string;
  plan: PlanTier;
  resendApiKey: string | null;
  fromEmail: string | null;
  isDemo: boolean;
  createdAt: string;
}

export interface FormConfig {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  honeypotField: string;
  redirectUrl: string | null;
  allowedOrigins: string | null;
  leadMagnetEnabled: boolean;
  leadMagnetTitle: string | null;
  leadMagnetFilename: string | null;
  leadMagnetBlobKey: string | null;
  leadMagnetMime: string | null;
  leadMagnetDiscountCode: string | null;
  leadMagnetEmailField: string;
  leadMagnetSubject: string | null;
  leadMagnetBody: string | null;
  createdAt: string;
  submissionCount?: number;
  spamCount?: number;
}

export interface SubmissionFile {
  id: string;
  submissionId: string;
  formId: string;
  fieldName: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  blobKey: string;
  createdAt: string;
}

export interface SubmissionRecord {
  id: string;
  formId: string;
  workspaceId: string;
  payload: Record<string, unknown>;
  submitterEmail: string | null;
  submitterName: string | null;
  status: SubmissionStatus;
  notes: string;
  isSpam: boolean;
  sourceOrigin: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  remoteSheetRowId: string | null;
  remoteNotionPageId: string | null;
  syncStatus: string;
  updatedAt: string;
  createdAt: string;
  files?: SubmissionFile[];
}

export interface WebhookRecord {
  id: string;
  formId: string;
  url: string;
  secret: string;
  enabled: boolean;
  createdAt: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  submissionId: string;
  formId: string;
  requestUrl: string;
  signature: string;
  payload: Record<string, unknown>;
  responseStatus: number | null;
  responseBody: string | null;
  durationMs: number | null;
  status: "success" | "failed";
  createdAt: string;
}

export interface EmailDelivery {
  id: string;
  formId: string;
  submissionId: string;
  recipientEmail: string;
  subject: string;
  htmlBody: string;
  attachmentFilename: string | null;
  downloadToken: string;
  discountCode: string | null;
  transport: "resend" | "outbox";
  status: "sent" | "outbox_ready" | "failed";
  providerMessageId: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface SyncConnection {
  id: string;
  formId: string;
  provider: SyncProvider;
  mode: SyncMode;
  enabled: boolean;
  targetId: string | null;
  targetName: string | null;
  apiToken: string | null;
  fieldMapping: Record<string, string>;
  lastSyncedAt: string | null;
  createdAt: string;
}

export interface SyncMirrorRow {
  id: string;
  connectionId: string;
  submissionId: string;
  externalRecordId: string;
  remoteStatus: SubmissionStatus;
  remoteNotes: string;
  remoteData: Record<string, unknown>;
  remoteUpdatedAt: string;
  lastPushedAt: string;
}

export interface SyncEvent {
  id: string;
  connectionId: string;
  formId: string;
  direction: "outbound_push" | "inbound_pull" | "conflict_resolved";
  summary: string;
  details: Record<string, unknown>;
  createdAt: string;
}
