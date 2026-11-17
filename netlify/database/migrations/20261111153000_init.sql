CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  resend_api_key TEXT,
  from_email TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forms (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  honeypot_field TEXT NOT NULL DEFAULT '_gotcha',
  redirect_url TEXT,
  allowed_origins TEXT,
  lead_magnet_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  lead_magnet_title TEXT,
  lead_magnet_filename TEXT,
  lead_magnet_blob_key TEXT,
  lead_magnet_mime TEXT DEFAULT 'application/pdf',
  lead_magnet_discount_code TEXT,
  lead_magnet_email_field TEXT NOT NULL DEFAULT 'email',
  lead_magnet_subject TEXT,
  lead_magnet_body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  payload_json JSONB NOT NULL,
  submitter_email TEXT,
  submitter_name TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  notes TEXT NOT NULL DEFAULT '',
  is_spam BOOLEAN NOT NULL DEFAULT FALSE,
  source_origin TEXT,
  ip_address TEXT,
  user_agent TEXT,
  remote_sheet_row_id TEXT,
  remote_notion_page_id TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submissions_workspace_month
  ON submissions (workspace_id, is_spam, created_at);

CREATE INDEX IF NOT EXISTS idx_submissions_form_created
  ON submissions (form_id, created_at DESC);

CREATE TABLE IF NOT EXISTS submission_files (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  blob_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  request_url TEXT NOT NULL,
  signature TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  duration_ms INTEGER,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_deliveries (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  attachment_filename TEXT,
  download_token TEXT NOT NULL UNIQUE,
  discount_code TEXT,
  transport TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_connections (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'sandbox',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  target_id TEXT,
  target_name TEXT,
  api_token TEXT,
  field_mapping_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (form_id, provider)
);

CREATE TABLE IF NOT EXISTS sync_mirror_rows (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES sync_connections(id) ON DELETE CASCADE,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  external_record_id TEXT NOT NULL,
  remote_status TEXT NOT NULL DEFAULT 'new',
  remote_notes TEXT NOT NULL DEFAULT '',
  remote_data_json JSONB NOT NULL,
  remote_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_pushed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, submission_id)
);

CREATE TABLE IF NOT EXISTS sync_events (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES sync_connections(id) ON DELETE CASCADE,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  summary TEXT NOT NULL,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
