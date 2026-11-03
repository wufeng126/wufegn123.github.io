-- 月度凭证：结算单 / 考勤表（按项目 + 月份 + 类型，一份可多页）
CREATE TABLE IF NOT EXISTS monthly_vouchers (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  year_month VARCHAR(7) NOT NULL,              -- YYYY-MM
  doc_type VARCHAR(20) NOT NULL,               -- settlement | attendance
  page_count INTEGER DEFAULT 0,
  amount_total NUMERIC(14,2),                  -- 分账合计（选填，用于与工资应发对比）
  remark TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'uploaded', -- uploaded | confirmed | approved | voided
  uploaded_by INTEGER,
  uploaded_by_name VARCHAR(100),
  confirmed_by INTEGER,
  confirmed_by_name VARCHAR(100),
  confirmed_at TIMESTAMPTZ,
  approved_by INTEGER,
  approved_by_name VARCHAR(100),
  approved_at TIMESTAMPTZ,
  voided_by INTEGER,
  voided_by_name VARCHAR(100),
  voided_at TIMESTAMPTZ,
  void_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS monthly_vouchers_unique_idx
  ON monthly_vouchers(project_id, year_month, doc_type)
  WHERE status <> 'voided';

CREATE INDEX IF NOT EXISTS monthly_vouchers_month_idx ON monthly_vouchers(year_month);
CREATE INDEX IF NOT EXISTS monthly_vouchers_project_idx ON monthly_vouchers(project_id);

-- 每份凭证的页文件（图片或 PDF）
CREATE TABLE IF NOT EXISTS monthly_voucher_files (
  id SERIAL PRIMARY KEY,
  voucher_id INTEGER NOT NULL REFERENCES monthly_vouchers(id) ON DELETE CASCADE,
  file_key TEXT NOT NULL,
  file_name VARCHAR(255),
  content_type VARCHAR(100),
  page_index INTEGER DEFAULT 1,
  size_bytes BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS monthly_voucher_files_voucher_idx ON monthly_voucher_files(voucher_id, page_index);
