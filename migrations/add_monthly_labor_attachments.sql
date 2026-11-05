-- 月度用工分析附件（每月可上传多份，如原始统计表扫描件）
CREATE TABLE IF NOT EXISTS monthly_labor_attachments (
  id SERIAL PRIMARY KEY,
  analysis_id INTEGER NOT NULL REFERENCES monthly_labor_analyses(id) ON DELETE CASCADE,
  file_key TEXT NOT NULL,
  file_name VARCHAR(255),
  content_type VARCHAR(100),
  size_bytes BIGINT DEFAULT 0,
  uploaded_by INTEGER,
  uploaded_by_name VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS monthly_labor_attachments_analysis_idx
  ON monthly_labor_attachments(analysis_id);

CREATE INDEX IF NOT EXISTS monthly_labor_attachments_analysis_id_idx
  ON monthly_labor_analyses(id);
