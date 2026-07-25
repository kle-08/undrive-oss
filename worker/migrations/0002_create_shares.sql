-- Share links table
CREATE TABLE IF NOT EXISTS shares (
  token TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT DEFAULT NULL,
  max_downloads INTEGER DEFAULT NULL,
  download_count INTEGER NOT NULL DEFAULT 0,
  password_hash TEXT DEFAULT NULL
);

-- Index for cleanup of expired shares
CREATE INDEX idx_shares_expires ON shares(expires_at) WHERE expires_at IS NOT NULL;
