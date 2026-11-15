-- 统一月份字段为 YYYY-MM，修复历史数据里 2026-04-01 / 2026/04 / 2026-4 等格式
-- 幂等：仅处理长度>7 或含 / 的值

-- 1) 工人工资
UPDATE worker_salaries
SET year_month = substring(replace(year_month, '/', '-') from 1 for 7)
WHERE year_month IS NOT NULL
  AND (length(year_month) > 7 OR year_month LIKE '%/%');

-- 2) 工资发放
UPDATE salary_payments
SET year_month = substring(replace(year_month, '/', '-') from 1 for 7)
WHERE year_month IS NOT NULL
  AND (length(year_month) > 7 OR year_month LIKE '%/%');

-- 3) 用工分析
UPDATE monthly_labor_analyses
SET year_month = substring(replace(year_month, '/', '-') from 1 for 7)
WHERE year_month IS NOT NULL
  AND (length(year_month) > 7 OR year_month LIKE '%/%');

-- 4) 分包月度报量
UPDATE subitem_monthly_reports
SET year_month = substring(replace(year_month, '/', '-') from 1 for 7)
WHERE year_month IS NOT NULL
  AND (length(year_month) > 7 OR year_month LIKE '%/%');

UPDATE subitem_monthly_progress
SET year_month = substring(replace(year_month, '/', '-') from 1 for 7)
WHERE year_month IS NOT NULL
  AND (length(year_month) > 7 OR year_month LIKE '%/%');

-- 5) 生活费
UPDATE living_allowance_records
SET year_month = substring(replace(year_month, '/', '-') from 1 for 7)
WHERE year_month IS NOT NULL
  AND (length(year_month) > 7 OR year_month LIKE '%/%');

-- 6) 月度凭证
UPDATE monthly_vouchers
SET year_month = substring(replace(year_month, '/', '-') from 1 for 7)
WHERE year_month IS NOT NULL
  AND (length(year_month) > 7 OR year_month LIKE '%/%');

-- 7) 月报流程
UPDATE monthly_report_workflows
SET year_month = substring(replace(year_month, '/', '-') from 1 for 7)
WHERE year_month IS NOT NULL
  AND (length(year_month) > 7 OR year_month LIKE '%/%');
