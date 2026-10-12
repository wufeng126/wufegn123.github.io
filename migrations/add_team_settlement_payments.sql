-- 班组结算付款记录表（挂结算单，多笔付款累计为已付金额）
CREATE TABLE IF NOT EXISTS team_settlement_payments (
  id SERIAL PRIMARY KEY,
  settlement_id INTEGER NOT NULL REFERENCES team_settlements(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  team_id INTEGER REFERENCES team_groups(id) ON DELETE SET NULL,
  payment_amount NUMERIC(14,2) DEFAULT 0,
  method VARCHAR(30) DEFAULT 'bank',
  method_desc VARCHAR(50),
  payment_date TIMESTAMPTZ DEFAULT NOW(),
  remark TEXT,
  created_by INTEGER,
  created_by_name VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS team_settlement_payments_settlement_id_idx ON team_settlement_payments(settlement_id);
CREATE INDEX IF NOT EXISTS team_settlement_payments_project_id_idx ON team_settlement_payments(project_id);
CREATE INDEX IF NOT EXISTS team_settlement_payments_team_id_idx ON team_settlement_payments(team_id);
NOTIFY pgrst, 'reload schema';