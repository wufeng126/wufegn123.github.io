-- team_settlement_split_salary_pipeline.sql
-- 班组分账→工资应发+发放 完整闭环
-- 1) worker_salaries 标记来源来源（manual/team_settlement），关联结算单与班组
ALTER TABLE worker_salaries ADD COLUMN IF NOT EXISTS source varchar(20) NOT NULL DEFAULT 'manual';
ALTER TABLE worker_salaries ADD COLUMN IF NOT EXISTS settlement_id integer;
ALTER TABLE worker_salaries ADD COLUMN IF NOT EXISTS team_id integer;
COMMENT ON COLUMN worker_salaries.source IS '应发来源：manual 手工录入 / team_settlement 班组分账生成';
COMMENT ON COLUMN worker_salaries.settlement_id IS '班组结算单ID（source=team_settlement时）';
COMMENT ON COLUMN worker_salaries.team_id IS '班组ID（source=team_settlement时）';
-- 同一结算单同一工人只生成一条应发（防重复）
CREATE UNIQUE INDEX IF NOT EXISTS worker_salaries_settlement_worker_uq ON worker_salaries (settlement_id, worker_id) WHERE settlement_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS worker_salaries_team_idx ON worker_salaries (team_id) WHERE team_id IS NOT NULL;

-- 2) salary_payments 标记付款主体（甲方代付/公司支付）与班组归属
ALTER TABLE salary_payments ADD COLUMN IF NOT EXISTS payer_type varchar(20) NOT NULL DEFAULT '公司支付';
ALTER TABLE salary_payments ADD COLUMN IF NOT EXISTS team_id integer;
COMMENT ON COLUMN salary_payments.payer_type IS '付款主体：公司支付 / 甲方代付';
COMMENT ON COLUMN salary_payments.team_id IS '关联班组ID（A自动带出，可改）';
CREATE INDEX IF NOT EXISTS salary_payments_team_idx ON salary_payments (team_id) WHERE team_id IS NOT NULL;

-- 3) 外键约束（必加！PostgREST 嵌入查询 team_groups(name) 依赖 FK，
--    缺失会导致 GET /api/worker-payments 500 "Could not find a relationship ... in the schema cache"）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salary_payments_team_id_fkey') THEN
    ALTER TABLE salary_payments ADD CONSTRAINT salary_payments_team_id_fkey FOREIGN KEY (team_id) REFERENCES team_groups (id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'worker_salaries_team_id_fkey') THEN
    ALTER TABLE worker_salaries ADD CONSTRAINT worker_salaries_team_id_fkey FOREIGN KEY (team_id) REFERENCES team_groups (id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'worker_salaries_settlement_id_fkey') THEN
    ALTER TABLE worker_salaries ADD CONSTRAINT worker_salaries_settlement_id_fkey FOREIGN KEY (settlement_id) REFERENCES team_settlements (id) ON DELETE SET NULL;
  END IF;
END $$;