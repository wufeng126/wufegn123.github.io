-- 花名册同步去重：同一个项目内，身份证号唯一（防止同名同证重复导入）
-- id_card 为 NULL 的记录不受影响（PostgreSQL 唯一索引允许多个 NULL）
CREATE UNIQUE INDEX IF NOT EXISTS workers_project_id_card_unique_idx
  ON workers(project_id, id_card)
  WHERE id_card IS NOT NULL;

-- 清理历史重复数据（同项目 + 同身份证，仅保留 id 最小的一条）
-- 先删除重复数据再建索引，避免唯一索引创建失败
DO $$
DECLARE
  dup RECORD;
BEGIN
  FOR dup IN
    SELECT project_id, id_card, MIN(id) AS keep_id
    FROM workers
    WHERE id_card IS NOT NULL
    GROUP BY project_id, id_card
    HAVING COUNT(*) > 1
  LOOP
    DELETE FROM workers
    WHERE project_id = dup.project_id
      AND id_card = dup.id_card
      AND id <> dup.keep_id;
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
