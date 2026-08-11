-- ============================================================
-- 花名册去重增强（v3）：同一项目内，姓名也唯一
-- 背景：已有 workers_project_id_card_unique_idx（项目+身份证唯一）；
--       业务要求"同一项目不能同时存在身份证号相同、姓名相同的人员"，
--       故补充"项目+姓名"唯一索引。
-- 幂等：可重复执行；存量重复（同项目同名）保留 id 最小的一条，
--       先把其子表引用迁移到保留记录，再删除其余，避免级联删历史数据。
-- ============================================================

-- 1. 项目+姓名 唯一索引（姓名非空才约束，允许多个 NULL/空串）
CREATE UNIQUE INDEX IF NOT EXISTS workers_project_id_name_unique_idx
  ON workers(project_id, name)
  WHERE name IS NOT NULL AND name <> '';

-- 2. 清理存量重复（同项目同名，保留 id 最小；先迁移子表引用再删）
DO $$
DECLARE
  dup RECORD;
  dup_ids INTEGER[];
BEGIN
  FOR dup IN
    SELECT project_id, name, MIN(id) AS keep_id
    FROM workers
    WHERE name IS NOT NULL AND name <> ''
    GROUP BY project_id, name
    HAVING COUNT(*) > 1
  LOOP
    SELECT ARRAY_AGG(id) INTO dup_ids
    FROM workers
    WHERE project_id = dup.project_id
      AND name = dup.name
      AND id <> dup.keep_id;

    IF dup_ids IS NOT NULL AND array_length(dup_ids, 1) > 0 THEN
      -- 迁移子表引用到保留记录
      UPDATE worker_salaries SET worker_id = dup.keep_id
        WHERE worker_id = ANY(dup_ids);
      UPDATE salary_payments SET worker_id = dup.keep_id
        WHERE worker_id = ANY(dup_ids);
      UPDATE construction_log_attendance SET worker_id = dup.keep_id
        WHERE worker_id = ANY(dup_ids);
      UPDATE team_settlement_splits SET worker_id = dup.keep_id
        WHERE worker_id = ANY(dup_ids);
      UPDATE worker_assignments SET worker_id = dup.keep_id
        WHERE worker_id = ANY(dup_ids);

      -- 再删除重复记录
      DELETE FROM workers WHERE id = ANY(dup_ids);
    END IF;
  END LOOP;
END $$;

-- 3. 尝试重建索引（若上一步清理后仍冲突则报错，需人工处理）
CREATE UNIQUE INDEX IF NOT EXISTS workers_project_id_name_unique_idx
  ON workers(project_id, name)
  WHERE name IS NOT NULL AND name <> '';

NOTIFY pgrst, 'reload schema';
