-- miscellaneous_materials 免审核直计成本
-- 背景：零星材料原默认 status='draft'，成本聚合只统计 status='reviewed'，导致录入不计入成本
-- 现已改为：新录入/导入默认 reviewed（route.ts / import/route.ts），本迁移处理存量数据
UPDATE miscellaneous_materials
SET status = 'reviewed',
    reviewed_at = COALESCE(reviewed_at, created_at, NOW()),
    reviewed_by = COALESCE(reviewed_by, 'system')
WHERE status = 'draft';
