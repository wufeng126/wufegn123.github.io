-- 零星材料分类改名：施工杂 → 施工杂费
-- 字典 src/lib/misc-material-categories.ts 已同步

UPDATE miscellaneous_materials
SET category = '施工杂费'
WHERE category = '施工杂';

NOTIFY pgrst, 'reload schema';
