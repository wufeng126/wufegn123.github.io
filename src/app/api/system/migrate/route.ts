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
) ON CONFLICT (workflow_type) DO NOTHING;`;

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
        await admin.rpc('exec_sql' as any, { query: SQL });
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
