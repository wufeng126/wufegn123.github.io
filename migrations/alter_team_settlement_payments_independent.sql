-- 班组付款独立化：付款挂班组，结算单关联变为可选核销
-- 1) settlement_id 允许 NULL，删除结算单时付款记录保留（仅置空关联）
-- 2) team_id 设为必填
ALTER TABLE team_settlement_payments ALTER COLUMN settlement_id DROP NOT NULL;
ALTER TABLE team_settlement_payments DROP CONSTRAINT IF EXISTS team_settlement_payments_settlement_id_fkey;
ALTER TABLE team_settlement_payments ADD CONSTRAINT team_settlement_payments_settlement_id_fkey FOREIGN KEY (settlement_id) REFERENCES team_settlements(id) ON DELETE SET NULL;
ALTER TABLE team_settlement_payments ALTER COLUMN team_id SET NOT NULL;
NOTIFY pgrst, 'reload schema';
