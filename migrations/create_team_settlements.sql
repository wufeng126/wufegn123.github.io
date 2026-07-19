-- Team group archive and settlement module.
CREATE TABLE IF NOT EXISTS team_groups (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  leader_name VARCHAR(100),
  phone VARCHAR(30),
  work_type VARCHAR(50),
  remark TEXT,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS team_groups_project_id_idx ON team_groups(project_id);
CREATE INDEX IF NOT EXISTS team_groups_work_type_idx ON team_groups(work_type);
CREATE INDEX IF NOT EXISTS team_groups_status_idx ON team_groups(status);
CREATE UNIQUE INDEX IF NOT EXISTS team_groups_project_name_key
  ON team_groups(project_id, name);

CREATE TABLE IF NOT EXISTS team_settlements (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  team_id INTEGER REFERENCES team_groups(id) ON DELETE SET NULL,
  settlement_no VARCHAR(50),
  settlement_month VARCHAR(7) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'draft',
  remark TEXT,
  created_by INTEGER,
  created_by_name VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS team_settlements_project_id_idx ON team_settlements(project_id);
CREATE INDEX IF NOT EXISTS team_settlements_team_id_idx ON team_settlements(team_id);
CREATE INDEX IF NOT EXISTS team_settlements_month_idx ON team_settlements(settlement_month);
CREATE INDEX IF NOT EXISTS team_settlements_created_at_idx ON team_settlements(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS team_settlements_settlement_no_key
  ON team_settlements(settlement_no)
  WHERE settlement_no IS NOT NULL;

CREATE TABLE IF NOT EXISTS team_settlement_items (
  id SERIAL PRIMARY KEY,
  settlement_id INTEGER NOT NULL REFERENCES team_settlements(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  team_id INTEGER REFERENCES team_groups(id) ON DELETE SET NULL,
  content VARCHAR(300) NOT NULL,
  unit VARCHAR(30),
  quantity NUMERIC(14,2) DEFAULT 0,
  unit_price NUMERIC(14,2) DEFAULT 0,
  amount NUMERIC(14,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS team_settlement_items_settlement_id_idx ON team_settlement_items(settlement_id);
CREATE INDEX IF NOT EXISTS team_settlement_items_project_content_idx ON team_settlement_items(project_id, content);

CREATE TABLE IF NOT EXISTS team_settlement_splits (
  id SERIAL PRIMARY KEY,
  settlement_id INTEGER NOT NULL REFERENCES team_settlements(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  team_id INTEGER REFERENCES team_groups(id) ON DELETE SET NULL,
  worker_id INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  worker_name VARCHAR(100),
  work_type VARCHAR(50),
  team_name VARCHAR(100),
  work_hours NUMERIC(10,2) DEFAULT 0,
  unit_price NUMERIC(14,2) DEFAULT 0,
  amount NUMERIC(14,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(settlement_id, worker_id)
);

CREATE INDEX IF NOT EXISTS team_settlement_splits_settlement_id_idx ON team_settlement_splits(settlement_id);
CREATE INDEX IF NOT EXISTS team_settlement_splits_project_worker_idx ON team_settlement_splits(project_id, worker_id);

NOTIFY pgrst, 'reload schema';
