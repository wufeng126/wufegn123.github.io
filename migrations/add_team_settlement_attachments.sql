-- ============================================================
-- 班组结算单附件列（2026-10 安全/完整性修复）
-- 背景：团队结算接口（创建/附件上传/附件删除）读写 team_settlements.attachments，
--       但历史迁移里从未创建该列 → 全新环境执行迁移后创建结算单/上传附件会报
--       "Could not find the 'attachments' column of 'team_settlements'"。
-- 方案：幂等补列（JSONB 数组，默认空数组），供附件上传/删除链路使用。
-- ============================================================

ALTER TABLE IF EXISTS team_settlements
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
