-- 生活费发放台账 + 回单原图拆分匹配
-- 说明：
-- 1. 回单原图保存在对象存储，只在数据库记录 file_key。
-- 2. 一张回单可拆分为多条明细，每条明细可匹配一条生活费记录。
-- 3. 生活费记录最终同步到 worker_salaries.advance_pay，保留 deducted_salary_id 形成追溯链。

CREATE TABLE IF NOT EXISTS living_allowance_receipts (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  receipt_date VARCHAR(20) NOT NULL,
  file_key TEXT NOT NULL,
  file_name VARCHAR(255),
  file_size INTEGER,
  file_type VARCHAR(100),
  file_hash VARCHAR(128),
  payer_account VARCHAR(100),
  split_status VARCHAR(20) DEFAULT 'pending' NOT NULL,
  remark TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS living_allowance_receipts_project_id_idx
  ON living_allowance_receipts(project_id);
CREATE INDEX IF NOT EXISTS living_allowance_receipts_receipt_date_idx
  ON living_allowance_receipts(receipt_date);
CREATE INDEX IF NOT EXISTS living_allowance_receipts_split_status_idx
  ON living_allowance_receipts(split_status);
CREATE INDEX IF NOT EXISTS living_allowance_receipts_file_hash_idx
  ON living_allowance_receipts(file_hash);

CREATE TABLE IF NOT EXISTS living_allowance_receipt_items (
  id SERIAL PRIMARY KEY,
  receipt_id INTEGER NOT NULL REFERENCES living_allowance_receipts(id) ON DELETE CASCADE,
  worker_id INTEGER REFERENCES workers(id) ON DELETE SET NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  recipient_name VARCHAR(100) NOT NULL,
  bank_card_tail VARCHAR(12),
  amount NUMERIC(12, 2) NOT NULL,
  payment_date VARCHAR(20),
  transaction_no VARCHAR(100),
  crop_box JSONB,
  match_status VARCHAR(20) DEFAULT 'unmatched' NOT NULL,
  matched_record_id INTEGER,
  match_score INTEGER DEFAULT 0,
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS living_allowance_receipt_items_receipt_id_idx
  ON living_allowance_receipt_items(receipt_id);
CREATE INDEX IF NOT EXISTS living_allowance_receipt_items_worker_id_idx
  ON living_allowance_receipt_items(worker_id);
CREATE INDEX IF NOT EXISTS living_allowance_receipt_items_project_id_idx
  ON living_allowance_receipt_items(project_id);
CREATE INDEX IF NOT EXISTS living_allowance_receipt_items_match_status_idx
  ON living_allowance_receipt_items(match_status);

CREATE TABLE IF NOT EXISTS living_allowance_records (
  id SERIAL PRIMARY KEY,
  worker_id INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  year_month VARCHAR(7) NOT NULL,
  allowance_date VARCHAR(20) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  payment_method VARCHAR(50) DEFAULT '银行转账',
  status VARCHAR(20) DEFAULT 'pending_deduction' NOT NULL,
  receipt_item_id INTEGER REFERENCES living_allowance_receipt_items(id) ON DELETE SET NULL,
  deducted_salary_id INTEGER REFERENCES worker_salaries(id) ON DELETE SET NULL,
  deducted_amount NUMERIC(12, 2) DEFAULT 0,
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS living_allowance_records_worker_id_idx
  ON living_allowance_records(worker_id);
CREATE INDEX IF NOT EXISTS living_allowance_records_project_id_idx
  ON living_allowance_records(project_id);
CREATE INDEX IF NOT EXISTS living_allowance_records_year_month_idx
  ON living_allowance_records(year_month);
CREATE INDEX IF NOT EXISTS living_allowance_records_status_idx
  ON living_allowance_records(status);
CREATE INDEX IF NOT EXISTS living_allowance_records_receipt_item_id_idx
  ON living_allowance_records(receipt_item_id);
CREATE INDEX IF NOT EXISTS living_allowance_records_deducted_salary_id_idx
  ON living_allowance_records(deducted_salary_id);
