-- 施工日志提交时效与项目日报汇总

ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS daily_group_id VARCHAR(64);
ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS submission_status VARCHAR(20) DEFAULT 'normal';
ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE construction_logs ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) DEFAULT 'manual';

UPDATE construction_logs
SET
  daily_group_id = COALESCE(daily_group_id, 'legacy-' || id::TEXT),
  submission_status = COALESCE(submission_status, 'normal'),
  submitted_at = COALESCE(submitted_at, created_at),
  source_type = COALESCE(source_type, 'manual')
WHERE daily_group_id IS NULL
   OR submission_status IS NULL
   OR submitted_at IS NULL
   OR source_type IS NULL;

CREATE INDEX IF NOT EXISTS construction_logs_daily_group_id_idx ON construction_logs(daily_group_id);
CREATE INDEX IF NOT EXISTS construction_logs_user_date_idx ON construction_logs(user_id, log_date);
CREATE INDEX IF NOT EXISTS construction_logs_submission_status_idx ON construction_logs(submission_status);

CREATE TABLE IF NOT EXISTS construction_daily_reports (
  id SERIAL PRIMARY KEY,
  report_date VARCHAR(10) NOT NULL UNIQUE,
  summary JSONB NOT NULL DEFAULT '{}'::JSONB,
  content TEXT NOT NULL,
  ai_summary TEXT,
  ai_status VARCHAR(20) DEFAULT 'pending',
  generated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  pushed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS construction_daily_reports_date_idx ON construction_daily_reports(report_date);
