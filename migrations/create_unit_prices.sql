-- 工序单价库表
CREATE TABLE IF NOT EXISTS unit_prices (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  work_type VARCHAR(200) NOT NULL,
  unit VARCHAR(20),
  price NUMERIC(10,2) NOT NULL,
  contract_type VARCHAR(20) DEFAULT '包活',
  quantity NUMERIC(12,2),
  amount NUMERIC(14,2),
  year INTEGER,
  notes TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS unit_prices_work_type_idx ON unit_prices(work_type);
CREATE INDEX IF NOT EXISTS unit_prices_project_id_idx ON unit_prices(project_id);
