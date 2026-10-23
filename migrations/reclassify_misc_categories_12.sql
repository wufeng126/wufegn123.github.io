-- 零星材料分类体系重划：9 类 → 12 类
-- 变化：
--   1. 原"工具器具"拆分为"大型机具"（机械租赁/台班/大型设备）与"小型工具"（手持/小型手动工具）
--   2. 新增"周转辅材"（模板/木方/脚手架/扣件/顶托/篷布等可周转摊销材料）
--   3. 新增"施工杂"（打扫清理/垃圾清运/抽水/临建/零工等现场杂项费用）
-- 其余类别（五金电料/电线电气/水暖管件/焊接耗材/劳保安全/油料化工/运费/其他材料）不变
-- category 为 varchar(50) 无 CHECK 约束，字典 src/lib/misc-material-categories.ts 已同步

-- 大型机具：名称命中大型机械/租赁/台班/翻斗车等
UPDATE miscellaneous_materials
SET category = '大型机具'
WHERE category = '工具器具'
  AND (
    material_name ILIKE '%挖机%' OR material_name ILIKE '%挖掘机%' OR material_name ILIKE '%装载机%'
    OR material_name ILIKE '%铲车%' OR material_name ILIKE '%吊车%' OR material_name ILIKE '%塔吊%'
    OR material_name ILIKE '%汽车吊%' OR material_name ILIKE '%随车吊%' OR material_name ILIKE '%叉车%'
    OR material_name ILIKE '%压路机%' OR material_name ILIKE '%推土机%' OR material_name ILIKE '%旋挖%'
    OR material_name ILIKE '%泵车%' OR material_name ILIKE '%罐车%' OR material_name ILIKE '%搅拌车%'
    OR material_name ILIKE '%运输车%' OR material_name ILIKE '%发电机%' OR material_name ILIKE '%空压机%'
    OR material_name ILIKE '%升降机%' OR material_name ILIKE '%施工电梯%' OR material_name ILIKE '%物料提升%'
    OR material_name ILIKE '%调直机%' OR material_name ILIKE '%弯曲机%' OR material_name ILIKE '%切断机%'
    OR material_name ILIKE '%套丝机%' OR material_name ILIKE '%搅拌站%' OR material_name ILIKE '%翻斗车%'
    OR material_name ILIKE '%机械租赁%' OR material_name ILIKE '%台班%'
  );

-- 剩余"工具器具"全部归入小型工具
UPDATE miscellaneous_materials
SET category = '小型工具'
WHERE category = '工具器具';

NOTIFY pgrst, 'reload schema';
