-- 班组结算新增"付款比例"字段
-- 业务背景：建筑劳务班组结算通常按合同约定比例付款（如本期付 80%），
-- 尾款/质保金等完工或下期再付。
-- 派生口径（不入库，由 API/前端计算）：
--   计划付款 planned_payment = payable_amount * payment_ratio / 100
--   尾款（预留款）retained_amount = payable_amount - planned_payment
-- 旧数据默认 100（全额付款），保持历史口径不变。

ALTER TABLE team_settlements
  ADD COLUMN IF NOT EXISTS payment_ratio numeric(5,2) NOT NULL DEFAULT 100;

COMMENT ON COLUMN team_settlements.payment_ratio IS '本期付款比例(%)，计划付款=实付金额*比例/100，尾款=实付金额-计划付款';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'team_settlements_payment_ratio_check'
  ) THEN
    ALTER TABLE team_settlements
      ADD CONSTRAINT team_settlements_payment_ratio_check
      CHECK (payment_ratio >= 0 AND payment_ratio <= 100);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
