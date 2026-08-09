-- ============================================================
-- AI 功能基础设施建表（AI 不可用根因修复之一）
--
-- 背景：schema.ts 定义了 ai_configs 等 5 张 AI 表，但数据库从未建表
-- → getAIConfig() 查表报错返回 null → 所有 AI 功能被禁用
-- 本迁移补齐 5 张表，执行后 AI 配置/对话/知识库/审计/限额全部可用
-- ============================================================

-- 1. AI 配置表（ai_configs）
CREATE TABLE IF NOT EXISTS ai_configs (
  id serial PRIMARY KEY,
  model_id varchar(100) NOT NULL DEFAULT 'doubao-seed-2-0-lite-260215',
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
