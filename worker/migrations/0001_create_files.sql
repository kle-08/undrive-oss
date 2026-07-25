-- Files table: maps virtual paths to R2 keys
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  parent TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'other',
  size INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT DEFAULT NULL
);

-- Index for listing files in a folder
CREATE INDEX idx_files_parent ON files(parent) WHERE deleted_at IS NULL;

-- Index for listing trash
CREATE INDEX idx_files_trash ON files(deleted_at) WHERE deleted_at IS NOT NULL;

-- Index for R2 key lookup
CREATE INDEX idx_files_r2_key ON files(r2_key);
