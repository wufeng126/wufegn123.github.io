-- 修改 salary_payments 表，让 salary_id 和 year_month 可以为空
-- 这样可以支持独立录入工资发放记录（如预支款、加班费等）

-- 1. 先删除 NOT NULL 约束
ALTER TABLE salary_payments ALTER COLUMN salary_id DROP NOT NULL;

-- 2. 如果 year_month 也有 NOT NULL 约束，也删除
ALTER TABLE salary_payments ALTER COLUMN year_month DROP NOT NULL;
