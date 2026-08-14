-- ═══════════════════════════════════════════════════════════════════════════
-- 核心业务表基线建表迁移（A1 修复）
-- 修复背景：2026-08-11 审计指出 workers/projects/users 等核心表无 CREATE TABLE
-- 迁移，新环境无法复现库结构。本文件补齐全部核心表。
--
-- 幂等性：全部使用 CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS，
-- 可重复执行；对已存在表的线上库为 no-op。
--
-- 使用方式：
--   1. 自动：本文件内容已并入 src/lib/db-migration.ts 的 MIGRATION_SQL，
--      生产环境启动时随 runMigrations() 自动执行；
--   2. 手动：在 Supabase SQL Editor 或 psql 中执行本文件。
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────── 认证与权限（users / permissions / roles） ───────────────────

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  role VARCHAR(20) DEFAULT 'admin',
  role_id INTEGER,
  managed_projects JSONB DEFAULT '[]',
  is_disabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ,
  -- 钉钉绑定字段
  dingtalk_user_id VARCHAR(100) UNIQUE,
  dingtalk_union_id VARCHAR(100),
  dingtalk_mobile VARCHAR(30),
  dingtalk_name VARCHAR(100),
  dingtalk_dept_id VARCHAR(100),
  dingtalk_avatar TEXT,
  dingtalk_active BOOLEAN DEFAULT false,
  last_dingtalk_sync_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  resource VARCHAR(50),
  action VARCHAR(50),
  code VARCHAR(100) UNIQUE,
  name VARCHAR(100),
  description TEXT,
  module VARCHAR(50),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS permissions_resource_idx ON permissions(resource);
CREATE INDEX IF NOT EXISTS permissions_action_idx ON permissions(action);

CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50) UNIQUE,
  description TEXT,
  level INTEGER DEFAULT 5,
  is_super_admin BOOLEAN DEFAULT false,
  permissions JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_roles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, role_id)
);
CREATE INDEX IF NOT EXISTS user_roles_user_id_idx ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS user_roles_role_id_idx ON user_roles(role_id);

CREATE TABLE IF NOT EXISTS role_permissions (
  id SERIAL PRIMARY KEY,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(role_id, permission_id)
);
CREATE INDEX IF NOT EXISTS role_permissions_permission_id_idx ON role_permissions(permission_id);

CREATE TABLE IF NOT EXISTS user_permissions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, permission_id)
);
CREATE INDEX IF NOT EXISTS user_permissions_permission_id_idx ON user_permissions(permission_id);

-- ─────────────────── 项目 ───────────────────

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  year INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT '进行中' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  address VARCHAR(500),
  partner VARCHAR(200),
  contract_amount NUMERIC(14,2),
  icon VARCHAR(50) DEFAULT 'HardHat',
  building_area NUMERIC(12,2),
  tax_rate NUMERIC(5,2),
  expected_completion_date DATE,
  construction_payment_ratio NUMERIC(5,2),
  completion_settlement_payment_ratio NUMERIC(5,2),
  warranty_payment_ratio NUMERIC(5,2),
  warranty_expired_payment_ratio NUMERIC(5,2),
  completion_date DATE,
  warranty_days INTEGER,
  project_type VARCHAR(50) DEFAULT 'business' NOT NULL,
  is_archived BOOLEAN DEFAULT false NOT NULL,
  archived_at TIMESTAMPTZ,
  archived_by INTEGER,
  archive_note TEXT
);
CREATE INDEX IF NOT EXISTS projects_status_idx ON projects(status);
CREATE INDEX IF NOT EXISTS projects_year_idx ON projects(year);
CREATE INDEX IF NOT EXISTS projects_project_type_idx ON projects(project_type);
CREATE INDEX IF NOT EXISTS projects_is_archived_idx ON projects(is_archived);

-- ─────────────────── 工人与工资 ───────────────────

CREATE TABLE IF NOT EXISTS workers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  work_type VARCHAR(50),
  phone VARCHAR(20),
  id_card VARCHAR(18),
  bank_card VARCHAR(30),
  gender VARCHAR(10),
  age INTEGER,
  entry_date VARCHAR(20),
  team_name VARCHAR(100),
  is_blacklist BOOLEAN DEFAULT false,
  remark TEXT,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'in_service',
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS workers_id_card_idx ON workers(id_card);
CREATE INDEX IF NOT EXISTS workers_name_idx ON workers(name);
CREATE INDEX IF NOT EXISTS workers_phone_idx ON workers(phone);
CREATE INDEX IF NOT EXISTS workers_project_id_idx ON workers(project_id);
CREATE INDEX IF NOT EXISTS workers_status_idx ON workers(status);
CREATE UNIQUE INDEX IF NOT EXISTS workers_project_id_card_unique_idx ON workers(project_id, id_card) WHERE id_card IS NOT NULL;

CREATE TABLE IF NOT EXISTS worker_salaries (
  id SERIAL PRIMARY KEY,
  worker_id INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  year_month VARCHAR(7) NOT NULL,
  work_hours NUMERIC(10,2) DEFAULT 0,
  hourly_rate NUMERIC(10,2) DEFAULT 0,
  contract_work_pay NUMERIC(12,2) DEFAULT 0,
  gross_pay NUMERIC(12,2) NOT NULL,
  income_tax NUMERIC(10,2) DEFAULT 0,
  advance_pay NUMERIC(10,2) DEFAULT 0,
  labor_insurance NUMERIC(10,2) DEFAULT 0,
  fine NUMERIC(10,2) DEFAULT 0,
  net_pay NUMERIC(12,2) NOT NULL,
  payment_status VARCHAR(20) DEFAULT 'unpaid',
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS worker_salaries_project_id_idx ON worker_salaries(project_id);
CREATE INDEX IF NOT EXISTS worker_salaries_worker_id_idx ON worker_salaries(worker_id);
CREATE INDEX IF NOT EXISTS worker_salaries_year_month_idx ON worker_salaries(year_month);
CREATE INDEX IF NOT EXISTS worker_salaries_payment_status_idx ON worker_salaries(payment_status);

CREATE TABLE IF NOT EXISTS salary_payments (
  id SERIAL PRIMARY KEY,
  salary_id INTEGER REFERENCES worker_salaries(id) ON DELETE CASCADE,
  worker_id INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  year_month VARCHAR(7),
  payment_amount NUMERIC(12,2) NOT NULL,
  payment_date VARCHAR(20) NOT NULL,
  payment_type VARCHAR(20) DEFAULT '甲方代付',
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS salary_payments_project_id_idx ON salary_payments(project_id);
CREATE INDEX IF NOT EXISTS salary_payments_salary_id_idx ON salary_payments(salary_id);
CREATE INDEX IF NOT EXISTS salary_payments_worker_id_idx ON salary_payments(worker_id);
CREATE INDEX IF NOT EXISTS salary_payments_year_month_idx ON salary_payments(year_month);

CREATE TABLE IF NOT EXISTS worker_import_history (
  id SERIAL PRIMARY KEY,
  import_time TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  file_name VARCHAR(255),
  total_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  update_count INTEGER DEFAULT 0,
  skip_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  import_mode VARCHAR(20) DEFAULT 'insert_only',
  operator VARCHAR(100),
  error_details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS worker_import_history_import_time_idx ON worker_import_history(import_time DESC);

-- ─────────────────── 工程量（分项工程/进度/报量/结算量） ───────────────────

CREATE TABLE IF NOT EXISTS work_items (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_name VARCHAR(200) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  budget_quantity NUMERIC(12,2) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS work_items_project_id_idx ON work_items(project_id);

CREATE TABLE IF NOT EXISTS work_item_progress (
  id SERIAL PRIMARY KEY,
  work_item_id INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  completed_quantity NUMERIC(12,2) NOT NULL,
  record_date TIMESTAMPTZ NOT NULL,
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS work_item_progress_record_date_idx ON work_item_progress(record_date);
CREATE INDEX IF NOT EXISTS work_item_progress_work_item_id_idx ON work_item_progress(work_item_id);

CREATE TABLE IF NOT EXISTS work_item_subitems (
  id SERIAL PRIMARY KEY,
  work_item_id INTEGER REFERENCES work_items(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id),
  subitem_name VARCHAR(200) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  budget_quantity NUMERIC(12,2) NOT NULL,
  completed_quantity NUMERIC(12,2) DEFAULT 0,
  unit_price NUMERIC(12,2),
  contract_price NUMERIC(12,2),
  limit_price NUMERIC(12,2),
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_work_item_subitems_project_id ON work_item_subitems(project_id);
CREATE INDEX IF NOT EXISTS work_item_subitems_work_item_id_idx ON work_item_subitems(work_item_id);

CREATE TABLE IF NOT EXISTS subitem_monthly_reports (
  id SERIAL PRIMARY KEY,
  subitem_id INTEGER NOT NULL REFERENCES work_item_subitems(id) ON DELETE CASCADE,
  year_month VARCHAR(7) NOT NULL,
  report_quantity NUMERIC(12,2) NOT NULL,
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS subitem_monthly_reports_subitem_id_idx ON subitem_monthly_reports(subitem_id);
CREATE INDEX IF NOT EXISTS subitem_monthly_reports_year_month_idx ON subitem_monthly_reports(year_month);

CREATE TABLE IF NOT EXISTS subitem_monthly_progress (
  id SERIAL PRIMARY KEY,
  subitem_id INTEGER NOT NULL REFERENCES work_item_subitems(id) ON DELETE CASCADE,
  year_month VARCHAR(7) NOT NULL,
  completed_quantity NUMERIC(12,2) NOT NULL,
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS subitem_monthly_progress_subitem_id_idx ON subitem_monthly_progress(subitem_id);
CREATE INDEX IF NOT EXISTS subitem_monthly_progress_year_month_idx ON subitem_monthly_progress(year_month);

-- ─────────────────── 甲方报量 / 回款 ───────────────────

CREATE TABLE IF NOT EXISTS client_reports (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  report_amount NUMERIC(12,2) NOT NULL,
  report_date TIMESTAMPTZ NOT NULL,
  work_content VARCHAR(200),
  quantity NUMERIC(12,2),
  unit VARCHAR(20),
  unit_price NUMERIC(12,2),
  settlement_amount NUMERIC(14,2),
  invoice_amount NUMERIC(14,2),
  deduction_amount NUMERIC(14,2),
  proportional_payment NUMERIC(14,2),
  tax_rate NUMERIC(5,2) DEFAULT 9,
  status VARCHAR(20) DEFAULT 'draft',
  reviewed_at TIMESTAMPTZ,
  reviewed_by VARCHAR(100),
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS client_reports_project_id_idx ON client_reports(project_id);
CREATE INDEX IF NOT EXISTS client_reports_report_date_idx ON client_reports(report_date);
CREATE INDEX IF NOT EXISTS client_reports_status_idx ON client_reports(status);

CREATE TABLE IF NOT EXISTS client_payments (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  payment_amount NUMERIC(12,2) NOT NULL,
  payment_date TIMESTAMPTZ NOT NULL,
  payment_method VARCHAR(20) DEFAULT 'bank_transfer',
  status VARCHAR(20) DEFAULT 'completed',
  reviewed_at TIMESTAMPTZ,
  reviewed_by VARCHAR(100),
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS client_payments_payment_date_idx ON client_payments(payment_date);
CREATE INDEX IF NOT EXISTS client_payments_project_id_idx ON client_payments(project_id);

-- ─────────────────── 供应商（老表） ───────────────────

CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  type VARCHAR(50) NOT NULL,
  contact_person VARCHAR(100),
  phone VARCHAR(50),
  bank_name VARCHAR(100),
  bank_account VARCHAR(100),
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settlements (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  project_id INTEGER REFERENCES projects(id),
  settlement_type VARCHAR(100),
  settlement_content TEXT,
  settlement_quantity NUMERIC(12,2),
  settlement_unit VARCHAR(50),
  settlement_amount NUMERIC(12,2) NOT NULL,
  settlement_month VARCHAR(7) NOT NULL,
  settlement_date DATE,
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_settlements_month ON settlements(settlement_month);
CREATE INDEX IF NOT EXISTS idx_settlements_project_id ON settlements(project_id);
CREATE INDEX IF NOT EXISTS idx_settlements_supplier_id ON settlements(supplier_id);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  project_id INTEGER REFERENCES projects(id),
  payment_amount NUMERIC(12,2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_method VARCHAR(50),
  voucher_number VARCHAR(100),
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_project_id ON payments(project_id);
CREATE INDEX IF NOT EXISTS idx_payments_supplier_id ON payments(supplier_id);

-- ─────────────────── 证件 ───────────────────

CREATE TABLE IF NOT EXISTS certificates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  certificate_number VARCHAR(100) NOT NULL,
  owner_type VARCHAR(20) NOT NULL,
  owner_name VARCHAR(200) NOT NULL,
  issue_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  remark TEXT,
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS certificates_owner_type_idx ON certificates(owner_type);
CREATE INDEX IF NOT EXISTS certificates_expiry_date_idx ON certificates(expiry_date);

-- ─────────────────── 通知 ───────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT,
  severity VARCHAR(20) DEFAULT 'info',
  priority INTEGER DEFAULT 0,
  is_read VARCHAR(5) DEFAULT 'false',
  read_at TIMESTAMPTZ,
  project_id INTEGER,
  related_id INTEGER,
  related_type VARCHAR(50),
  recipient_user_id INTEGER,
  recipient_role VARCHAR(50),
  metadata TEXT,
  is_sent VARCHAR(5) DEFAULT 'false',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS notifications_type_idx ON notifications(type);
CREATE INDEX IF NOT EXISTS notifications_project_id_idx ON notifications(project_id);
CREATE INDEX IF NOT EXISTS notifications_recipient_user_id_idx ON notifications(recipient_user_id);
CREATE INDEX IF NOT EXISTS notifications_recipient_role_idx ON notifications(recipient_role);
CREATE INDEX IF NOT EXISTS notifications_is_read_idx ON notifications(is_read);
CREATE INDEX IF NOT EXISTS notifications_priority_idx ON notifications(priority DESC);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications(created_at DESC);

-- ─────────────────── 综合费用 / 零星材料 ───────────────────

CREATE TABLE IF NOT EXISTS comprehensive_expenses (
  id SERIAL PRIMARY KEY,
  project_id INTEGER,
  expense_type VARCHAR(50) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  expense_date DATE NOT NULL,
  handler VARCHAR(100),
  remark TEXT,
  attachments TEXT,
  created_by VARCHAR(100),
  status VARCHAR(20) DEFAULT 'draft',
  reviewed_at TIMESTAMPTZ,
  reviewed_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS comprehensive_expenses_project_id_idx ON comprehensive_expenses(project_id);
CREATE INDEX IF NOT EXISTS comprehensive_expenses_status_idx ON comprehensive_expenses(status);

CREATE TABLE IF NOT EXISTS miscellaneous_materials (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL,
  material_name VARCHAR(200) NOT NULL,
  specification VARCHAR(100),
  unit VARCHAR(20),
  quantity NUMERIC(12,2) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  purchase_date DATE NOT NULL,
  purchaser VARCHAR(100),
  remark TEXT,
  status VARCHAR(20) DEFAULT 'draft',
  reviewed_at TIMESTAMPTZ,
  reviewed_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS miscellaneous_materials_project_id_idx ON miscellaneous_materials(project_id);
CREATE INDEX IF NOT EXISTS miscellaneous_materials_status_idx ON miscellaneous_materials(status);

-- ─────────────────── 月度经营月报快照 ───────────────────

CREATE TABLE IF NOT EXISTS monthly_report_snapshots (
  id SERIAL PRIMARY KEY,
  report_month VARCHAR(7) NOT NULL,
  project_scope VARCHAR(20) DEFAULT 'all' NOT NULL,
  project_ids INTEGER[],
  template_type VARCHAR(30) DEFAULT 'summary' NOT NULL,
  data_snapshot JSONB DEFAULT '{}' NOT NULL,
  pdf_url TEXT,
  generated_by VARCHAR(100),
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS monthly_report_snapshots_month_idx ON monthly_report_snapshots(report_month);

-- ─────────────────── 钉钉通讯录 / 安全日志 ───────────────────

CREATE TABLE IF NOT EXISTS dingtalk_contacts (
  id SERIAL PRIMARY KEY,
  dingtalk_user_id VARCHAR(100) NOT NULL UNIQUE,
  union_id VARCHAR(100),
  name VARCHAR(100) NOT NULL,
  mobile VARCHAR(30),
  dept_id_list VARCHAR(500),
  dept_name_list VARCHAR(500),
  avatar TEXT,
  active BOOLEAN DEFAULT true,
  title VARCHAR(100),
  sync_time TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS dingtalk_contacts_mobile_idx ON dingtalk_contacts(mobile);
CREATE INDEX IF NOT EXISTS dingtalk_contacts_name_idx ON dingtalk_contacts(name);
CREATE INDEX IF NOT EXISTS dingtalk_contacts_active_idx ON dingtalk_contacts(active);

CREATE TABLE IF NOT EXISTS dingtalk_security_logs (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  dingtalk_user_id VARCHAR(100),
  dingtalk_name VARCHAR(100),
  system_user_id INTEGER,
  system_username VARCHAR(100),
  ip_address VARCHAR(50),
  user_agent TEXT,
  result VARCHAR(20) NOT NULL,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS dingtalk_security_logs_event_type_idx ON dingtalk_security_logs(event_type);
CREATE INDEX IF NOT EXISTS dingtalk_security_logs_system_user_id_idx ON dingtalk_security_logs(system_user_id);
CREATE INDEX IF NOT EXISTS dingtalk_security_logs_created_at_idx ON dingtalk_security_logs(created_at);

-- ─────────────────── 签证 ───────────────────

CREATE TABLE IF NOT EXISTS visas (
  id SERIAL PRIMARY KEY,
  visa_number VARCHAR(50) NOT NULL UNIQUE,
  visa_name VARCHAR(200),
  project_id INTEGER,
  occurrence_date DATE,
  visa_quantity NUMERIC(12,2),
  visa_unit VARCHAR(20),
  visa_amount NUMERIC(14,2),
  status VARCHAR(30) DEFAULT '待办理',
  handler VARCHAR(100),
  remark TEXT,
  attachments JSONB DEFAULT '[]',
  -- 签证工作流字段（与 migrations/add_visa_workflow_fields.sql 对齐）
  budget_user_id INTEGER,
  budget_user_name VARCHAR(100),
  project_manager_user_id INTEGER,
  project_manager_name VARCHAR(100),
  current_responsible_user_id INTEGER,
  current_responsible_name VARCHAR(100),
  workflow_step_updated_at TIMESTAMPTZ,
  workflow_last_reminded_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  business_confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  workflow_comment TEXT,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS visas_project_id_idx ON visas(project_id);
CREATE INDEX IF NOT EXISTS visas_status_idx ON visas(status);
CREATE INDEX IF NOT EXISTS visas_current_responsible_user_id_idx ON visas(current_responsible_user_id);
CREATE INDEX IF NOT EXISTS visas_workflow_step_updated_at_idx ON visas(workflow_step_updated_at);
CREATE INDEX IF NOT EXISTS visas_status_workflow_step_idx ON visas(status, workflow_step_updated_at);

CREATE TABLE IF NOT EXISTS visa_attachments (
  id SERIAL PRIMARY KEY,
  visa_id INTEGER NOT NULL REFERENCES visas(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_key TEXT NOT NULL,
  file_size INTEGER,
  file_type VARCHAR(100),
  uploaded_by INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS visa_attachments_visa_id_idx ON visa_attachments(visa_id);

-- ─────────────────── 限价管理 ───────────────────

CREATE TABLE IF NOT EXISTS project_limit_prices (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL,
  subitem_name VARCHAR(200) NOT NULL,
  work_type VARCHAR(50),
  team_name VARCHAR(100),
  unit VARCHAR(20) NOT NULL,
  limit_unit_price NUMERIC(12,2) NOT NULL,
  plan_quantity NUMERIC(12,2) DEFAULT 0,
  remark TEXT,
  status VARCHAR(20) DEFAULT '草稿',
  created_by INTEGER,
  created_by_name VARCHAR(100),
  reviewed_by INTEGER,
  reviewed_by_name VARCHAR(100),
  reviewed_at TIMESTAMPTZ,
  invalidated_by INTEGER,
  invalidated_by_name VARCHAR(100),
  invalidated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS project_limit_prices_project_id_idx ON project_limit_prices(project_id);
CREATE INDEX IF NOT EXISTS project_limit_prices_status_idx ON project_limit_prices(status);

CREATE TABLE IF NOT EXISTS project_limit_price_logs (
  id SERIAL PRIMARY KEY,
  limit_price_id INTEGER NOT NULL,
  action VARCHAR(50),
  operator_id INTEGER,
  operator_name VARCHAR(100),
  detail JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS project_limit_price_logs_limit_price_id_idx ON project_limit_price_logs(limit_price_id);

-- ─────────────────── 审计 / 安全日志 ───────────────────

CREATE TABLE IF NOT EXISTS operation_logs (
  id SERIAL PRIMARY KEY,
  operation_type VARCHAR(50),
  resource_type VARCHAR(50),
  resource_id INTEGER,
  details JSONB,
  user_id INTEGER,
  username VARCHAR(100),
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS operation_logs_resource_idx ON operation_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS operation_logs_user_idx ON operation_logs(user_id);
CREATE INDEX IF NOT EXISTS operation_logs_created_at_idx ON operation_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS security_logs (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  user_id INTEGER,
  username VARCHAR(100),
  ip_address VARCHAR(50),
  user_agent TEXT,
  result VARCHAR(20) NOT NULL,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS security_logs_event_type_idx ON security_logs(event_type);
CREATE INDEX IF NOT EXISTS security_logs_user_id_idx ON security_logs(user_id);
CREATE INDEX IF NOT EXISTS security_logs_created_at_idx ON security_logs(created_at DESC);

NOTIFY pgrst, 'reload schema';
