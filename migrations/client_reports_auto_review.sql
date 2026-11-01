-- 甲方报量：改为「录入即已审核」
-- 背景：报量新建/导入默认写 draft，但系统没有报量审核界面，导致
--       月报/成本中心按「草稿不计产值」统计时，产值永远是 0。
-- 处理：把历史草稿/空状态统一置为 reviewed，与录入逻辑保持一致。

UPDATE client_reports
SET status = 'reviewed'
WHERE status IS NULL OR TRIM(status) = '' OR status = 'draft';

-- 校验：应无 draft 残留
-- SELECT status, COUNT(*) FROM client_reports GROUP BY status;
