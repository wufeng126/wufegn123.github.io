-- ============================================================================
-- 零星材料去重（product 生产库）
-- 目标：删除 1191 条冗余重复记录，每个重复组保留 id 最小的 1 条
-- 重复判定键：项目 + 材料名称 + 采购日期 + 数量 + 单价（与系统导入查重口径一致）
-- 执行位置：Supabase 控制台 → 对应 product 项目 → SQL Editor → 粘贴整段执行
-- 安全设计：先 CREATE 备份表留档，再 DELETE，最后验证；全程在事务内可回滚
-- ============================================================================

BEGIN;

-- 步骤0（预览，可选）：先确认将删除的冗余行数，预期 1191
-- SELECT count(*) AS will_delete FROM (
--   SELECT row_number() OVER (
--     PARTITION BY project_id, material_name, purchase_date::date, quantity, unit_price
--     ORDER BY id
--   ) rn
--   FROM miscellaneous_materials
-- ) t WHERE rn > 1;

-- 步骤1：备份冗余记录到备份表（留档，可长期保留，确认无误后可手动 DROP）
CREATE TABLE IF NOT EXISTS misc_materials_dedup_backup_20261027 AS
SELECT * FROM miscellaneous_materials
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           row_number() OVER (
             PARTITION BY project_id, material_name, purchase_date::date, quantity, unit_price
             ORDER BY id
           ) rn
    FROM miscellaneous_materials
  ) t
  WHERE rn > 1
);

-- 步骤2：删除冗余（每个重复组保留最小 id，删除其余）
DELETE FROM miscellaneous_materials a
USING miscellaneous_materials b
WHERE a.id > b.id
  AND a.project_id = b.project_id
  AND a.material_name = b.material_name
  AND a.purchase_date::date = b.purchase_date::date
  AND a.quantity = b.quantity
  AND a.unit_price = b.unit_price;
-- 预期结果：DELETE 1191

-- 步骤3：验证去重后无重复（应返回 0）
SELECT count(*) AS remaining_duplicates FROM (
  SELECT row_number() OVER (
    PARTITION BY project_id, material_name, purchase_date::date, quantity, unit_price
    ORDER BY id
  ) rn
  FROM miscellaneous_materials
) t WHERE rn > 1;

-- 全部确认无误后提交；如步骤2/3 结果异常，执行 ROLLBACK 回滚
COMMIT;
