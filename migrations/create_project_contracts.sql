-- 项目合同文件表
CREATE TABLE IF NOT EXISTS project_contracts (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT,
  file_type VARCHAR(100),
  storage_path TEXT NOT NULL,
  uploaded_by INTEGER,
  remark VARCHAR(500),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS project_contracts_project_id_idx ON project_contracts(project_id);
