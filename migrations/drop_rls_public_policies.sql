-- ============================================================
-- 安全收紧：删除 12 张敏感表的 public RLS 策略（P0-1）
--
-- 背景：
-- - 应用层已统一改用 service_role key 直连（绕过 RLS），功能不受影响
-- - 这些表的 public 策略此前允许"任何持有 anon key 的人"读写全部数据
--   （anon key 是公开的 → 等于数据裸奔）
-- - 本迁移：启用 RLS + 删除 public 策略 → 未认证连接（anon key）完全无法访问
--
-- 执行后验证：
--   anon key 连接 SELECT 任意表应返回 401/无权限；service_role 连接不受影响
-- ============================================================

-- workers（工人档案：含身份证号、银行卡号，最高敏感）
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workers_允许公开删除" ON workers;
DROP POLICY IF EXISTS "workers_允许公开更新" ON workers;
DROP POLICY IF EXISTS "workers_允许公开写入" ON workers;
DROP POLICY IF EXISTS "workers_允许公开读取" ON workers;

-- worker_salaries（工资单）
ALTER TABLE worker_salaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "worker_salaries_允许公开删除" ON worker_salaries;
DROP POLICY IF EXISTS "worker_salaries_允许公开更新" ON worker_salaries;
DROP POLICY IF EXISTS "worker_salaries_允许公开写入" ON worker_salaries;
DROP POLICY IF EXISTS "worker_salaries_允许公开读取" ON worker_salaries;

-- worker_import_history（导入记录）
ALTER TABLE worker_import_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "worker_import_history_允许公开删除" ON worker_import_history;
DROP POLICY IF EXISTS "worker_import_history_允许公开写入" ON worker_import_history;
DROP POLICY IF EXISTS "worker_import_history_允许公开读取" ON worker_import_history;

-- projects（项目）
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "projects_允许公开删除" ON projects;
DROP POLICY IF EXISTS "projects_允许公开更新" ON projects;
DROP POLICY IF EXISTS "projects_允许公开写入" ON projects;
DROP POLICY IF EXISTS "projects_允许公开读取" ON projects;

-- work_items（分项工程）
ALTER TABLE work_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "work_items_允许公开删除" ON work_items;
DROP POLICY IF EXISTS "work_items_允许公开更新" ON work_items;
DROP POLICY IF EXISTS "work_items_允许公开写入" ON work_items;
DROP POLICY IF EXISTS "work_items_允许公开读取" ON work_items;

-- work_item_progress（分项进度）
ALTER TABLE work_item_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "work_item_progress_允许公开删除" ON work_item_progress;
DROP POLICY IF EXISTS "work_item_progress_允许公开更新" ON work_item_progress;
DROP POLICY IF EXISTS "work_item_progress_允许公开写入" ON work_item_progress;
DROP POLICY IF EXISTS "work_item_progress_允许公开读取" ON work_item_progress;

-- work_item_subitems（分项工程量清单）
ALTER TABLE work_item_subitems ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "work_item_subitems_允许公开删除" ON work_item_subitems;
DROP POLICY IF EXISTS "work_item_subitems_允许公开更新" ON work_item_subitems;
DROP POLICY IF EXISTS "work_item_subitems_允许公开写入" ON work_item_subitems;
DROP POLICY IF EXISTS "work_item_subitems_允许公开读取" ON work_item_subitems;

-- client_payments（甲方回款）
ALTER TABLE client_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "client_payments_允许公开删除" ON client_payments;
DROP POLICY IF EXISTS "client_payments_允许公开更新" ON client_payments;
DROP POLICY IF EXISTS "client_payments_允许公开写入" ON client_payments;
DROP POLICY IF EXISTS "client_payments_允许公开读取" ON client_payments;

-- client_reports（甲方报量）
ALTER TABLE client_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "client_reports_允许公开删除" ON client_reports;
DROP POLICY IF EXISTS "client_reports_允许公开更新" ON client_reports;
DROP POLICY IF EXISTS "client_reports_允许公开写入" ON client_reports;
DROP POLICY IF EXISTS "client_reports_允许公开读取" ON client_reports;

-- subitem_monthly_reports（月度报量）
ALTER TABLE subitem_monthly_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subitem_monthly_reports_允许公开删除" ON subitem_monthly_reports;
DROP POLICY IF EXISTS "subitem_monthly_reports_允许公开更新" ON subitem_monthly_reports;
DROP POLICY IF EXISTS "subitem_monthly_reports_允许公开写入" ON subitem_monthly_reports;
DROP POLICY IF EXISTS "subitem_monthly_reports_允许公开读取" ON subitem_monthly_reports;

-- subitem_monthly_progress（月度结算）
ALTER TABLE subitem_monthly_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subitem_monthly_progress_允许公开删除" ON subitem_monthly_progress;
DROP POLICY IF EXISTS "subitem_monthly_progress_允许公开更新" ON subitem_monthly_progress;
DROP POLICY IF EXISTS "subitem_monthly_progress_允许公开写入" ON subitem_monthly_progress;
DROP POLICY IF EXISTS "subitem_monthly_progress_允许公开读取" ON subitem_monthly_progress;

-- certificates（证件：含身份证、银行卡照片）
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "certificates_允许公开删除" ON certificates;
DROP POLICY IF EXISTS "certificates_允许公开更新" ON certificates;
DROP POLICY IF EXISTS "certificates_允许公开写入" ON certificates;
DROP POLICY IF EXISTS "certificates_允许公开读取" ON certificates;
