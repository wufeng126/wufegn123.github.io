-- 慢接口监控：只记录耗时超过阈值（默认 1.5s）的接口调用
CREATE TABLE IF NOT EXISTS api_timing_logs (
  id BIGSERIAL PRIMARY KEY,
  path VARCHAR(300) NOT NULL,
  duration_ms INTEGER NOT NULL,
  ok BOOLEAN DEFAULT TRUE,
  page VARCHAR(300),
  user_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS api_timing_logs_created_idx ON api_timing_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS api_timing_logs_path_idx ON api_timing_logs(path);
