-- ═══════════════════════════════════════════════════════════════════════════
-- P0-2 限价过程控制：subitem_monthly_progress 增加结算单价与超限留痕字段
-- 幂等：ALTER TABLE ... ADD COLUMN IF NOT EXISTS，可重复执行
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE subitem_monthly_progress
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS over_limit BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS over_limit_reason TEXT;

NOTIFY pgrst, 'reload schema';
