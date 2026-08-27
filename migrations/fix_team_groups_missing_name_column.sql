-- 修复 team_groups 表结构与代码/Drizzle schema 不一致的问题
-- 现象：班组档案页报 "Could not find the 'name' column of 'team_groups' in the schema cache"
-- 根因：线上表使用旧列名 group_name/team_leader/team_leader_phone，而代码读写 name/leader_name/phone
-- 策略：幂等补齐代码期望的列并从旧列回填，同时放开 group_name 的 NOT NULL（避免只写 name 时插入失败），保留旧列不删数据

DO $$
BEGIN
  -- 1. 补齐 name 列并从 group_name 回填
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='team_groups' AND column_name='name'
  ) THEN
    ALTER TABLE team_groups ADD COLUMN name VARCHAR(200);
    UPDATE team_groups SET name = group_name WHERE name IS NULL AND group_name IS NOT NULL;
  END IF;

  -- 2. 补齐 phone 列并从 team_leader_phone 回填
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='team_groups' AND column_name='phone'
  ) THEN
    ALTER TABLE team_groups ADD COLUMN phone VARCHAR(30);
    UPDATE team_groups SET phone = team_leader_phone WHERE phone IS NULL AND team_leader_phone IS NOT NULL;
  END IF;

  -- 3. 若 leader_name 为空，用 team_leader 回填
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='team_groups' AND column_name='team_leader'
  ) THEN
    UPDATE team_groups SET leader_name = team_leader
    WHERE (leader_name IS NULL OR leader_name = '') AND team_leader IS NOT NULL AND team_leader <> '';
  END IF;

  -- 4. 放开 group_name 的 NOT NULL（代码只写 name，旧列保留但不再强制）
  ALTER TABLE team_groups ALTER COLUMN group_name DROP NOT NULL;

  -- 5. name 设为 NOT NULL（回填后）
  UPDATE team_groups SET name = '未命名班组' WHERE name IS NULL OR name = '';
  ALTER TABLE team_groups ALTER COLUMN name SET NOT NULL;
END $$;

-- 6. (project_id, name) 唯一索引（与 Drizzle schema 对齐，幂等）
CREATE UNIQUE INDEX IF NOT EXISTS team_groups_project_name_key
  ON team_groups(project_id, name);

-- 7. 刷新 PostgREST schema cache，使列变更立即生效
NOTIFY pgrst, 'reload schema';
