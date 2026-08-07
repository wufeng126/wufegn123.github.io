CREATE TABLE IF NOT EXISTS construction_log_progress_entries (
  id SERIAL PRIMARY KEY,
  log_id INTEGER NOT NULL REFERENCES construction_logs(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  progress_task_id INTEGER NOT NULL REFERENCES project_progress_tasks(id) ON DELETE CASCADE,
  actual_progress NUMERIC(6,2) NOT NULL DEFAULT 0,
  completed_quantity NUMERIC(14,2),
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(log_id, progress_task_id)
);

CREATE INDEX IF NOT EXISTS construction_log_progress_entries_log_idx ON construction_log_progress_entries(log_id);
CREATE INDEX IF NOT EXISTS construction_log_progress_entries_task_idx ON construction_log_progress_entries(progress_task_id);
CREATE INDEX IF NOT EXISTS construction_log_progress_entries_project_idx ON construction_log_progress_entries(project_id);

ALTER TABLE IF EXISTS construction_log_progress_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS construction_log_progress_entries_public_select ON construction_log_progress_entries;
DROP POLICY IF EXISTS construction_log_progress_entries_public_insert ON construction_log_progress_entries;
DROP POLICY IF EXISTS construction_log_progress_entries_public_update ON construction_log_progress_entries;
DROP POLICY IF EXISTS construction_log_progress_entries_public_delete ON construction_log_progress_entries;
CREATE POLICY construction_log_progress_entries_public_select ON construction_log_progress_entries FOR SELECT USING (true);
CREATE POLICY construction_log_progress_entries_public_insert ON construction_log_progress_entries FOR INSERT WITH CHECK (true);
CREATE POLICY construction_log_progress_entries_public_update ON construction_log_progress_entries FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY construction_log_progress_entries_public_delete ON construction_log_progress_entries FOR DELETE USING (true);

NOTIFY pgrst, 'reload schema';
