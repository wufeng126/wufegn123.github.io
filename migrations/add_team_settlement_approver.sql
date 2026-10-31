-- 班组结算：提交时指定下一级审批人（不再依赖审批流程配置）
ALTER TABLE team_settlements ADD COLUMN IF NOT EXISTS approver_user_id INTEGER;
ALTER TABLE team_settlements ADD COLUMN IF NOT EXISTS approver_name VARCHAR(100);

COMMENT ON COLUMN team_settlements.approver_user_id IS '提交时选择的下一级审批人用户ID';
COMMENT ON COLUMN team_settlements.approver_name IS '提交时选择的下一级审批人姓名（展示用）';

CREATE INDEX IF NOT EXISTS team_settlements_approver_user_id_idx ON team_settlements(approver_user_id);
