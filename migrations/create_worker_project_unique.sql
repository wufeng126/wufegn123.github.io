-- ============================================================
-- 花名册同步去重（v2：修复级联删子表风险）
-- 同一个项目内，身份证号唯一（防止同名同证重复导入）
-- id_card 为 NULL 的记录不受影响（PostgreSQL 唯一索引允许多个 NULL）
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS workers_project_id_card_unique_idx
  ON workers(project_id, id_card)
  WHERE id_card IS NOT NULL;

-- 清理历史重复数据（同项目 + 同身份证，保留 id 最小的一条）
-- ⚠️ v2 改进：删除重复工人前，先把其出勤/工资/发放/结算拆分等子表引用
--    迁移到保留记录，避免 ON DELETE CASCADE 静默删除历史业务数据
DO $$
DECLARE
  dup RECORD;
  dup_ids INTEGER[];
BEGIN
  FOR dup IN
    SELECT project_id, id_card, MIN(id) AS keep_id
    FROM workers
    WHERE id_card IS NOT NULL
    GROUP BY project_id, id_card
    HAVING COUNT(*) > 1
  LOOP
    -- 收集待删除的重复工人 id（不含保留记录）
    SELECT ARRAY_AGG(id) INTO dup_ids
    FROM workers
    WHERE project_id = dup.project_id
      AND id_card = dup.id_card
      AND id <> dup.keep_id;

    IF dup_ids IS NOT NULL AND array_length(dup_ids, 1) > 0 THEN
      -- 1. 迁移子表引用到保留记录（各表 worker_id 列）
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

      -- 2. 再删除重复工人（此时子表已无引用，不会级联删数据）
      DELETE FROM workers WHERE id = ANY(dup_ids);
    END IF;
  END LOOP;
END $$;

-- 同样清理 worker_assignments 中因重复工人产生的重复分配
-- （worker_assignments 已有 worker_id+project_id 唯一约束，此处仅清理孤儿/重复分配）
DELETE FROM worker_assignments a
USING worker_assignments b
WHERE a.id > b.id
  AND a.worker_id = b.worker_id
  AND a.project_id = b.project_id;

NOTIFY pgrst, 'reload schema';
