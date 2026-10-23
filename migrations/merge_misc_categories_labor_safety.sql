-- 零星材料分类合并：劳保防护 + 安全文明 → 劳保安全
-- 背景：两类粒度偏细且语义相近（个人防护 + 现场安全文明），合并为"劳保安全"统一统计
-- 影响：miscellaneous_materials.category 为 varchar(50) 无 CHECK 约束，仅需迁移存量数据
-- 字典单一事实来源 src/lib/misc-material-categories.ts 已同步合并

UPDATE miscellaneous_materials
SET category = '劳保安全'
WHERE category IN ('劳保防护', '安全文明');

-- 刷新 PostgREST schema cache（双环境习惯操作）
NOTIFY pgrst, 'reload schema';
