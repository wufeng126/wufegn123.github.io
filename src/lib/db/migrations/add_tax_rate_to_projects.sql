-- 在 projects 表添加 tax_rate 字段
-- 执行时间: 2026-03-31

-- 添加 tax_rate 字段（默认税率 9%）
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,2) DEFAULT 9.00;

-- 为现有项目设置默认税率
UPDATE projects SET tax_rate = 9.00 WHERE tax_rate IS NULL;

-- 添加注释
COMMENT ON COLUMN projects.tax_rate IS '项目适用税率，百分比，默认9%';
