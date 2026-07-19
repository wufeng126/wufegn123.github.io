-- Project archive and construction log attachment cleanup.
-- Run once before using project archiving in production.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by INTEGER,
  ADD COLUMN IF NOT EXISTS archive_note TEXT;

ALTER TABLE construction_logs
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attachments_cleaned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attachments_original_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attachments_cleaned_by INTEGER;

CREATE TABLE IF NOT EXISTS project_archives (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  archived_by INTEGER,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  snapshot_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  photo_count INTEGER NOT NULL DEFAULT 0,
  knowledge_doc_id INTEGER,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_archives_project_id_idx ON project_archives(project_id);
CREATE INDEX IF NOT EXISTS project_archives_archived_at_idx ON project_archives(archived_at);
CREATE INDEX IF NOT EXISTS projects_is_archived_idx ON projects(is_archived);
