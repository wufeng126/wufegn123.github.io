-- 投标测算一期增强：标准清单、历史中标价、内部成本价、版本快照

CREATE TABLE IF NOT EXISTS bid_standard_items (
  id SERIAL PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  unit VARCHAR(30),
  category VARCHAR(100),
  material_included BOOLEAN DEFAULT FALSE,
  material_scope_note TEXT,
  status VARCHAR(20) DEFAULT 'active',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bid_item_aliases (
  id SERIAL PRIMARY KEY,
  standard_item_id INTEGER NOT NULL REFERENCES bid_standard_items(id) ON DELETE CASCADE,
  alias_name VARCHAR(200) NOT NULL,
  source_type VARCHAR(40) DEFAULT 'manual',
  confirmed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (standard_item_id, alias_name)
);

CREATE TABLE IF NOT EXISTS bid_price_history (
  id SERIAL PRIMARY KEY,
  standard_item_id INTEGER NOT NULL REFERENCES bid_standard_items(id) ON DELETE CASCADE,
  project_name VARCHAR(200),
  region VARCHAR(100),
  project_type VARCHAR(100),
  item_original_name VARCHAR(200),
  unit VARCHAR(30),
  price NUMERIC(12,2) NOT NULL,
  bid_year INTEGER,
  material_included BOOLEAN DEFAULT FALSE,
  material_scope_note TEXT,
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bid_cost_history (
  id SERIAL PRIMARY KEY,
  standard_item_id INTEGER NOT NULL REFERENCES bid_standard_items(id) ON DELETE CASCADE,
  project_name VARCHAR(200),
  region VARCHAR(100),
  project_type VARCHAR(100),
  item_original_name VARCHAR(200),
  unit VARCHAR(30),
  price NUMERIC(12,2) NOT NULL,
  cost_year INTEGER,
  material_included BOOLEAN DEFAULT FALSE,
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bid_versions (
  id SERIAL PRIMARY KEY,
  bid_id INTEGER NOT NULL REFERENCES bid_estimations(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  summary TEXT,
  total_amount NUMERIC(14,2) DEFAULT 0,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bid_estimations
  ADD COLUMN IF NOT EXISTS region VARCHAR(100),
  ADD COLUMN IF NOT EXISTS material_included BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS material_scope_note TEXT,
  ADD COLUMN IF NOT EXISTS management_fee_rate NUMERIC(8,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS version_count INTEGER DEFAULT 0;

ALTER TABLE bid_items
  ADD COLUMN IF NOT EXISTS standard_item_id INTEGER REFERENCES bid_standard_items(id),
  ADD COLUMN IF NOT EXISTS standard_code VARCHAR(80),
  ADD COLUMN IF NOT EXISTS original_item_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS match_score NUMERIC(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS match_status VARCHAR(30) DEFAULT 'unmatched',
  ADD COLUMN IF NOT EXISTS historical_bid_price NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS historical_bid_amount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_amount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS management_fee_rate NUMERIC(8,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit_rate NUMERIC(8,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suggested_price NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suggested_amount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_price NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_amount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pricing_warning TEXT,
  ADD COLUMN IF NOT EXISTS is_manual_price BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS bid_standard_items_name_idx ON bid_standard_items(name);
CREATE INDEX IF NOT EXISTS bid_item_aliases_alias_idx ON bid_item_aliases(alias_name);
CREATE INDEX IF NOT EXISTS bid_price_history_standard_idx ON bid_price_history(standard_item_id);
CREATE INDEX IF NOT EXISTS bid_cost_history_standard_idx ON bid_cost_history(standard_item_id);
CREATE INDEX IF NOT EXISTS bid_versions_bid_idx ON bid_versions(bid_id);

INSERT INTO bid_standard_items (code, name, unit, category, sort_order)
VALUES
  ('MB-001', '模板安装拆除', 'm2', '模板工程', 1),
  ('GJ-001', '钢筋制作安装', 't', '钢筋工程', 2),
  ('HNT-001', '混凝土浇筑', 'm3', '混凝土工程', 3),
  ('QT-001', '砌体砌筑', 'm3', '砌体工程', 4),
  ('JZ-001', '抹灰施工', 'm2', '装饰工程', 5),
  ('FS-001', '防水施工', 'm2', '防水工程', 6),
  ('JSJ-001', '脚手架搭拆', 'm2', '脚手架工程', 7)
ON CONFLICT (code) DO NOTHING;
