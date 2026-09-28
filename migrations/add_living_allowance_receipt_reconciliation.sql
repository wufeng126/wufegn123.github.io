-- 回单只做凭证核对，不再通过回单匹配新增生活费扣款。
-- matched_salary_id 仅保存核对对象，不会触发工资金额或 advance_pay 变更。

ALTER TABLE IF EXISTS living_allowance_receipt_items
  ADD COLUMN IF NOT EXISTS matched_salary_id INTEGER;

DO $$
BEGIN
  IF to_regclass('public.living_allowance_receipt_items') IS NOT NULL
    AND to_regclass('public.worker_salaries') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'living_allowance_receipt_items_matched_salary_id_fkey'
    )
  THEN
    ALTER TABLE living_allowance_receipt_items
      ADD CONSTRAINT living_allowance_receipt_items_matched_salary_id_fkey
      FOREIGN KEY (matched_salary_id)
      REFERENCES worker_salaries(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS living_allowance_receipt_items_matched_salary_id_idx
  ON living_allowance_receipt_items(matched_salary_id);
