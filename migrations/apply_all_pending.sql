-- ============================================================
-- 一键应用待执行迁移（幂等，可重复执行）
-- 在 Supabase → SQL Editor 中整段粘贴执行即可
-- 包含：AI 功能 5 表 + 供应商模块 4 表
-- ============================================================

-- ############ 第 1 部分：AI 功能基础设施 ############

-- 1. AI 全局配置表（ai_configs）
CREATE TABLE IF NOT EXISTS ai_configs (
  id serial PRIMARY KEY,
  model_id varchar(100) NOT NULL,
  api_endpoint text,
  api_key varchar(500),
  max_context_length integer NOT NULL DEFAULT 20,
  daily_limit integer NOT NULL DEFAULT 100,
  temperature numeric(3,2) NOT NULL DEFAULT '0.70',
  enabled boolean NOT NULL DEFAULT true,
  module_data_query boolean NOT NULL DEFAULT true,
  module_report_analysis boolean NOT NULL DEFAULT true,
  module_error_diagnosis boolean NOT NULL DEFAULT true,
  module_doc_generation boolean NOT NULL DEFAULT true,
  module_supplier_analysis boolean NOT NULL DEFAULT true,
  module_salary_analysis boolean NOT NULL DEFAULT true,
  module_visa_assistant boolean NOT NULL DEFAULT true,
  content_filter_enabled boolean NOT NULL DEFAULT true,
  mask_sensitive boolean NOT NULL DEFAULT true,
  offline_fallback_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. AI 知识库文档表（ai_knowledge_docs）
CREATE TABLE IF NOT EXISTS ai_knowledge_docs (
  id serial PRIMARY KEY,
  title varchar(200) NOT NULL,
  category varchar(50) NOT NULL,
  source_type varchar(30) NOT NULL,
  source_ref text,
  content text NOT NULL,
  file_key text,
  file_name varchar(300),
  file_size integer,
  chunk_count integer NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'active',
  error_message text,
  dataset_name varchar(100) NOT NULL DEFAULT 'labor_ai_kb',
  last_sync_at timestamptz,
  created_by integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_knowledge_docs_category_idx ON ai_knowledge_docs(category);
CREATE INDEX IF NOT EXISTS ai_knowledge_docs_status_idx ON ai_knowledge_docs(status);

-- 3. AI 对话历史表（ai_chat_histories）
CREATE TABLE IF NOT EXISTS ai_chat_histories (
  id serial PRIMARY KEY,
  session_id varchar(50) NOT NULL,
  user_id integer NOT NULL,
  username varchar(100),
  role varchar(20) NOT NULL,
  content text NOT NULL,
  page_context varchar(200),
  model_id varchar(100),
  token_count integer DEFAULT 0,
  is_masked boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_chat_histories_session_id_idx ON ai_chat_histories(session_id);
CREATE INDEX IF NOT EXISTS ai_chat_histories_user_id_idx ON ai_chat_histories(user_id);
CREATE INDEX IF NOT EXISTS ai_chat_histories_created_at_idx ON ai_chat_histories(created_at);

-- 4. AI 审计日志表（ai_audit_logs）
CREATE TABLE IF NOT EXISTS ai_audit_logs (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  username varchar(100),
  action varchar(50) NOT NULL,
  input_summary text,
  output_summary text,
  page_context varchar(200),
  model_id varchar(100),
  token_usage integer DEFAULT 0,
  response_time_ms integer DEFAULT 0,
  is_success boolean NOT NULL DEFAULT true,
  error_message text,
  ip_address varchar(50),
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_audit_logs_user_id_idx ON ai_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS ai_audit_logs_action_idx ON ai_audit_logs(action);
CREATE INDEX IF NOT EXISTS ai_audit_logs_created_at_idx ON ai_audit_logs(created_at);

-- 5. AI 每日调用统计表（ai_daily_usage）
CREATE TABLE IF NOT EXISTS ai_daily_usage (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  usage_date varchar(10) NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  token_total integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_daily_usage_user_date_key UNIQUE (user_id, usage_date)
);
CREATE INDEX IF NOT EXISTS ai_daily_usage_date_idx ON ai_daily_usage(usage_date);

-- 刷新 PostgREST schema 缓存，让新表立即可查询
NOTIFY pgrst, 'reload schema';


-- ############ 第 2 部分：供应商模块 ############

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
