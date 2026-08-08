-- 施工日志风险事件流表
-- 将风险状态从日志 tags 中剥离，形成独立的状态机：pending -> confirmed/ignored -> resolved -> monthly/visa_created
CREATE TABLE IF NOT EXISTS construction_risk_events (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  log_id INTEGER NOT NULL REFERENCES construction_logs(id) ON DELETE CASCADE,
  risk_type TEXT NOT NULL DEFAULT 'change',        -- 主风险类型 change/visa/delay/quality/safety/cost
  risk_types TEXT[] NOT NULL DEFAULT '{}',         -- 全部命中类型
  level TEXT NOT NULL DEFAULT 'low',               -- low/medium/high
  status TEXT NOT NULL DEFAULT 'pending',          -- pending/confirmed/ignored/resolved/monthly/monthly_included/visa_created
  occurred_date DATE NOT NULL,                     -- 风险发生日期（日志日期）
  content TEXT,                                    -- 日志内容摘要
  issues TEXT,                                     -- 异常/问题描述
  summary TEXT,                                    -- 风险摘要
  recommendation TEXT,                             -- 跟进建议
  matched_keywords TEXT[] NOT NULL DEFAULT '{}',   -- 触发关键词
  confirmed_by INTEGER REFERENCES users(id),
  confirmed_at TIMESTAMPTZ,
  resolved_by INTEGER REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(log_id)
);

CREATE INDEX IF NOT EXISTS construction_risk_events_project_idx ON construction_risk_events(project_id);
CREATE INDEX IF NOT EXISTS construction_risk_events_date_idx ON construction_risk_events(occurred_date);
CREATE INDEX IF NOT EXISTS construction_risk_events_status_idx ON construction_risk_events(status);
CREATE INDEX IF NOT EXISTS construction_risk_events_project_date_idx ON construction_risk_events(project_id, occurred_date);

ALTER TABLE IF EXISTS construction_risk_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS construction_risk_events_public_select ON construction_risk_events;
DROP POLICY IF EXISTS construction_risk_events_public_insert ON construction_risk_events;
DROP POLICY IF EXISTS construction_risk_events_public_update ON construction_risk_events;
DROP POLICY IF EXISTS construction_risk_events_public_delete ON construction_risk_events;
CREATE POLICY construction_risk_events_public_select ON construction_risk_events FOR SELECT USING (true);
CREATE POLICY construction_risk_events_public_insert ON construction_risk_events FOR INSERT WITH CHECK (true);
CREATE POLICY construction_risk_events_public_update ON construction_risk_events FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY construction_risk_events_public_delete ON construction_risk_events FOR DELETE USING (true);

NOTIFY pgrst, 'reload schema';
