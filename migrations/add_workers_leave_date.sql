-- 花名册增加「退场日期」字段
ALTER TABLE workers ADD COLUMN IF NOT EXISTS leave_date DATE;

COMMENT ON COLUMN workers.leave_date IS '退场日期（工人离开项目/公司的日期）';

CREATE INDEX IF NOT EXISTS workers_leave_date_idx ON workers(leave_date);
