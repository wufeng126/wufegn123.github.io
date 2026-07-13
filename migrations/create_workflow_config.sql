-- 审批流程配置表
CREATE TABLE IF NOT EXISTS workflow_configs (
  id SERIAL PRIMARY KEY,
  workflow_type VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  steps JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 默认审批流程：当前仅启用月度分析、施工日志确认、签证办理
INSERT INTO workflow_configs (workflow_type, name, steps) VALUES (
  'monthly_analysis',
  '月度分析审批流程',
  '[{"state":"draft","label":"草稿","role":"admin,super_admin","actor":"预算员"},
    {"state":"manager_review","label":"项目经理补充","role":"project_manager","actor":"项目经理"},
    {"state":"budget_confirm","label":"预算确认","role":"admin,super_admin","actor":"预算员"},
    {"state":"boss_review","label":"老板批复","role":"boss","actor":"老板"},
    {"state":"completed","label":"完成","role":"","actor":""}]'
) ON CONFLICT (workflow_type) DO NOTHING;

INSERT INTO workflow_configs (workflow_type, name, steps) VALUES (
  'construction_log_confirm',
  '施工日志确认流程',
  '[{"state":"pending","label":"风险待确认","role":"project_manager","actor":"项目经理"},
    {"state":"budget_notice","label":"预算员提醒","role":"admin,super_admin","actor":"预算员"},
    {"state":"completed","label":"完成","role":"","actor":""}]'
) ON CONFLICT (workflow_type) DO NOTHING;

INSERT INTO workflow_configs (workflow_type, name, steps) VALUES (
  'visa',
  '签证办理审批流程',
  '[{"state":"draft","label":"现场发起","role":"project_manager,team_leader","actor":"现场人员"},
    {"state":"budget_review","label":"预算审核","role":"admin,super_admin","actor":"预算员"},
    {"state":"boss_review","label":"老板审批","role":"boss","actor":"老板"},
    {"state":"completed","label":"完成","role":"","actor":""}]'
) ON CONFLICT (workflow_type) DO NOTHING;
