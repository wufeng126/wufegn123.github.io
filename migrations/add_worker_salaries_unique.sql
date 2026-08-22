-- ============================================================
-- 工资唯一约束：同一工人同一项目同一月份只允许一条工资记录
-- （此前仅 POST 层校验，并发/绕过 API 时可插入重复工资）
-- ============================================================

-- 清理历史重复数据：保留每个 (worker_id, project_id, year_month) 组合中最新的一条
DELETE FROM worker_salaries a
USING worker_salaries b
WHERE a.id < b.id
  AND a.worker_id = b.worker_id
  AND a.project_id IS NOT DISTINCT FROM b.project_id
  AND a.year_month = b.year_month;

-- 增加唯一约束（worker_id 非空，project_id 可空时用 coalesce 兜底以保证唯一性生效）
-- 注：PostgreSQL 唯一约束对 NULL 不去重，故 project_id 为空时按 0 处理
CREATE UNIQUE INDEX IF NOT EXISTS worker_salaries_worker_project_month_unique
  ON worker_salaries (worker_id, COALESCE(project_id, 0), year_month);
