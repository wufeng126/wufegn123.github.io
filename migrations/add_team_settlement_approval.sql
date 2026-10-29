-- ============================================================
-- 班组结算审批流程（2026-10）
-- 状态机：draft 草稿（预算员填写）→ pending 待审批（提交老板）
--        → reviewed 已审批（老板通过，计入成本） / rejected 已驳回（退回修改）
-- 权限：提交需 team_settlements:submit；通过/驳回需 team_settlements:approve（仅老板/超管）
-- ============================================================

-- 1. 审批流转字段
ALTER TABLE IF EXISTS team_settlements
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_by VARCHAR(100),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(100),
  ADD COLUMN IF NOT EXISTS reject_reason TEXT;

-- 2. 存量数据：历史 'confirmed' 视为已审批通过，统一为 'reviewed'（避免审批后不计成本）
UPDATE team_settlements SET status = 'reviewed' WHERE status = 'confirmed';

-- 3. 草稿（draft）/待审批（pending）/驳回（rejected）默认不计成本，无需回填
NOTIFY pgrst, 'reload schema';
