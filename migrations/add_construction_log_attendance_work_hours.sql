-- Add work-hour recording for construction log attendance.
ALTER TABLE construction_log_attendance
  ADD COLUMN IF NOT EXISTS work_hours NUMERIC(8,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS construction_log_attendance_project_worker_idx
  ON construction_log_attendance(project_id, worker_id);
