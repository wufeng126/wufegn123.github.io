-- 投标测算表
CREATE TABLE IF NOT EXISTS bid_estimations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,           -- 项目名称
  project_type VARCHAR(100),             -- 项目类型（住宅/公建/厂房等）
  duration_months INTEGER,               -- 工期（月）
  profit_rate NUMERIC(5,2) DEFAULT 5.0,  -- 利润率百分比
  management_fee NUMERIC(12,2) DEFAULT 0, -- 管理费总额
  total_labor_cost NUMERIC(14,2) DEFAULT 0, -- 人工费合计
  total_amount NUMERIC(14,2) DEFAULT 0,    -- 总价
  status VARCHAR(20) DEFAULT '草稿',      -- 草稿/测算中/已提交/已中标/未中标
  remark TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 投标工序明细表
CREATE TABLE IF NOT EXISTS bid_items (
  id SERIAL PRIMARY KEY,
  bid_id INTEGER NOT NULL REFERENCES bid_estimations(id) ON DELETE CASCADE,
  boq_item_name VARCHAR(200),            -- 甲方清单项名称
  boq_content TEXT,                       -- 清单内容/描述
  work_type VARCHAR(200),                 -- 匹配的工序库名称
  unit VARCHAR(20),                        -- 单位
  quantity NUMERIC(12,2) NOT NULL,         -- 数量
  standard_price NUMERIC(10,2) DEFAULT 0,  -- 工序库参考单价
  bid_price NUMERIC(10,2) NOT NULL,        -- 本次报价单价
  standard_amount NUMERIC(14,2) DEFAULT 0, -- 工序库合价
  bid_amount NUMERIC(14,2) NOT NULL,       -- 本次合价
  price_source VARCHAR(50),               -- 价格来源（auto/manual）
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 投标管理费明细表
CREATE TABLE IF NOT EXISTS bid_management_fees (
  id SERIAL PRIMARY KEY,
  bid_id INTEGER NOT NULL REFERENCES bid_estimations(id) ON DELETE CASCADE,
  position VARCHAR(100) NOT NULL,         -- 岗位
  monthly_salary NUMERIC(10,2) NOT NULL,  -- 月薪
  headcount INTEGER NOT NULL DEFAULT 1,   -- 人数
  months INTEGER NOT NULL,                -- 月数
  amount NUMERIC(12,2) NOT NULL,          -- 金额
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bid_items_bid_id_idx ON bid_items(bid_id);
CREATE INDEX IF NOT EXISTS bid_management_fees_bid_id_idx ON bid_management_fees(bid_id);
