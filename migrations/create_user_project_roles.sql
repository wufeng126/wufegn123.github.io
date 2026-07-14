CREATE TABLE IF NOT EXISTS user_project_roles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role_code VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, project_id, role_code)
);

CREATE INDEX IF NOT EXISTS user_project_roles_user_id_idx ON user_project_roles(user_id);
CREATE INDEX IF NOT EXISTS user_project_roles_project_id_idx ON user_project_roles(project_id);
CREATE INDEX IF NOT EXISTS user_project_roles_role_code_idx ON user_project_roles(role_code);
CREATE INDEX IF NOT EXISTS user_project_roles_project_role_idx ON user_project_roles(project_id, role_code);

COMMENT ON TABLE user_project_roles IS '用户在具体项目中的业务身份配置';
COMMENT ON COLUMN user_project_roles.role_code IS '项目业务身份: budget, project_manager, finance, site_staff';
