-- 高频查询索引（工资/发放/生活费/报量），缓解统计与列表慢查询
CREATE INDEX IF NOT EXISTS idx_worker_salaries_worker_month ON worker_salaries(worker_id, year_month);
CREATE INDEX IF NOT EXISTS idx_worker_salaries_project_month ON worker_salaries(project_id, year_month);
CREATE INDEX IF NOT EXISTS idx_salary_payments_worker ON salary_payments(worker_id);
CREATE INDEX IF NOT EXISTS idx_salary_payments_project_month ON salary_payments(project_id, year_month);
CREATE INDEX IF NOT EXISTS idx_salary_payments_salary ON salary_payments(salary_id);
CREATE INDEX IF NOT EXISTS idx_living_allowance_worker_month ON living_allowance_records(worker_id, year_month);
CREATE INDEX IF NOT EXISTS idx_client_reports_project_date ON client_reports(project_id, report_date);
CREATE INDEX IF NOT EXISTS idx_client_payments_project_date ON client_payments(project_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_construction_logs_date ON construction_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_workers_project ON workers(project_id);
CREATE INDEX IF NOT EXISTS idx_workers_person ON workers(person_id);
