-- 项目负责人：预算员 / 项目经理（按项目指定，月报审批按项目自动匹配）
-- 2026-10-30
ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget_user_id INTEGER;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS manager_user_id INTEGER;

COMMENT ON COLUMN projects.budget_user_id IS '项目预算员用户ID（月报填写/提交审批）';
COMMENT ON COLUMN projects.manager_user_id IS '项目经理用户ID（月报补充/提交老板）';
