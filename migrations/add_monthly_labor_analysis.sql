-- 月度用工分析（点工按工作内容分项：文明施工、装卸车…）
CREATE TABLE IF NOT EXISTS monthly_labor_analyses (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  year_month VARCHAR(7) NOT NULL,
  budget_hours NUMERIC(14,2),      -- 预算/计划工时（选填，用于超支对比）
  budget_amount NUMERIC(14,2),     -- 预算/计划金额（选填）
  total_hours NUMERIC(14,2) DEFAULT 0,
  total_amount NUMERIC(14,2) DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',  -- draft | submitted | confirmed
  remark TEXT,
  submitted_by INTEGER,
  submitted_by_name VARCHAR(100),
  submitted_at TIMESTAMPTZ,
  confirmed_by INTEGER,
  confirmed_by_name VARCHAR(100),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS monthly_labor_analyses_unique_idx
  ON monthly_labor_analyses(project_id, year_month);

CREATE TABLE IF NOT EXISTS monthly_labor_items (
  id SERIAL PRIMARY KEY,
  analysis_id INTEGER NOT NULL REFERENCES monthly_labor_analyses(id) ON DELETE CASCADE,
  category VARCHAR(50) NOT NULL,        -- 文明施工 / 装卸车 / 清理搬运 …
  work_content VARCHAR(200),            -- 具体描述
  worker_type VARCHAR(30),              -- 普工 / 技工 / 其他
  hours NUMERIC(12,2) DEFAULT 0,
  hourly_rate NUMERIC(12,2) DEFAULT 0,
  amount NUMERIC(14,2) DEFAULT 0,
  remark VARCHAR(200),
  sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS monthly_labor_items_analysis_idx ON monthly_labor_items(analysis_id, sort_order);
