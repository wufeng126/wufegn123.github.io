-- 供应商分类（材料 / 机械租赁 / 钢化租赁 / 周转料具 / 劳务班组 / 其他）
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS category VARCHAR(50);

COMMENT ON COLUMN suppliers.category IS '供应商分类：材料/机械租赁/钢化租赁/周转料具/劳务班组/其他';

CREATE INDEX IF NOT EXISTS suppliers_category_idx ON suppliers(category);
