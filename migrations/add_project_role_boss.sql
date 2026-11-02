-- 项目内业务身份新增「老板」（boss）
-- user_project_roles.role_code 为自由 varchar，无 CHECK 约束，应用层白名单在 src/lib/user-project-roles.ts
COMMENT ON COLUMN user_project_roles.role_code IS '项目业务身份: budget, project_manager, boss, finance, site_staff';
