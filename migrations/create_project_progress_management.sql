CREATE TABLE IF NOT EXISTS project_progress_foundations (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category VARCHAR(40) NOT NULL,
  name VARCHAR(200) NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(project_id, category, name)
);

CREATE INDEX IF NOT EXISTS project_progress_foundations_project_idx ON project_progress_foundations(project_id);
CREATE INDEX IF NOT EXISTS project_progress_foundations_category_idx ON project_progress_foundations(project_id, category, is_active);

CREATE TABLE IF NOT EXISTS project_progress_tasks (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  year_month VARCHAR(7) NOT NULL,
  wbs VARCHAR(80),
  phase VARCHAR(100),
  area VARCHAR(100),
  floor VARCHAR(100),
  process VARCHAR(160),
  owner_role VARCHAR(200),
  dependency TEXT,
  logic VARCHAR(10) DEFAULT 'FS',
  plan_start_date DATE NOT NULL,
  plan_end_date DATE NOT NULL,
  actual_start_date DATE,
  actual_end_date DATE,
  actual_progress NUMERIC(6,2) DEFAULT 0,
  issue TEXT,
  next_action TEXT,
  is_key BOOLEAN DEFAULT FALSE,
  created_by INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS project_progress_tasks_project_idx ON project_progress_tasks(project_id);
CREATE INDEX IF NOT EXISTS project_progress_tasks_project_month_idx ON project_progress_tasks(project_id, year_month);
CREATE INDEX IF NOT EXISTS project_progress_tasks_plan_date_idx ON project_progress_tasks(project_id, plan_start_date, plan_end_date);

CREATE TABLE IF NOT EXISTS project_progress_task_quantities (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES project_progress_tasks(id) ON DELETE CASCADE,
  subitem_id INTEGER REFERENCES work_item_subitems(id) ON DELETE SET NULL,
  quantity_item VARCHAR(240),
  matched_quantity NUMERIC(14,2) DEFAULT 0,
  unit VARCHAR(40),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS project_progress_task_quantities_task_idx ON project_progress_task_quantities(task_id);
CREATE INDEX IF NOT EXISTS project_progress_task_quantities_subitem_idx ON project_progress_task_quantities(subitem_id);

NOTIFY pgrst, 'reload schema';
