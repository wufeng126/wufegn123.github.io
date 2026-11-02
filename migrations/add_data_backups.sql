-- 数据备份任务记录：每次备份一条，记录行数/大小/耗时/结果
CREATE TABLE IF NOT EXISTS data_backups (
  id SERIAL PRIMARY KEY,
  backup_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'running', -- running / success / failed
  table_count INTEGER DEFAULT 0,
  row_count INTEGER DEFAULT 0,
  size_bytes BIGINT DEFAULT 0,
  manifest_key TEXT,
  encrypted BOOLEAN DEFAULT FALSE,
  error TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS data_backups_date_idx ON data_backups(backup_date DESC);
