-- 结算证据链：后续跟进记录
-- 每条证据可多次追加跟进，每次跟进独立记录确认的工程量/金额/结算方式，完整保留变化历史
CREATE TABLE IF NOT EXISTS settlement_evidence_follow_ups (
  id BIGSERIAL PRIMARY KEY,
  evidence_id INTEGER NOT NULL REFERENCES settlement_evidence_records(id) ON DELETE CASCADE,
  project_id INTEGER,
  follow_date DATE NOT NULL DEFAULT CURRENT_DATE,
  content TEXT,                                  -- 跟进情况说明（沟通进展、对方回复等）
  follow_status VARCHAR(50) NOT NULL DEFAULT '未处理',  -- 跟进后状态
  confirmed_quantity NUMERIC,                    -- 本次确认工程量
  quantity_unit VARCHAR(30),                     -- 工程量单位
  confirmed_amount NUMERIC,                      -- 本次确认金额
  settlement_method VARCHAR(50),                 -- 结算方式：按签证结算/计入下期进度结算/单独协议结算/现金支付/抵账扣款
  created_by INTEGER,
  created_by_name VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evidence_follow_ups_evidence_id
  ON settlement_evidence_follow_ups(evidence_id);
CREATE INDEX IF NOT EXISTS idx_evidence_follow_ups_project_id
  ON settlement_evidence_follow_ups(project_id);

NOTIFY pgrst, 'reload schema';
