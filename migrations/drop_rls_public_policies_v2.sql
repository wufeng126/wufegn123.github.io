-- ============================================================
-- RLS 覆盖补全（v2）
--
-- ⚠️⚠️ 重要：本迁移执行后，列出的表将启用 RLS 且无任何 public 策略，
-- anon key 将无法访问这些表。执行前必须确保部署环境已配置
-- COZE_SUPABASE_SERVICE_ROLE_KEY（应用使用 service_role 直连，不受影响）。
-- 若应用仍在使用 anon key 回退，执行本迁移会导致相关功能不可用！
-- ============================================================

-- 1. 删除建表迁移遗留的 public 全开放策略（构造风险事件、施工日志进度）
DROP POLICY IF EXISTS construction_risk_events_public_select ON construction_risk_events;
DROP POLICY IF EXISTS construction_risk_events_public_insert ON construction_risk_events;
DROP POLICY IF EXISTS construction_risk_events_public_update ON construction_risk_events;
DROP POLICY IF EXISTS construction_risk_events_public_delete ON construction_risk_events;

DROP POLICY IF EXISTS construction_log_progress_entries_public_select ON construction_log_progress_entries;
DROP POLICY IF EXISTS construction_log_progress_entries_public_insert ON construction_log_progress_entries;
DROP POLICY IF EXISTS construction_log_progress_entries_public_update ON construction_log_progress_entries;
DROP POLICY IF EXISTS construction_log_progress_entries_public_delete ON construction_log_progress_entries;

-- 2. 为业务敏感表启用 RLS（无策略 = anon 完全拒绝；service_role 绕过 RLS 正常访问）
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_type_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE construction_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE construction_log_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE construction_risk_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE construction_log_progress_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE visas ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_settlement_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE comprehensive_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE miscellaneous_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE limit_prices ENABLE ROW LEVEL SECURITY;

-- 3. 刷新 PostgREST schema 缓存
NOTIFY pgrst, 'reload schema';
