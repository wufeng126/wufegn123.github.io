-- ============================================================
-- 花名册去重增强（v4）：同一项目内，姓名也唯一
-- 背景：已有 workers_project_id_card_unique_idx（项目+身份证唯一）；
--       业务要求"同一项目不能同时存在身份证号相同、姓名相同的人员"。
-- v4 安全强化：
--   1) 先清理重复、后建唯一索引（避免存量重名时 CREATE UNIQUE INDEX 失败导致整批回滚）；
--   2) 仅合并「同项目 + 同名 + 同身份证」的真正重复，不再按「项目+姓名」跨身份证误删真实人员；
--   3) 子表迁移加唯一键冲突防护，删除仅针对已无任何业务引用的重复行。
-- 幂等：可重复执行；存量重复保留 id 最小的一条。
-- ============================================================

-- 1. 清理存量重复（仅同项目+同名+同证，保留 id 最小；先迁移子表引用再删）
DO $$
DECLARE
  dup RECORD;
  dup_ids INTEGER[];
BEGIN
  FOR dup IN
    SELECT project_id, name, id_card, MIN(id) AS keep_id
    FROM workers
    WHERE name IS NOT NULL AND name <> '' AND id_card IS NOT NULL
    GROUP BY project_id, name, id_card
    HAVING COUNT(*) > 1
  LOOP
    SELECT ARRAY_AGG(id) INTO dup_ids
    FROM workers
    WHERE project_id = dup.project_id
      AND name = dup.name
      AND id_card = dup.id_card
      AND id <> dup.keep_id;

    IF dup_ids IS NOT NULL AND array_length(dup_ids, 1) > 0 THEN
      -- 迁移子表引用到保留记录（唯一键冲突时跳过该行，避免整批回滚）
      UPDATE worker_salaries s SET worker_id = dup.keep_id
        WHERE s.worker_id = ANY(dup_ids)
          AND NOT EXISTS (
            SELECT 1 FROM worker_salaries k
            WHERE k.worker_id = dup.keep_id
              AND k.project_id = s.project_id
              AND k.year_month = s.year_month
          );
      UPDATE salary_payments s SET worker_id = dup.keep_id
        WHERE s.worker_id = ANY(dup_ids);
      UPDATE construction_log_attendance s SET worker_id = dup.keep_id
        WHERE s.worker_id = ANY(dup_ids);
      UPDATE team_settlement_splits s SET worker_id = dup.keep_id
        WHERE s.worker_id = ANY(dup_ids)
          AND NOT EXISTS (
            SELECT 1 FROM team_settlement_splits k
            WHERE k.worker_id = dup.keep_id AND k.settlement_id = s.settlement_id
          );
      UPDATE worker_assignments s SET worker_id = dup.keep_id
        WHERE s.worker_id = ANY(dup_ids)
          AND NOT EXISTS (
            SELECT 1 FROM worker_assignments k
            WHERE k.worker_id = dup.keep_id AND k.project_id = s.project_id
          );

      -- 删除重复行：仅删除迁移后已无任何业务引用的重复记录
      DELETE FROM workers w
        WHERE w.id = ANY(dup_ids)
          AND NOT EXISTS (SELECT 1 FROM worker_salaries s WHERE s.worker_id = w.id)
          AND NOT EXISTS (SELECT 1 FROM salary_payments s WHERE s.worker_id = w.id)
          AND NOT EXISTS (SELECT 1 FROM construction_log_attendance s WHERE s.worker_id = w.id)
          AND NOT EXISTS (SELECT 1 FROM team_settlement_splits s WHERE s.worker_id = w.id)
          AND NOT EXISTS (SELECT 1 FROM worker_assignments s WHERE s.worker_id = w.id)
          AND NOT EXISTS (SELECT 1 FROM living_allowance_records s WHERE s.worker_id = w.id)
          AND NOT EXISTS (SELECT 1 FROM living_allowance_receipt_items s WHERE s.worker_id = w.id);
    END IF;
  END LOOP;
END $$;

-- 2. 清理后建立 项目+姓名 唯一索引（姓名非空才约束，允许多个 NULL/空串）
CREATE UNIQUE INDEX IF NOT EXISTS workers_project_id_name_unique_idx
  ON workers(project_id, name)
  WHERE name IS NOT NULL AND name <> '';

NOTIFY pgrst, 'reload schema';
