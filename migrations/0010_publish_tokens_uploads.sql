CREATE TABLE IF NOT EXISTS project_publish_tokens (
  id TEXT PRIMARY KEY,
  project_slug TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '["release:write"]',
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS project_publish_tokens_project_idx ON project_publish_tokens(project_slug, revoked_at);

CREATE TABLE IF NOT EXISTS publish_uploads (
  id TEXT PRIMARY KEY,
  project_slug TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT,
  content_type TEXT NOT NULL,
  storage_key TEXT,
  multipart_id TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS publish_uploads_expiry_idx ON publish_uploads(status, expires_at);
