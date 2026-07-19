// 部署后迁移接口
// 部署完成后访问一次: GET /api/system/migrate
// 返回需要在 Supabase 中执行的 SQL

import { NextResponse } from 'next/server';

const SQL = `-- 施工日志表
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
CREATE INDEX IF NOT EXISTS construction_logs_project_id_idx ON construction_logs(project_id);
CREATE INDEX IF NOT EXISTS construction_logs_user_id_idx ON construction_logs(user_id);
CREATE INDEX IF NOT EXISTS construction_logs_log_date_idx ON construction_logs(log_date);

-- 施工日志出勤人员明细
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
CREATE INDEX IF NOT EXISTS construction_log_attendance_log_id_idx ON construction_log_attendance(log_id);
CREATE INDEX IF NOT EXISTS construction_log_attendance_project_id_idx ON construction_log_attendance(project_id);
CREATE INDEX IF NOT EXISTS construction_log_attendance_worker_id_idx ON construction_log_attendance(worker_id);
CREATE INDEX IF NOT EXISTS construction_log_attendance_project_worker_idx ON construction_log_attendance(project_id, worker_id);
ALTER TABLE construction_log_attendance ADD COLUMN IF NOT EXISTS work_hours NUMERIC(8,2) DEFAULT 0;

-- 现场人员在单个项目内负责的工人范围
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

-- 审批流程配置表
CREATE TABLE IF NOT EXISTS workflow_configs (
  id SERIAL PRIMARY KEY,
  workflow_type VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  steps JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO workflow_configs (workflow_type, name, steps) VALUES (
  'monthly_analysis', '月度分析审批流程',
  '[{"state":"draft","label":"草稿","role":"admin,super_admin","actor":"预算员"},{"state":"manager_review","label":"项目经理补充","role":"project_manager","actor":"项目经理"},{"state":"budget_confirm","label":"预算确认","role":"admin,super_admin","actor":"预算员"},{"state":"boss_review","label":"老板批复","role":"boss","actor":"老板"},{"state":"completed","label":"完成","role":"","actor":""}]'
) ON CONFLICT (workflow_type) DO NOTHING;
INSERT INTO workflow_configs (workflow_type, name, steps) VALUES (
  'construction_log_confirm', '施工日志确认流程',
  '[{"state":"pending","label":"风险待确认","role":"project_manager","actor":"项目经理"},{"state":"budget_notice","label":"预算员提醒","role":"admin,super_admin","actor":"预算员"},{"state":"completed","label":"完成","role":"","actor":""}]'
) ON CONFLICT (workflow_type) DO NOTHING;
INSERT INTO workflow_configs (workflow_type, name, steps) VALUES (
  'visa', '签证办理审批流程',
  '[{"state":"draft","label":"现场发起","role":"project_manager,team_leader","actor":"现场人员"},{"state":"budget_review","label":"预算审核","role":"admin,super_admin","actor":"预算员"},{"state":"boss_review","label":"老板审批","role":"boss","actor":"老板"},{"state":"completed","label":"完成","role":"","actor":""}]'
) ON CONFLICT (workflow_type) DO NOTHING;

-- 内部附加清单模板
-- Visa offline workflow fields
ALTER TABLE visas ADD COLUMN IF NOT EXISTS current_responsible_user_id INTEGER;
ALTER TABLE visas ADD COLUMN IF NOT EXISTS current_responsible_name VARCHAR(100);
ALTER TABLE visas ADD COLUMN IF NOT EXISTS budget_user_id INTEGER;
ALTER TABLE visas ADD COLUMN IF NOT EXISTS budget_user_name VARCHAR(100);
ALTER TABLE visas ADD COLUMN IF NOT EXISTS project_manager_user_id INTEGER;
ALTER TABLE visas ADD COLUMN IF NOT EXISTS project_manager_name VARCHAR(100);
ALTER TABLE visas ADD COLUMN IF NOT EXISTS workflow_step_updated_at TIMESTAMPTZ;
ALTER TABLE visas ADD COLUMN IF NOT EXISTS workflow_last_reminded_at TIMESTAMPTZ;
ALTER TABLE visas ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;
ALTER TABLE visas ADD COLUMN IF NOT EXISTS business_confirmed_at TIMESTAMPTZ;
ALTER TABLE visas ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE visas ADD COLUMN IF NOT EXISTS workflow_comment TEXT;
CREATE INDEX IF NOT EXISTS visas_current_responsible_user_id_idx ON visas(current_responsible_user_id);
CREATE INDEX IF NOT EXISTS visas_workflow_step_updated_at_idx ON visas(workflow_step_updated_at);
CREATE INDEX IF NOT EXISTS visas_status_workflow_step_idx ON visas(status, workflow_step_updated_at);
NOTIFY pgrst, 'reload schema';

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

-- 项目内部附加清单
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

-- 内部附加清单月度对下结算
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
ALTER TABLE project_internal_addons DROP CONSTRAINT IF EXISTS project_internal_addons_project_id_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS project_internal_addons_active_name_idx ON project_internal_addons(project_id, name) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS internal_addon_settlements_project_month_idx ON internal_addon_monthly_settlements(project_id, year_month);
CREATE INDEX IF NOT EXISTS internal_addon_settlements_addon_id_idx ON internal_addon_monthly_settlements(addon_id);

-- 閫氱煡鎺ユ敹浜?
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient_user_id INTEGER;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient_role VARCHAR(50);
CREATE INDEX IF NOT EXISTS notifications_recipient_user_id_idx ON notifications(recipient_user_id);
CREATE INDEX IF NOT EXISTS notifications_recipient_role_idx ON notifications(recipient_role);

-- 钉钉群机器人广播开关：只控制公司级群广播，不影响个人工作通知
DO $$
BEGIN
  IF to_regclass('public.notification_settings') IS NOT NULL THEN
    INSERT INTO notification_settings (setting_key, setting_value, enabled, description)
    VALUES ('dingtalk_robot_broadcast_enabled', '', 'true', '开启后允许公司级广播消息发送到钉钉群机器人')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- WPS 花名册同步所需字段
-- Fix notification settings duplicates and defaults
DO $$
BEGIN
  IF to_regclass('public.notification_settings') IS NOT NULL THEN
    WITH ranked AS (
      SELECT
        id,
        setting_key,
        ROW_NUMBER() OVER (
          PARTITION BY setting_key
          ORDER BY
            CASE WHEN COALESCE(setting_value, '') <> '' THEN 0 ELSE 1 END,
            id
        ) AS rn
      FROM notification_settings
    )
    DELETE FROM notification_settings
    WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

    INSERT INTO notification_settings (setting_key, setting_value, enabled, description)
    VALUES
      ('dingtalk_enabled', '', 'true', '允许系统向钉钉推送消息'),
      ('dingtalk_robot_broadcast_enabled', '', 'true', '允许公司级广播消息发送到钉钉群机器人'),
      ('dingtalk_webhook', '', 'true', '钉钉群机器人 Webhook，仅用于公司级广播'),
      ('dingtalk_secret', '', 'true', '钉钉群机器人加签 Secret'),
      ('todo_digest_enabled', '', 'true', '允许定时向个人推送待办汇总')
    ON CONFLICT DO NOTHING;

    CREATE UNIQUE INDEX IF NOT EXISTS notification_settings_setting_key_key
    ON notification_settings(setting_key);
  END IF;
END $$;

ALTER TABLE workers ADD COLUMN IF NOT EXISTS project_id INTEGER;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'in_service';
ALTER TABLE workers ADD COLUMN IF NOT EXISTS gender VARCHAR(10);
ALTER TABLE workers ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS entry_date VARCHAR(20);
ALTER TABLE workers ADD COLUMN IF NOT EXISTS team_name VARCHAR(100);
ALTER TABLE workers ADD COLUMN IF NOT EXISTS is_blacklist BOOLEAN DEFAULT FALSE;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS remark TEXT;
CREATE INDEX IF NOT EXISTS workers_id_card_idx ON workers(id_card);
CREATE INDEX IF NOT EXISTS workers_phone_idx ON workers(phone);

-- 工人项目调动记录
CREATE TABLE IF NOT EXISTS worker_assignments (
  id SERIAL PRIMARY KEY,
  worker_id INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  start_date VARCHAR(20),
  end_date VARCHAR(20),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS worker_assignments_worker_project_key ON worker_assignments(worker_id, project_id);
CREATE INDEX IF NOT EXISTS worker_assignments_worker_id_idx ON worker_assignments(worker_id);
CREATE INDEX IF NOT EXISTS worker_assignments_project_id_idx ON worker_assignments(project_id);
CREATE INDEX IF NOT EXISTS worker_assignments_status_idx ON worker_assignments(status);

INSERT INTO worker_assignments (worker_id, project_id, start_date, status)
SELECT id, project_id, entry_date, 'active'
FROM workers
WHERE project_id IS NOT NULL
  AND COALESCE(status, 'in_service') <> 'left'
ON CONFLICT (worker_id, project_id) DO UPDATE
SET status = 'active',
    start_date = COALESCE(worker_assignments.start_date, EXCLUDED.start_date),
    end_date = NULL;

-- WPS 花名册同步日志，只保存业务字段，不保存身份证/银行卡照片等附件内容
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
CREATE INDEX IF NOT EXISTS wps_worker_sync_logs_created_at_idx ON wps_worker_sync_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS wps_worker_sync_logs_project_id_idx ON wps_worker_sync_logs(project_id);
CREATE INDEX IF NOT EXISTS wps_worker_sync_logs_status_idx ON wps_worker_sync_logs(status);

-- WPS 项目/工作表与系统项目绑定
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
ALTER TABLE wps_project_bindings ADD COLUMN IF NOT EXISTS wps_document_url TEXT;
CREATE INDEX IF NOT EXISTS wps_project_bindings_project_id_idx ON wps_project_bindings(project_id);
CREATE INDEX IF NOT EXISTS wps_project_bindings_active_idx ON wps_project_bindings(is_active);
CREATE INDEX IF NOT EXISTS wps_project_bindings_form_id_idx ON wps_project_bindings(wps_form_id);
CREATE INDEX IF NOT EXISTS wps_project_bindings_sheet_id_idx ON wps_project_bindings(wps_sheet_id);
CREATE INDEX IF NOT EXISTS wps_project_bindings_table_id_idx ON wps_project_bindings(wps_table_id);

-- Project archiving fields and archive snapshots.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by INTEGER,
  ADD COLUMN IF NOT EXISTS archive_note TEXT;

ALTER TABLE construction_logs
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attachments_cleaned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attachments_original_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attachments_cleaned_by INTEGER;

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
CREATE INDEX IF NOT EXISTS projects_is_archived_idx ON projects(is_archived);
NOTIFY pgrst, 'reload schema';`;

export async function GET() {
  const supabaseUrl = process.env.COZE_SUPABASE_URL || '';
  const projectRef = supabaseUrl ? supabaseUrl.replace('https://', '').split('.')[0] : '';

  // 尝试自动执行
  const serviceKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
  let autoResult = '';
  if (supabaseUrl && serviceKey) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
      try {
        const runSql = admin.rpc.bind(admin) as unknown as (fn: string, args: { query: string }) => PromiseLike<unknown>;
        await runSql('exec_sql', { query: SQL });
        autoResult = '✅ 自动迁移成功！';
      } catch {
        autoResult = '⚠️ 自动迁移不可用（exec_sql RPC 未创建）';
      }
    } catch { autoResult = '⚠️ 自动迁移不可用'; }
  }

  return NextResponse.json({
    success: true,
    auto: autoResult || '未配置 SERVICE_ROLE_KEY，请手动执行',
    sql: SQL,
    manual: projectRef
      ? `请打开 Supabase 控制台 → SQL 编辑器 → 粘贴执行：\nhttps://supabase.com/dashboard/project/${projectRef}/sql/new`
      : '在 Supabase 控制台中执行 SQL',
    _提示: '部署后到 Supabase SQL 编辑器执行一次上面的 SQL 即可。如果已有该表，CREATE TABLE IF NOT EXISTS 不会影响原有数据。',
  });
}
