-- 修复 team_groups 表的 group_name 字段问题
-- 问题：group_name 字段有 NOT NULL 约束，但 API 只插入 name 字段

-- 方案 1：如果 group_name 字段存在，将其值同步为 name，然后删除 NOT NULL 约束
DO $$
BEGIN
  -- 检查 group_name 字段是否存在
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'team_groups' AND column_name = 'group_name'
  ) THEN
    -- 将 name 的值同步到 group_name
    UPDATE team_groups
    SET group_name = COALESCE(NULLIF(name, ''), group_name)
    WHERE group_name IS NULL OR group_name = '';

    -- 删除 group_name 的 NOT NULL 约束（如果存在）
    ALTER TABLE team_groups ALTER COLUMN group_name DROP NOT NULL;

    RAISE NOTICE 'team_groups.group_name 约束已修复';
  ELSE
    RAISE NOTICE 'team_groups.group_name 字段不存在，无需修复';
  END IF;
END $$;
