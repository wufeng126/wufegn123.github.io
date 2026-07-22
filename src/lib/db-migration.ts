import { createClient } from '@supabase/supabase-js';

type MigrationMode = 'postgres' | 'supabase-rpc' | 'manual';

export type MigrationResult = {
  ok: boolean;
  mode: MigrationMode;
  message: string;
  error?: string;
  sql: string;
  manualUrl?: string;
};

export const MIGRATION_SQL = `
-- Core online migration. Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS construction_logs (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  user_name VARCHAR(100),
  log_date VARCHAR(10) NOT NULL,
  location VARCHAR(200),
  content TEXT NOT NULL,
  headcount INTEGER,
  issues TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE IF EXISTS construction_logs
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'submitted',
  ADD COLUMN IF NOT EXISTS scheduled_submit_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_by INTEGER,
  ADD COLUMN IF NOT EXISTS scheduled_cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS daily_group_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS submission_status VARCHAR(20) DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attachments_cleaned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attachments_original_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attachments_cleaned_by INTEGER,
  ADD COLUMN IF NOT EXISTS attendance_worker_ids INTEGER[] DEFAULT '{}'::integer[],
  ADD COLUMN IF NOT EXISTS attendance_workers JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attendance_worker_hours JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

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

CREATE INDEX IF NOT EXISTS construction_logs_project_id_idx ON construction_logs(project_id);
CREATE INDEX IF NOT EXISTS construction_logs_user_id_idx ON construction_logs(user_id);
CREATE INDEX IF NOT EXISTS construction_logs_log_date_idx ON construction_logs(log_date);
CREATE INDEX IF NOT EXISTS construction_logs_status_idx ON construction_logs(status);
CREATE INDEX IF NOT EXISTS construction_logs_scheduled_submit_at_idx ON construction_logs(scheduled_submit_at);
CREATE INDEX IF NOT EXISTS construction_logs_daily_group_id_idx ON construction_logs(daily_group_id);
CREATE INDEX IF NOT EXISTS construction_logs_submission_status_idx ON construction_logs(submission_status);
CREATE INDEX IF NOT EXISTS construction_logs_user_date_idx ON construction_logs(user_id, log_date);

ALTER TABLE IF EXISTS projects
  ADD COLUMN IF NOT EXISTS construction_payment_ratio NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS completion_settlement_payment_ratio NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS warranty_payment_ratio NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS warranty_expired_payment_ratio NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS completion_date DATE,
  ADD COLUMN IF NOT EXISTS warranty_days INTEGER,
  ADD COLUMN IF NOT EXISTS project_type VARCHAR(50) NOT NULL DEFAULT 'business',
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by INTEGER,
  ADD COLUMN IF NOT EXISTS archive_note TEXT;

CREATE INDEX IF NOT EXISTS projects_project_type_idx ON projects(project_type);
CREATE INDEX IF NOT EXISTS projects_is_archived_idx ON projects(is_archived);

INSERT INTO projects (name, year, status, address, partner, contract_amount, icon, project_type)
SELECT
  '公司公共项目/非项目日志',
  EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
  '公共日志',
  '公司内部',
  '公司内部',
  0,
  'ClipboardList',
  'construction_public_log'
WHERE to_regclass('public.projects') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM projects
    WHERE project_type = 'construction_public_log'
       OR name = '公司公共项目/非项目日志'
  );

UPDATE projects
SET project_type = 'construction_public_log'
WHERE name = '公司公共项目/非项目日志';

CREATE TABLE IF NOT EXISTS construction_log_submitters (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(project_id, user_id)
);
CREATE INDEX IF NOT EXISTS construction_log_submitters_project_id_idx ON construction_log_submitters(project_id);
CREATE INDEX IF NOT EXISTS construction_log_submitters_user_id_idx ON construction_log_submitters(user_id);

CREATE TABLE IF NOT EXISTS construction_log_attendance (
  id SERIAL PRIMARY KEY,
  log_id INTEGER NOT NULL REFERENCES construction_logs(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  worker_id INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  worker_name VARCHAR(100),
  work_type VARCHAR(50),
  team_name VARCHAR(100),
  work_hours NUMERIC(8,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(log_id, worker_id)
);
ALTER TABLE IF EXISTS construction_log_attendance ADD COLUMN IF NOT EXISTS work_hours NUMERIC(8,2) DEFAULT 0;
CREATE INDEX IF NOT EXISTS construction_log_attendance_log_id_idx ON construction_log_attendance(log_id);
CREATE INDEX IF NOT EXISTS construction_log_attendance_project_id_idx ON construction_log_attendance(project_id);
CREATE INDEX IF NOT EXISTS construction_log_attendance_worker_id_idx ON construction_log_attendance(worker_id);
CREATE INDEX IF NOT EXISTS construction_log_attendance_project_worker_idx ON construction_log_attendance(project_id, worker_id);

CREATE TABLE IF NOT EXISTS construction_daily_reports (
  id SERIAL PRIMARY KEY,
  report_date VARCHAR(10) NOT NULL UNIQUE,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  content TEXT NOT NULL DEFAULT '',
  ai_summary TEXT,
  ai_status VARCHAR(20) DEFAULT 'pending',
  generated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  pushed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
ALTER TABLE IF EXISTS construction_daily_reports
  ADD COLUMN IF NOT EXISTS report_date VARCHAR(10),
  ADD COLUMN IF NOT EXISTS summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS content TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_summary TEXT,
  ADD COLUMN IF NOT EXISTS ai_status VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS pushed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
WITH ranked_daily_reports AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY report_date
      ORDER BY COALESCE(updated_at, created_at, generated_at) DESC NULLS LAST, id DESC
    ) AS rn
  FROM construction_daily_reports
  WHERE report_date IS NOT NULL
)
DELETE FROM construction_daily_reports
WHERE id IN (SELECT id FROM ranked_daily_reports WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS construction_daily_reports_report_date_key
  ON construction_daily_reports(report_date);
CREATE INDEX IF NOT EXISTS construction_daily_reports_report_date_idx ON construction_daily_reports(report_date);
CREATE INDEX IF NOT EXISTS construction_daily_reports_ai_status_idx ON construction_daily_reports(ai_status);

CREATE TABLE IF NOT EXISTS site_manager_worker_scopes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  worker_id INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, project_id, worker_id)
);
CREATE INDEX IF NOT EXISTS site_manager_worker_scopes_user_project_idx ON site_manager_worker_scopes(user_id, project_id);
CREATE INDEX IF NOT EXISTS site_manager_worker_scopes_worker_id_idx ON site_manager_worker_scopes(worker_id);

CREATE TABLE IF NOT EXISTS workflow_configs (
  id SERIAL PRIMARY KEY,
  workflow_type VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS visas
  ADD COLUMN IF NOT EXISTS current_responsible_user_id INTEGER,
  ADD COLUMN IF NOT EXISTS current_responsible_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS budget_user_id INTEGER,
  ADD COLUMN IF NOT EXISTS budget_user_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS project_manager_user_id INTEGER,
  ADD COLUMN IF NOT EXISTS project_manager_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS workflow_step_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS workflow_last_reminded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS business_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS workflow_comment TEXT;
CREATE INDEX IF NOT EXISTS visas_current_responsible_user_id_idx ON visas(current_responsible_user_id);
CREATE INDEX IF NOT EXISTS visas_workflow_step_updated_at_idx ON visas(workflow_step_updated_at);
CREATE INDEX IF NOT EXISTS visas_status_workflow_step_idx ON visas(status, workflow_step_updated_at);

CREATE TABLE IF NOT EXISTS internal_addon_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  default_price NUMERIC(12,2) DEFAULT 0,
  remark TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_internal_addons (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_id INTEGER REFERENCES internal_addon_templates(id) ON DELETE SET NULL,
  name VARCHAR(200) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  unit_price NUMERIC(12,2) DEFAULT 0,
  remark TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS internal_addon_monthly_settlements (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  addon_id INTEGER NOT NULL REFERENCES project_internal_addons(id) ON DELETE CASCADE,
  year_month VARCHAR(7) NOT NULL,
  quantity NUMERIC(14,2) DEFAULT 0,
  unit_price NUMERIC(12,2) DEFAULT 0,
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(addon_id, year_month)
);
CREATE INDEX IF NOT EXISTS internal_addon_templates_active_idx ON internal_addon_templates(is_active);
CREATE INDEX IF NOT EXISTS project_internal_addons_project_id_idx ON project_internal_addons(project_id);
ALTER TABLE IF EXISTS project_internal_addons DROP CONSTRAINT IF EXISTS project_internal_addons_project_id_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS project_internal_addons_active_name_idx ON project_internal_addons(project_id, name) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS internal_addon_settlements_project_month_idx ON internal_addon_monthly_settlements(project_id, year_month);
CREATE INDEX IF NOT EXISTS internal_addon_settlements_addon_id_idx ON internal_addon_monthly_settlements(addon_id);

ALTER TABLE IF EXISTS workers
  ADD COLUMN IF NOT EXISTS project_id INTEGER,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'in_service',
  ADD COLUMN IF NOT EXISTS gender VARCHAR(10),
  ADD COLUMN IF NOT EXISTS age INTEGER,
  ADD COLUMN IF NOT EXISTS entry_date VARCHAR(20),
  ADD COLUMN IF NOT EXISTS team_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS is_blacklist BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS remark TEXT;
CREATE INDEX IF NOT EXISTS workers_id_card_idx ON workers(id_card);
CREATE INDEX IF NOT EXISTS workers_phone_idx ON workers(phone);

CREATE TABLE IF NOT EXISTS worker_assignments (
  id SERIAL PRIMARY KEY,
  worker_id INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  start_date VARCHAR(20),
  end_date VARCHAR(20),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(worker_id, project_id)
);
CREATE INDEX IF NOT EXISTS worker_assignments_worker_id_idx ON worker_assignments(worker_id);
CREATE INDEX IF NOT EXISTS worker_assignments_project_id_idx ON worker_assignments(project_id);
CREATE INDEX IF NOT EXISTS worker_assignments_status_idx ON worker_assignments(status);

WITH ranked_worker_assignments AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY worker_id, project_id
      ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, id DESC
    ) AS rn
  FROM worker_assignments
)
DELETE FROM worker_assignments
WHERE id IN (SELECT id FROM ranked_worker_assignments WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS worker_assignments_worker_project_key
  ON worker_assignments(worker_id, project_id);

INSERT INTO worker_assignments (worker_id, project_id, start_date, status)
SELECT id, project_id, entry_date, 'active'
FROM workers
WHERE project_id IS NOT NULL
  AND COALESCE(status, 'in_service') <> 'left'
ON CONFLICT (worker_id, project_id) DO UPDATE
SET status = 'active',
    start_date = COALESCE(worker_assignments.start_date, EXCLUDED.start_date),
    end_date = NULL;

CREATE TABLE IF NOT EXISTS wps_worker_sync_logs (
  id SERIAL PRIMARY KEY,
  source VARCHAR(30) DEFAULT 'wps',
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  project_name VARCHAR(200),
  worksheet_name VARCHAR(200),
  worker_id INTEGER REFERENCES workers(id) ON DELETE SET NULL,
  worker_name VARCHAR(100),
  id_card VARCHAR(18),
  phone VARCHAR(30),
  action VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL,
  message TEXT,
  sanitized_fields JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
ALTER TABLE IF EXISTS wps_worker_sync_logs
  ADD COLUMN IF NOT EXISTS source VARCHAR(30) DEFAULT 'wps',
  ADD COLUMN IF NOT EXISTS project_id INTEGER,
  ADD COLUMN IF NOT EXISTS project_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS worksheet_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS worker_id INTEGER,
  ADD COLUMN IF NOT EXISTS worker_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS id_card VARCHAR(18),
  ADD COLUMN IF NOT EXISTS phone VARCHAR(30),
  ADD COLUMN IF NOT EXISTS action VARCHAR(30),
  ADD COLUMN IF NOT EXISTS status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS message TEXT,
  ADD COLUMN IF NOT EXISTS sanitized_fields JSONB,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS wps_worker_sync_logs_created_at_idx ON wps_worker_sync_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS wps_worker_sync_logs_project_id_idx ON wps_worker_sync_logs(project_id);
CREATE INDEX IF NOT EXISTS wps_worker_sync_logs_status_idx ON wps_worker_sync_logs(status);

CREATE TABLE IF NOT EXISTS wps_project_bindings (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  wps_project_name VARCHAR(200),
  worksheet_name VARCHAR(200),
  wps_document_url TEXT,
  wps_form_id VARCHAR(120),
  wps_sheet_id VARCHAR(120),
  wps_table_id VARCHAR(120),
  is_active BOOLEAN DEFAULT TRUE,
  remark TEXT,
  last_sync_at TIMESTAMPTZ,
  last_sync_status VARCHAR(20),
  last_sync_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
ALTER TABLE IF EXISTS wps_project_bindings
  ADD COLUMN IF NOT EXISTS project_id INTEGER,
  ADD COLUMN IF NOT EXISTS wps_project_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS worksheet_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS wps_document_url TEXT,
  ADD COLUMN IF NOT EXISTS wps_form_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS wps_sheet_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS wps_table_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS remark TEXT,
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sync_status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS last_sync_message TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS wps_project_bindings_project_id_idx ON wps_project_bindings(project_id);
CREATE INDEX IF NOT EXISTS wps_project_bindings_active_idx ON wps_project_bindings(is_active);
CREATE INDEX IF NOT EXISTS wps_project_bindings_form_id_idx ON wps_project_bindings(wps_form_id);
CREATE INDEX IF NOT EXISTS wps_project_bindings_sheet_id_idx ON wps_project_bindings(wps_sheet_id);
CREATE INDEX IF NOT EXISTS wps_project_bindings_table_id_idx ON wps_project_bindings(wps_table_id);

CREATE TABLE IF NOT EXISTS project_archives (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  archived_by INTEGER,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  snapshot_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  photo_count INTEGER NOT NULL DEFAULT 0,
  knowledge_doc_id INTEGER,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS project_archives_project_id_idx ON project_archives(project_id);
CREATE INDEX IF NOT EXISTS project_archives_archived_at_idx ON project_archives(archived_at);

CREATE TABLE IF NOT EXISTS team_groups (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  leader_name VARCHAR(100),
  phone VARCHAR(30),
  work_type VARCHAR(50),
  remark TEXT,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(project_id, name)
);
ALTER TABLE IF EXISTS team_groups
  ADD COLUMN IF NOT EXISTS name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS leader_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS phone VARCHAR(30),
  ADD COLUMN IF NOT EXISTS work_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS remark TEXT,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
DO $$
BEGIN
  IF to_regclass('public.team_groups') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'team_groups' AND column_name = 'group_name'
    ) THEN
      EXECUTE $migration$
        UPDATE team_groups
        SET name = COALESCE(NULLIF(name, ''), NULLIF(group_name, ''), 'team-' || id::TEXT)
        WHERE name IS NULL OR name = ''
      $migration$;
    ELSE
      UPDATE team_groups SET name = COALESCE(NULLIF(name, ''), 'team-' || id::TEXT) WHERE name IS NULL OR name = '';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'team_groups' AND column_name = 'team_leader'
    ) THEN
      EXECUTE $migration$
        UPDATE team_groups
        SET leader_name = COALESCE(NULLIF(leader_name, ''), NULLIF(team_leader, ''))
        WHERE leader_name IS NULL OR leader_name = ''
      $migration$;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'team_groups' AND column_name = 'team_leader_phone'
    ) THEN
      EXECUTE $migration$
        UPDATE team_groups
        SET phone = COALESCE(NULLIF(phone, ''), NULLIF(team_leader_phone, ''))
        WHERE phone IS NULL OR phone = ''
      $migration$;
    END IF;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS team_groups_project_id_idx ON team_groups(project_id);
CREATE INDEX IF NOT EXISTS team_groups_work_type_idx ON team_groups(work_type);
CREATE INDEX IF NOT EXISTS team_groups_status_idx ON team_groups(status);

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
  created_by INTEGER,
  created_by_name VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
ALTER TABLE IF EXISTS team_settlements
  ADD COLUMN IF NOT EXISTS project_id INTEGER,
  ADD COLUMN IF NOT EXISTS team_id INTEGER,
  ADD COLUMN IF NOT EXISTS settlement_no VARCHAR(50),
  ADD COLUMN IF NOT EXISTS settlement_month VARCHAR(7),
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end DATE,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS remark TEXT,
  ADD COLUMN IF NOT EXISTS created_by INTEGER,
  ADD COLUMN IF NOT EXISTS created_by_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS team_settlements_project_id_idx ON team_settlements(project_id);
CREATE INDEX IF NOT EXISTS team_settlements_team_id_idx ON team_settlements(team_id);
CREATE INDEX IF NOT EXISTS team_settlements_month_idx ON team_settlements(settlement_month);
CREATE INDEX IF NOT EXISTS team_settlements_created_at_idx ON team_settlements(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS team_settlements_settlement_no_key ON team_settlements(settlement_no) WHERE settlement_no IS NOT NULL;

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
ALTER TABLE IF EXISTS team_settlement_items
  ADD COLUMN IF NOT EXISTS settlement_id INTEGER,
  ADD COLUMN IF NOT EXISTS project_id INTEGER,
  ADD COLUMN IF NOT EXISTS team_id INTEGER,
  ADD COLUMN IF NOT EXISTS content VARCHAR(300),
  ADD COLUMN IF NOT EXISTS unit VARCHAR(30),
  ADD COLUMN IF NOT EXISTS quantity NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
UPDATE team_settlement_items
SET content = COALESCE(NULLIF(content, ''), 'settlement-item-' || id::TEXT)
WHERE content IS NULL OR content = '';
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
ALTER TABLE IF EXISTS team_settlement_splits
  ADD COLUMN IF NOT EXISTS settlement_id INTEGER,
  ADD COLUMN IF NOT EXISTS project_id INTEGER,
  ADD COLUMN IF NOT EXISTS team_id INTEGER,
  ADD COLUMN IF NOT EXISTS worker_id INTEGER,
  ADD COLUMN IF NOT EXISTS worker_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS work_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS team_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS work_hours NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS team_settlement_splits_settlement_id_idx ON team_settlement_splits(settlement_id);
CREATE INDEX IF NOT EXISTS team_settlement_splits_project_worker_idx ON team_settlement_splits(project_id, worker_id);

CREATE TABLE IF NOT EXISTS bid_estimations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  project_type VARCHAR(100),
  region VARCHAR(100),
  duration_months INTEGER,
  profit_rate NUMERIC(8,4) DEFAULT 5.0,
  management_fee NUMERIC(12,2) DEFAULT 0,
  management_fee_rate NUMERIC(8,4) DEFAULT 0,
  material_included BOOLEAN DEFAULT FALSE,
  material_scope_note TEXT,
  total_labor_cost NUMERIC(14,2) DEFAULT 0,
  total_amount NUMERIC(14,2) DEFAULT 0,
  version_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT '测算中',
  remark TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE IF EXISTS bid_estimations
  ADD COLUMN IF NOT EXISTS name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS project_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS region VARCHAR(100),
  ADD COLUMN IF NOT EXISTS duration_months INTEGER,
  ADD COLUMN IF NOT EXISTS profit_rate NUMERIC(8,4) DEFAULT 5.0,
  ADD COLUMN IF NOT EXISTS management_fee NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS management_fee_rate NUMERIC(8,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS material_included BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS material_scope_note TEXT,
  ADD COLUMN IF NOT EXISTS total_labor_cost NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS version_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS remark TEXT,
  ADD COLUMN IF NOT EXISTS created_by INTEGER,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS bid_standard_items (
  id SERIAL PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  unit VARCHAR(30),
  category VARCHAR(100),
  material_included BOOLEAN DEFAULT FALSE,
  material_scope_note TEXT,
  status VARCHAR(20) DEFAULT 'active',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE IF EXISTS bid_standard_items
  ADD COLUMN IF NOT EXISTS code VARCHAR(80),
  ADD COLUMN IF NOT EXISTS name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS unit VARCHAR(30),
  ADD COLUMN IF NOT EXISTS category VARCHAR(100),
  ADD COLUMN IF NOT EXISTS material_included BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS material_scope_note TEXT,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
WITH ranked_bid_standard_items AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY lower(code)
      ORDER BY COALESCE(updated_at, created_at) DESC NULLS LAST, id DESC
    ) AS rn
  FROM bid_standard_items
  WHERE code IS NOT NULL AND code <> ''
)
DELETE FROM bid_standard_items
WHERE id IN (SELECT id FROM ranked_bid_standard_items WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS bid_standard_items_code_key
  ON bid_standard_items(code);

CREATE TABLE IF NOT EXISTS bid_items (
  id SERIAL PRIMARY KEY,
  bid_id INTEGER NOT NULL REFERENCES bid_estimations(id) ON DELETE CASCADE,
  boq_item_name VARCHAR(200),
  boq_content TEXT,
  work_type VARCHAR(200),
  unit VARCHAR(20),
  quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
  standard_price NUMERIC(10,2) DEFAULT 0,
  bid_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  standard_amount NUMERIC(14,2) DEFAULT 0,
  bid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  price_source VARCHAR(50),
  sort_order INTEGER DEFAULT 0,
  standard_item_id INTEGER REFERENCES bid_standard_items(id),
  standard_code VARCHAR(80),
  original_item_name VARCHAR(200),
  match_score NUMERIC(6,2) DEFAULT 0,
  match_status VARCHAR(30) DEFAULT 'unmatched',
  historical_bid_price NUMERIC(12,2) DEFAULT 0,
  historical_bid_amount NUMERIC(14,2) DEFAULT 0,
  cost_price NUMERIC(12,2) DEFAULT 0,
  cost_amount NUMERIC(14,2) DEFAULT 0,
  management_fee_rate NUMERIC(8,4) DEFAULT 0,
  profit_rate NUMERIC(8,4) DEFAULT 0,
  suggested_price NUMERIC(12,2) DEFAULT 0,
  suggested_amount NUMERIC(14,2) DEFAULT 0,
  final_price NUMERIC(12,2) DEFAULT 0,
  final_amount NUMERIC(14,2) DEFAULT 0,
  pricing_warning TEXT,
  is_manual_price BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE IF EXISTS bid_items
  ADD COLUMN IF NOT EXISTS bid_id INTEGER,
  ADD COLUMN IF NOT EXISTS boq_item_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS boq_content TEXT,
  ADD COLUMN IF NOT EXISTS work_type VARCHAR(200),
  ADD COLUMN IF NOT EXISTS unit VARCHAR(20),
  ADD COLUMN IF NOT EXISTS quantity NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS standard_price NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bid_price NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS standard_amount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bid_amount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_source VARCHAR(50),
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS standard_item_id INTEGER,
  ADD COLUMN IF NOT EXISTS standard_code VARCHAR(80),
  ADD COLUMN IF NOT EXISTS original_item_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS match_score NUMERIC(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS match_status VARCHAR(30) DEFAULT 'unmatched',
  ADD COLUMN IF NOT EXISTS historical_bid_price NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS historical_bid_amount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_amount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS management_fee_rate NUMERIC(8,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit_rate NUMERIC(8,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suggested_price NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suggested_amount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_price NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_amount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pricing_warning TEXT,
  ADD COLUMN IF NOT EXISTS is_manual_price BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS bid_management_fees (
  id SERIAL PRIMARY KEY,
  bid_id INTEGER NOT NULL REFERENCES bid_estimations(id) ON DELETE CASCADE,
  position VARCHAR(100) NOT NULL,
  monthly_salary NUMERIC(10,2) NOT NULL,
  headcount INTEGER NOT NULL DEFAULT 1,
  months INTEGER NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE IF EXISTS bid_management_fees
  ADD COLUMN IF NOT EXISTS bid_id INTEGER,
  ADD COLUMN IF NOT EXISTS position VARCHAR(100),
  ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS headcount INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS months INTEGER,
  ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS bid_item_aliases (
  id SERIAL PRIMARY KEY,
  standard_item_id INTEGER NOT NULL REFERENCES bid_standard_items(id) ON DELETE CASCADE,
  alias_name VARCHAR(200) NOT NULL,
  source_type VARCHAR(40) DEFAULT 'manual',
  confirmed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (standard_item_id, alias_name)
);
ALTER TABLE IF EXISTS bid_item_aliases
  ADD COLUMN IF NOT EXISTS standard_item_id INTEGER,
  ADD COLUMN IF NOT EXISTS alias_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(40) DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS bid_price_history (
  id SERIAL PRIMARY KEY,
  standard_item_id INTEGER NOT NULL REFERENCES bid_standard_items(id) ON DELETE CASCADE,
  project_name VARCHAR(200),
  region VARCHAR(100),
  project_type VARCHAR(100),
  item_original_name VARCHAR(200),
  unit VARCHAR(30),
  price NUMERIC(12,2) NOT NULL,
  bid_year INTEGER,
  material_included BOOLEAN DEFAULT FALSE,
  material_scope_note TEXT,
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE IF EXISTS bid_price_history
  ADD COLUMN IF NOT EXISTS standard_item_id INTEGER,
  ADD COLUMN IF NOT EXISTS project_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS region VARCHAR(100),
  ADD COLUMN IF NOT EXISTS project_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS item_original_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS unit VARCHAR(30),
  ADD COLUMN IF NOT EXISTS price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS bid_year INTEGER,
  ADD COLUMN IF NOT EXISTS material_included BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS material_scope_note TEXT,
  ADD COLUMN IF NOT EXISTS remark TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS bid_cost_history (
  id SERIAL PRIMARY KEY,
  standard_item_id INTEGER NOT NULL REFERENCES bid_standard_items(id) ON DELETE CASCADE,
  project_name VARCHAR(200),
  region VARCHAR(100),
  project_type VARCHAR(100),
  item_original_name VARCHAR(200),
  unit VARCHAR(30),
  price NUMERIC(12,2) NOT NULL,
  cost_year INTEGER,
  material_included BOOLEAN DEFAULT FALSE,
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE IF EXISTS bid_cost_history
  ADD COLUMN IF NOT EXISTS standard_item_id INTEGER,
  ADD COLUMN IF NOT EXISTS project_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS region VARCHAR(100),
  ADD COLUMN IF NOT EXISTS project_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS item_original_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS unit VARCHAR(30),
  ADD COLUMN IF NOT EXISTS price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS cost_year INTEGER,
  ADD COLUMN IF NOT EXISTS material_included BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS remark TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS bid_versions (
  id SERIAL PRIMARY KEY,
  bid_id INTEGER NOT NULL REFERENCES bid_estimations(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  summary TEXT,
  total_amount NUMERIC(14,2) DEFAULT 0,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE IF EXISTS bid_versions
  ADD COLUMN IF NOT EXISTS bid_id INTEGER,
  ADD COLUMN IF NOT EXISTS name VARCHAR(120),
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS snapshot JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE IF EXISTS bid_estimations
  ADD COLUMN IF NOT EXISTS region VARCHAR(100),
  ADD COLUMN IF NOT EXISTS material_included BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS material_scope_note TEXT,
  ADD COLUMN IF NOT EXISTS management_fee_rate NUMERIC(8,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS version_count INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS bid_items
  ADD COLUMN IF NOT EXISTS standard_item_id INTEGER REFERENCES bid_standard_items(id),
  ADD COLUMN IF NOT EXISTS standard_code VARCHAR(80),
  ADD COLUMN IF NOT EXISTS original_item_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS match_score NUMERIC(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS match_status VARCHAR(30) DEFAULT 'unmatched',
  ADD COLUMN IF NOT EXISTS historical_bid_price NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS historical_bid_amount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_amount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS management_fee_rate NUMERIC(8,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit_rate NUMERIC(8,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suggested_price NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suggested_amount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_price NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_amount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pricing_warning TEXT,
  ADD COLUMN IF NOT EXISTS is_manual_price BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS bid_items_bid_id_idx ON bid_items(bid_id);
CREATE INDEX IF NOT EXISTS bid_management_fees_bid_id_idx ON bid_management_fees(bid_id);
CREATE INDEX IF NOT EXISTS bid_standard_items_name_idx ON bid_standard_items(name);
CREATE INDEX IF NOT EXISTS bid_item_aliases_alias_idx ON bid_item_aliases(alias_name);
CREATE INDEX IF NOT EXISTS bid_price_history_standard_idx ON bid_price_history(standard_item_id);
CREATE INDEX IF NOT EXISTS bid_cost_history_standard_idx ON bid_cost_history(standard_item_id);
CREATE INDEX IF NOT EXISTS bid_versions_bid_idx ON bid_versions(bid_id);

INSERT INTO bid_standard_items (code, name, unit, category, sort_order)
VALUES
  ('MB-001', '模板安装拆除', 'm2', '模板工程', 1),
  ('GJ-001', '钢筋制作安装', 't', '钢筋工程', 2),
  ('HNT-001', '混凝土浇筑', 'm3', '混凝土工程', 3),
  ('QT-001', '砌体砌筑', 'm3', '砌体工程', 4),
  ('JZ-001', '抹灰施工', 'm2', '装饰工程', 5),
  ('FS-001', '防水施工', 'm2', '防水工程', 6),
  ('JSJ-001', '脚手架搭拆', 'm2', '脚手架工程', 7)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS user_project_roles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role_code VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, project_id, role_code)
);
ALTER TABLE IF EXISTS user_project_roles
  ADD COLUMN IF NOT EXISTS user_id INTEGER,
  ADD COLUMN IF NOT EXISTS project_id INTEGER,
  ADD COLUMN IF NOT EXISTS role_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS user_project_roles_user_id_idx ON user_project_roles(user_id);
CREATE INDEX IF NOT EXISTS user_project_roles_project_id_idx ON user_project_roles(project_id);
CREATE INDEX IF NOT EXISTS user_project_roles_role_code_idx ON user_project_roles(role_code);
CREATE INDEX IF NOT EXISTS user_project_roles_project_role_idx ON user_project_roles(project_id, role_code);

CREATE TABLE IF NOT EXISTS project_contracts (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT,
  file_type VARCHAR(100),
  storage_path TEXT NOT NULL,
  uploaded_by INTEGER,
  remark VARCHAR(500),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE IF EXISTS project_contracts
  ADD COLUMN IF NOT EXISTS project_id INTEGER,
  ADD COLUMN IF NOT EXISTS file_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS file_size BIGINT,
  ADD COLUMN IF NOT EXISTS file_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS uploaded_by INTEGER,
  ADD COLUMN IF NOT EXISTS remark VARCHAR(500),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS project_contracts_project_id_idx ON project_contracts(project_id);

CREATE TABLE IF NOT EXISTS unit_prices (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  work_type VARCHAR(200) NOT NULL,
  unit VARCHAR(20),
  price NUMERIC(10,2) NOT NULL,
  contract_type VARCHAR(20) DEFAULT '包活',
  quantity NUMERIC(12,2),
  amount NUMERIC(14,2),
  year INTEGER,
  notes TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE IF EXISTS unit_prices
  ADD COLUMN IF NOT EXISTS project_id INTEGER,
  ADD COLUMN IF NOT EXISTS work_type VARCHAR(200),
  ADD COLUMN IF NOT EXISTS unit VARCHAR(20),
  ADD COLUMN IF NOT EXISTS price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS contract_type VARCHAR(20) DEFAULT '包活',
  ADD COLUMN IF NOT EXISTS quantity NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS year INTEGER,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS created_by INTEGER,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS unit_prices_work_type_idx ON unit_prices(work_type);
CREATE INDEX IF NOT EXISTS unit_prices_project_id_idx ON unit_prices(project_id);

CREATE TABLE IF NOT EXISTS work_type_standards (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL UNIQUE,
  unit VARCHAR(20),
  category VARCHAR(100),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE IF EXISTS work_type_standards
  ADD COLUMN IF NOT EXISTS name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS unit VARCHAR(20),
  ADD COLUMN IF NOT EXISTS category VARCHAR(100),
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
WITH ranked_work_type_standards AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY lower(name)
      ORDER BY sort_order NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM work_type_standards
  WHERE name IS NOT NULL AND name <> ''
)
DELETE FROM work_type_standards
WHERE id IN (SELECT id FROM ranked_work_type_standards WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS work_type_standards_name_key ON work_type_standards(name);

INSERT INTO work_type_standards (name, unit, category, sort_order) VALUES
  ('模板安装', 'm2', '模板工程', 1),
  ('模板拆除', 'm2', '模板工程', 2),
  ('钢筋制安', 't', '钢筋工程', 3),
  ('钢筋加工', 't', '钢筋工程', 4),
  ('混凝土浇筑', 'm3', '混凝土工程', 5),
  ('混凝土养护', 'm3', '混凝土工程', 6),
  ('砌体砌筑', 'm3', '砌体工程', 7),
  ('抹灰（一般）', 'm2', '装饰工程', 8),
  ('抹灰（外墙）', 'm2', '装饰工程', 9),
  ('地面找平', 'm2', '装饰工程', 10),
  ('墙面贴砖', 'm2', '装饰工程', 11),
  ('地面贴砖', 'm2', '装饰工程', 12),
  ('脚手架搭设', 'm2', '脚手架工程', 13),
  ('脚手架拆除', 'm2', '脚手架工程', 14),
  ('防水施工', 'm2', '防水工程', 15),
  ('保温施工', 'm2', '保温工程', 16),
  ('水电预埋', 'm2', '安装工程', 17),
  ('水电安装', 'm2', '安装工程', 18),
  ('消防管道安装', 'm', '安装工程', 19),
  ('通风管道安装', 'm2', '安装工程', 20)
ON CONFLICT (name) DO NOTHING;

DO $$
BEGIN
  IF to_regclass('public.salary_payments') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'salary_payments' AND column_name = 'salary_id'
    ) THEN
      ALTER TABLE salary_payments ALTER COLUMN salary_id DROP NOT NULL;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'salary_payments' AND column_name = 'year_month'
    ) THEN
      ALTER TABLE salary_payments ALTER COLUMN year_month DROP NOT NULL;
    END IF;
  END IF;
END $$;

ALTER TABLE IF EXISTS notifications
  ADD COLUMN IF NOT EXISTS recipient_user_id INTEGER,
  ADD COLUMN IF NOT EXISTS recipient_role VARCHAR(50),
  ADD COLUMN IF NOT EXISTS is_sent VARCHAR(5) DEFAULT 'false',
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS notifications_recipient_user_id_idx ON notifications(recipient_user_id);
CREATE INDEX IF NOT EXISTS notifications_recipient_role_idx ON notifications(recipient_role);

CREATE TABLE IF NOT EXISTS notification_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(100) NOT NULL,
  setting_value TEXT,
  description TEXT,
  enabled VARCHAR(5) DEFAULT 'true',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

WITH ranked AS (
  SELECT id, setting_key,
    ROW_NUMBER() OVER (
      PARTITION BY setting_key
      ORDER BY CASE WHEN COALESCE(setting_value, '') <> '' THEN 0 ELSE 1 END, id
    ) AS rn
  FROM notification_settings
)
DELETE FROM notification_settings
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS notification_settings_setting_key_key ON notification_settings(setting_key);

INSERT INTO notification_settings (setting_key, setting_value, enabled, description)
VALUES
  ('dingtalk_enabled', '', 'true', '允许系统向钉钉推送消息'),
  ('dingtalk_robot_broadcast_enabled', '', 'true', '允许公司级广播消息发送到钉钉群机器人'),
  ('dingtalk_webhook', '', 'true', '钉钉群机器人 Webhook'),
  ('dingtalk_secret', '', 'true', '钉钉群机器人加签 Secret'),
  ('dingtalk_recipient_bindings', '{}', 'true', '按消息类型绑定钉钉个人通知接收人'),
  ('todo_digest_enabled', '', 'true', '允许定时向个人推送待办汇总'),
  ('new_record_reminder_enabled', '', 'true', '新增记录、流程节点和日报汇总提醒'),
  ('visa_reminder_enabled', '', 'true', '签证流程和签证超期提醒'),
  ('cost_warning_enabled', '', 'true', '成本、施工日志风险提醒'),
  ('salary_reminder_enabled', '', 'true', '工资核算和工资发放提醒'),
  ('payment_warning_enabled', '', 'true', '付款预警提醒'),
  ('client_payment_reminder_enabled', '', 'true', '甲方回款提醒'),
  ('supplier_payment_reminder_enabled', '', 'true', '供应商付款提醒'),
  ('settlement_reminder_enabled', '', 'true', '结算单提醒'),
  ('certificate_reminder_enabled', '', 'true', '证件到期提醒')
ON CONFLICT (setting_key) DO NOTHING;

ALTER TABLE IF EXISTS roles ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE;

NOTIFY pgrst, 'reload schema';
`;

function getSupabaseProjectRef() {
  const supabaseUrl = process.env.COZE_SUPABASE_URL || '';
  return supabaseUrl ? supabaseUrl.replace('https://', '').split('.')[0] : '';
}

export function getMigrationManualUrl() {
  const projectRef = getSupabaseProjectRef();
  return projectRef ? `https://supabase.com/dashboard/project/${projectRef}/sql/new` : undefined;
}

function getPostgresConnectionString() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    ''
  );
}

async function runWithPostgresClient(connectionString: string) {
  const { Client } = await import('pg');
  const client = new Client({
    connectionString,
    ssl: connectionString.includes('supabase.co') ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await client.connect();
    await client.query(MIGRATION_SQL);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function runWithSupabaseRpc() {
  const supabaseUrl = process.env.COZE_SUPABASE_URL || '';
  const serviceKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceKey) {
    throw new Error('缺少 COZE_SUPABASE_URL 或 COZE_SUPABASE_SERVICE_ROLE_KEY');
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const attempts = [{ query: MIGRATION_SQL }, { sql: MIGRATION_SQL }];
  let lastError = '';

  for (const args of attempts) {
    const { error } = await admin.rpc('exec_sql', args);
    if (!error) return;
    lastError = error.message || JSON.stringify(error);
  }

  throw new Error(lastError || 'exec_sql RPC 执行失败');
}

export async function runMigrations(): Promise<MigrationResult> {
  const manualUrl = getMigrationManualUrl();
  const connectionString = getPostgresConnectionString();

  try {
    if (connectionString) {
      await runWithPostgresClient(connectionString);
      return {
        ok: true,
        mode: 'postgres',
        message: '数据库迁移已通过 PostgreSQL 连接自动执行。',
        sql: MIGRATION_SQL,
        manualUrl,
      };
    }

    await runWithSupabaseRpc();
    return {
      ok: true,
      mode: 'supabase-rpc',
      message: '数据库迁移已通过 Supabase exec_sql 自动执行。',
      sql: MIGRATION_SQL,
      manualUrl,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      mode: 'manual',
      message: '自动迁移未执行成功，请在 Supabase SQL 编辑器手动执行返回的 SQL。',
      error: message,
      sql: MIGRATION_SQL,
      manualUrl,
    };
  }
}
