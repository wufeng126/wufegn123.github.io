-- 钉钉待办映射：记录「业务单据 ↔ 钉钉待办任务」用于处理完成后自动关闭待办
CREATE TABLE IF NOT EXISTS dingtalk_todo_tasks (
  id SERIAL PRIMARY KEY,
  source_type VARCHAR(40) NOT NULL,      -- team_settlement / monthly_report / visa
  source_id INTEGER NOT NULL,
  dingtalk_user_id VARCHAR(100),         -- 钉钉 userid
  union_id VARCHAR(100) NOT NULL,        -- 待办 API 需要 unionId
  task_id VARCHAR(120) NOT NULL,
  done BOOLEAN DEFAULT FALSE,
  done_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dingtalk_todo_tasks_source_idx ON dingtalk_todo_tasks(source_type, source_id);
CREATE INDEX IF NOT EXISTS dingtalk_todo_tasks_done_idx ON dingtalk_todo_tasks(done);
