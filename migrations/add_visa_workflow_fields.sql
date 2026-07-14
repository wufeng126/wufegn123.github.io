-- 签证线下办理流转字段
ALTER TABLE visas ADD COLUMN IF NOT EXISTS current_responsible_user_id INTEGER;
ALTER TABLE visas ADD COLUMN IF NOT EXISTS current_responsible_name VARCHAR(100);
ALTER TABLE visas ADD COLUMN IF NOT EXISTS budget_user_id INTEGER;
ALTER TABLE visas ADD COLUMN IF NOT EXISTS budget_user_name VARCHAR(100);
ALTER TABLE visas ADD COLUMN IF NOT EXISTS project_manager_user_id INTEGER;
ALTER TABLE visas ADD COLUMN IF NOT EXISTS project_manager_name VARCHAR(100);
ALTER TABLE visas ADD COLUMN IF NOT EXISTS workflow_step_updated_at TIMESTAMPTZ;
ALTER TABLE visas ADD COLUMN IF NOT EXISTS workflow_last_reminded_at TIMESTAMPTZ;
ALTER TABLE visas ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;
ALTER TABLE visas ADD COLUMN IF NOT EXISTS business_confirmed_at TIMESTAMPTZ;
ALTER TABLE visas ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE visas ADD COLUMN IF NOT EXISTS workflow_comment TEXT;

CREATE INDEX IF NOT EXISTS visas_current_responsible_user_id_idx ON visas(current_responsible_user_id);
CREATE INDEX IF NOT EXISTS visas_workflow_step_updated_at_idx ON visas(workflow_step_updated_at);
CREATE INDEX IF NOT EXISTS visas_status_workflow_step_idx ON visas(status, workflow_step_updated_at);
