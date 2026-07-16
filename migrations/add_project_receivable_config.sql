-- Project receivable payment ratio and warranty aging configuration
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS construction_payment_ratio NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS completion_settlement_payment_ratio NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS warranty_payment_ratio NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS warranty_expired_payment_ratio NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS completion_date DATE,
  ADD COLUMN IF NOT EXISTS warranty_days INTEGER;

UPDATE projects
SET status = CASE
  WHEN status = '进行中' THEN '在建'
  WHEN status = '已完成' THEN '竣工结算'
  WHEN status = '暂停' THEN '在建'
  ELSE status
END
WHERE status IN ('进行中', '已完成', '暂停');
