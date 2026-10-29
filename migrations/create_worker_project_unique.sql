-- ============================================================
-- 花名册同步去重（v4：唯一键冲突防护 + 引用检查，避免级联误删）
-- 同一个项目内，身份证号唯一（防止同名同证重复导入）
-- id_card 为 NULL 的记录不受影响（PostgreSQL 唯一索引允许多个 NULL）
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS workers_project_id_card_unique_idx
  ON workers(project_id, id_card)
  WHERE id_card IS NOT NULL;

-- 清理历史重复数据（同项目 + 同身份证，保留 id 最小的一条）
-- ⚠️ v2 改进：删除重复工人前，先把其出勤/工资/发放/结算拆分等子表引用迁移到保留记录
-- ⚠️ v3 补齐：生活费台账两张子表
-- ⚠️ v4 安全强化：
--   1) 子表迁移加唯一键冲突防护（目标已有同键行时跳过，避免 UPDATE 撞唯一约束整批回滚）；
--   2) 删除仅针对「迁移后已无任何业务引用」的重复行，仍有引用的保留（不级联删历史数据）。
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
      --    唯一键冲突防护：目标表若已存在同键行，跳过该行迁移（保留原引用，避免整批回滚）
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
      -- v3 补齐：生活费台账两表，否则 living_allowance_records 因 ON DELETE CASCADE
      -- 被静默删除、receipt_items 因 ON DELETE SET NULL 留下无法归属的孤儿明细
      UPDATE living_allowance_records s SET worker_id = dup.keep_id
        WHERE s.worker_id = ANY(dup_ids);
      UPDATE living_allowance_receipt_items s SET worker_id = dup.keep_id
        WHERE s.worker_id = ANY(dup_ids);

      -- 2. 删除重复工人：仅删除迁移后已无任何业务引用的重复行
      --    （仍有引用的保留，避免级联误删历史数据；剩余重复可人工清理）
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

-- 同样清理 worker_assignments 中因重复工人产生的重复分配
-- （worker_assignments 已有 worker_id+project_id 唯一约束，此处仅清理孤儿/重复分配）
DELETE FROM worker_assignments a
USING worker_assignments b
WHERE a.id > b.id
  AND a.worker_id = b.worker_id
  AND a.project_id = b.project_id;

NOTIFY pgrst, 'reload schema';
