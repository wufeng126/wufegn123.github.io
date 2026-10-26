-- comprehensive_expenses 免审核直计统计
-- 背景：综合费用原默认 status='draft'，统计卡片/成本聚合/月报只统计 status='reviewed'，
-- 且综合费用页面没有审核/反审核入口，导致录入后统计卡片始终无数据（2026-09-23 af17122 起）
-- 现已改为：新录入默认 reviewed（api/comprehensive-expenses/route.ts），本迁移处理存量数据
UPDATE comprehensive_expenses
SET status = 'reviewed',
    reviewed_at = COALESCE(reviewed_at, created_at, NOW()),
    reviewed_by = COALESCE(reviewed_by, created_by, 'system')
WHERE status = 'draft';
