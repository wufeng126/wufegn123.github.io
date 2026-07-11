-- 施工日志表
CREATE TABLE IF NOT EXISTS construction_logs (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  user_name VARCHAR(100),
  log_date VARCHAR(10) NOT NULL,
  location VARCHAR(200),
  content TEXT NOT NULL,
  headcount INTEGER,
  issues TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS construction_logs_project_id_idx ON construction_logs(project_id);
CREATE INDEX IF NOT EXISTS construction_logs_user_id_idx ON construction_logs(user_id);
CREATE INDEX IF NOT EXISTS construction_logs_log_date_idx ON construction_logs(log_date);
