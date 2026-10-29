-- ============================================================
-- 月度报表协作审批（2026-10）
-- 流程：draft（预算员填写）→ pending_manager（项目经理补充）
--      → pending_boss（老板完善+审批）→ approved（通过，锁定归档）
--      → rejected（驳回，退回预算员修改后重新提交）
-- 内容：系统自动汇总数据 + 人工文字补充（经营分析/风险说明/下月计划/备注）
-- 权限：monthly_report:fill（预算员）/ monthly_report:supplement（项目经理）/ monthly_report:approve（老板/超管）
-- ============================================================

CREATE TABLE IF NOT EXISTS monthly_report_workflows (
  id SERIAL PRIMARY KEY,
  year_month VARCHAR(7) NOT NULL,
  project_scope VARCHAR(20) NOT NULL DEFAULT 'all',
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  fill_user VARCHAR(100),
  manager_user VARCHAR(100),
  approved_by VARCHAR(100),
  submitted_manager_at TIMESTAMPTZ,
  submitted_boss_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  reject_reason TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (year_month, project_scope)
);

CREATE INDEX IF NOT EXISTS monthly_report_workflows_month_idx ON monthly_report_workflows(year_month);
CREATE INDEX IF NOT EXISTS monthly_report_workflows_status_idx ON monthly_report_workflows(status);

NOTIFY pgrst, 'reload schema';
