-- 零星材料二级分类：miscellaneous_materials 增加 subcategory 列
-- 一级分类 category 沿用（12 类），subcategory 存子类名称（如 '紧固件'），NULL = 未细分子类
-- 存量数据子类留 NULL，由用户在界面上按需补选（product 存量仅 10 条，不值得脚本回填）

ALTER TABLE miscellaneous_materials ADD COLUMN IF NOT EXISTS subcategory varchar(50);

CREATE INDEX IF NOT EXISTS miscellaneous_materials_subcategory_idx ON miscellaneous_materials(subcategory);
CREATE INDEX IF NOT EXISTS miscellaneous_materials_cat_subcat_idx ON miscellaneous_materials(category, subcategory);
