-- 工资表增加「人员类别」：生产工人 / 管理人员 / 后勤
-- 目的：管理人员工资不再混入点工工时或包活工资，成本分析与用工分析可按类别统计
ALTER TABLE worker_salaries
  ADD COLUMN IF NOT EXISTS person_category VARCHAR(20) DEFAULT 'production';

COMMENT ON COLUMN worker_salaries.person_category IS '人员类别: production(生产工人) / management(管理人员) / support(后勤)';

CREATE INDEX IF NOT EXISTS worker_salaries_person_category_idx
  ON worker_salaries(person_category);

-- 存量默认：全部按生产工人处理，管理人员需在页面上批量标记
UPDATE worker_salaries SET person_category = 'production' WHERE person_category IS NULL;
