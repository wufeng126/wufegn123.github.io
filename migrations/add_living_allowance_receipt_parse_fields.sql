-- 银行回单智能拆分：回单头增加回单总金额/笔数/用途/识别状态字段
-- 1. declared_total_amount：回单抬头的总金额（如招行代发回单"总金额:41,000.00"），用于拆分合计对账
-- 2. declared_item_count：回单抬头的笔数（如"笔数:39"），用于拆分行数对账
-- 3. payment_purpose：用途（如"扶风五小工人工资"），可辅助确定项目
-- 4. parse_status：智能解析状态 pending/parsed/failed
ALTER TABLE living_allowance_receipts
  ADD COLUMN IF NOT EXISTS declared_total_amount NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS declared_item_count INTEGER,
  ADD COLUMN IF NOT EXISTS payment_purpose VARCHAR(200),
  ADD COLUMN IF NOT EXISTS parse_status VARCHAR(20) DEFAULT 'pending' NOT NULL;

CREATE INDEX IF NOT EXISTS living_allowance_receipts_parse_status_idx
  ON living_allowance_receipts(parse_status);
