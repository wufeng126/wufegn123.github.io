-- 班组结算：增加扣款项（借支/劳保/帮工/安全基金）
-- 兼容已存在的 team_settlements 表（无扣款列时补列）
-- 同时也用于开发库首次建表（若表不存在，先按完整结构创建）

-- 1) 若 team_settlements 表不存在（新库首次部署），创建完整结构（含扣款字段）
CREATE TABLE IF NOT EXISTS team_settlements (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  team_id INTEGER REFERENCES team_groups(id) ON DELETE SET NULL,
  settlement_no VARCHAR(50),
  settlement_month VARCHAR(7) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'draft',
  remark TEXT,
  advance_deduct NUMERIC(14,2) DEFAULT 0,
  labor_insurance_deduct NUMERIC(14,2) DEFAULT 0,
  helper_deduct NUMERIC(14,2) DEFAULT 0,
  safety_fund_deduct NUMERIC(14,2) DEFAULT 0,
  created_by INTEGER,
  created_by_name VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS team_settlements_project_id_idx ON team_settlements(project_id);
CREATE INDEX IF NOT EXISTS team_settlements_team_id_idx ON team_settlements(team_id);
CREATE INDEX IF NOT EXISTS team_settlements_month_idx ON team_settlements(settlement_month);
CREATE INDEX IF NOT EXISTS team_settlements_created_at_idx ON team_settlements(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS team_settlements_settlement_no_key
  ON team_settlements(settlement_no) WHERE settlement_no IS NOT NULL;

-- 2) 为已存在的旧表补扣款列（幂等：列已存在则跳过）
ALTER TABLE team_settlements ADD COLUMN IF NOT EXISTS advance_deduct NUMERIC(14,2) DEFAULT 0;
ALTER TABLE team_settlements ADD COLUMN IF NOT EXISTS labor_insurance_deduct NUMERIC(14,2) DEFAULT 0;
ALTER TABLE team_settlements ADD COLUMN IF NOT EXISTS helper_deduct NUMERIC(14,2) DEFAULT 0;
ALTER TABLE team_settlements ADD COLUMN IF NOT EXISTS safety_fund_deduct NUMERIC(14,2) DEFAULT 0;

-- 3) 同步确保 items / splits 表存在（新库首次部署）
CREATE TABLE IF NOT EXISTS team_settlement_items (
  id SERIAL PRIMARY KEY,
  settlement_id INTEGER NOT NULL REFERENCES team_settlements(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  team_id INTEGER REFERENCES team_groups(id) ON DELETE SET NULL,
  content VARCHAR(300) NOT NULL,
  unit VARCHAR(30),
  quantity NUMERIC(14,2) DEFAULT 0,
  unit_price NUMERIC(14,2) DEFAULT 0,
  amount NUMERIC(14,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS team_settlement_items_settlement_id_idx ON team_settlement_items(settlement_id);
CREATE INDEX IF NOT EXISTS team_settlement_items_project_content_idx ON team_settlement_items(project_id, content);

CREATE TABLE IF NOT EXISTS team_settlement_splits (
  id SERIAL PRIMARY KEY,
  settlement_id INTEGER NOT NULL REFERENCES team_settlements(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  team_id INTEGER REFERENCES team_groups(id) ON DELETE SET NULL,
  worker_id INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  worker_name VARCHAR(100),
  work_type VARCHAR(50),
  team_name VARCHAR(100),
  work_hours NUMERIC(10,2) DEFAULT 0,
  unit_price NUMERIC(14,2) DEFAULT 0,
  amount NUMERIC(14,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(settlement_id, worker_id)
);
CREATE INDEX IF NOT EXISTS team_settlement_splits_settlement_id_idx ON team_settlement_splits(settlement_id);
CREATE INDEX IF NOT EXISTS team_settlement_splits_project_worker_idx ON team_settlement_splits(project_id, worker_id);

NOTIFY pgrst, 'reload schema';