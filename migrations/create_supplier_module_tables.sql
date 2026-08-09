-- ============================================================
-- 供应商模块建表迁移（supplier_contracts / supplier_settlements /
-- supplier_payments / supplier_contract_logs）
--
-- 背景：schema.ts 有定义但 migrations 从未建表 → 全新库部署时
-- 供应商台账/结算/付款/删除守卫全部失效；老库迁移前需确认表是否已存在
-- （CREATE TABLE IF NOT EXISTS 幂等，可安全执行）
-- ============================================================

-- 1. 供应商合同表
CREATE TABLE IF NOT EXISTS supplier_contracts (
  id serial PRIMARY KEY,
  supplier_id integer NOT NULL,
  project_id integer,
  contract_name varchar(200),
  contract_no varchar(50),
  contract_amount numeric(14,2),
  total_amount numeric(14,2),
  settlement_amount numeric(14,2),
  contract_date date,
  sign_date date,
  expire_date date,
  contract_status varchar(20) NOT NULL DEFAULT '履约中',
  payment_ratio_active numeric(5,2) DEFAULT '80',
  payment_ratio_complete numeric(5,2) DEFAULT '95',
  payment_ratio_final numeric(5,2) DEFAULT '100',
  supply_content text,
  payment_method varchar(50) DEFAULT '按进度付款',
  payment_days integer,
  payment_remark text,
  attachment_url text,
  remark text,
  created_by uuid,
  created_by_name varchar(100),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_contracts_supplier_id_idx ON supplier_contracts(supplier_id);
CREATE INDEX IF NOT EXISTS supplier_contracts_project_id_idx ON supplier_contracts(project_id);
CREATE INDEX IF NOT EXISTS supplier_contracts_contract_status_idx ON supplier_contracts(contract_status);

-- 2. 供应商结算表
CREATE TABLE IF NOT EXISTS supplier_settlements (
  id serial PRIMARY KEY,
  contract_id integer,
  settlement_date date,
  settlement_type varchar(50),
  settlement_amount numeric(14,2),
  invoice_amount numeric(14,2),
  tax_amount numeric(14,2),
  payable_amount numeric(14,2),
  settlement_no varchar(50),
  status varchar(20) NOT NULL DEFAULT 'draft',
  reviewed_at timestamptz,
  reviewed_by varchar(100),
  remark text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_settlements_contract_id_idx ON supplier_settlements(contract_id);
CREATE INDEX IF NOT EXISTS supplier_settlements_status_idx ON supplier_settlements(status);

-- 3. 供应商付款表
CREATE TABLE IF NOT EXISTS supplier_payments (
  id serial PRIMARY KEY,
  supplier_id integer NOT NULL,
  project_id integer,
  contract_id integer,
  settlement_id integer,
  payment_amount numeric(14,2) NOT NULL,
  payment_date date,
  payment_method varchar(50),
  payment_no varchar(50),
  payment_type varchar(20) NOT NULL DEFAULT 'progress',
  status varchar(20) NOT NULL DEFAULT 'completed',
  remark text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_payments_supplier_id_idx ON supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS supplier_payments_project_id_idx ON supplier_payments(project_id);
CREATE INDEX IF NOT EXISTS supplier_payments_contract_id_idx ON supplier_payments(contract_id);

-- 4. 供应商合同操作日志表
CREATE TABLE IF NOT EXISTS supplier_contract_logs (
  id serial PRIMARY KEY,
  contract_id integer,
  action varchar(100),
  operator_id integer,
  operator_name varchar(100),
  detail jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_contract_logs_contract_id_idx ON supplier_contract_logs(contract_id);

NOTIFY pgrst, 'reload schema';
