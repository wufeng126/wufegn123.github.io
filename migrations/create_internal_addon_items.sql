-- Internal addon item templates and project settlement records
CREATE TABLE IF NOT EXISTS internal_addon_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  default_price NUMERIC(12,2) DEFAULT 0,
  remark TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_internal_addons (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_id INTEGER REFERENCES internal_addon_templates(id) ON DELETE SET NULL,
  name VARCHAR(200) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  unit_price NUMERIC(12,2) DEFAULT 0,
  remark TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS internal_addon_monthly_settlements (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  addon_id INTEGER NOT NULL REFERENCES project_internal_addons(id) ON DELETE CASCADE,
  year_month VARCHAR(7) NOT NULL,
  quantity NUMERIC(14,2) DEFAULT 0,
  unit_price NUMERIC(12,2) DEFAULT 0,
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(addon_id, year_month)
);

CREATE INDEX IF NOT EXISTS internal_addon_templates_active_idx ON internal_addon_templates(is_active);
CREATE INDEX IF NOT EXISTS project_internal_addons_project_id_idx ON project_internal_addons(project_id);
ALTER TABLE project_internal_addons DROP CONSTRAINT IF EXISTS project_internal_addons_project_id_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS project_internal_addons_active_name_idx ON project_internal_addons(project_id, name) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS internal_addon_settlements_project_month_idx ON internal_addon_monthly_settlements(project_id, year_month);
CREATE INDEX IF NOT EXISTS internal_addon_settlements_addon_id_idx ON internal_addon_monthly_settlements(addon_id);
