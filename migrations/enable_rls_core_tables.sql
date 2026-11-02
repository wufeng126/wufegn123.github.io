-- ============================================================
-- 开启核心业务表的行级安全（RLS）
--
-- 目的：即使 SUPABASE anon key 泄露，也无法通过 REST 直接读/写业务数据。
-- 前提：应用服务端使用 SERVICE_ROLE key（会绕过 RLS），本仓库的
--       src/storage/database/supabase-client.ts 已优先使用 SERVICE_ROLE_KEY。
--
-- ⚠️ 执行前必须确认部署环境已配置 COZE_SUPABASE_SERVICE_ROLE_KEY（或 SUPABASE_SERVICE_ROLE_KEY），
--    否则应用会因拿不到数据而整体报错。
--
-- 本脚本只开启 RLS、不创建任何策略 → anon/authenticated 角色被默认拒绝（deny all）。
-- 如需给直连客户端放行，请另行按表编写最小策略。
--
-- 回滚：ALTER TABLE <表名> DISABLE ROW LEVEL SECURITY;
-- ============================================================

ALTER TABLE projects                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE persons                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_assignments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_salaries            ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_payments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_groups                ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_settlements           ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_settlement_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_settlement_splits     ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_settlement_payments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_reports             ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_payments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE visas                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_contracts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_settlements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE comprehensive_expenses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE miscellaneous_materials    ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_items                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_item_subitems         ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_item_progress         ENABLE ROW LEVEL SECURITY;
ALTER TABLE subitem_monthly_reports    ENABLE ROW LEVEL SECURITY;
ALTER TABLE subitem_monthly_progress   ENABLE ROW LEVEL SECURITY;
ALTER TABLE construction_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE construction_log_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE construction_daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE living_allowance_records   ENABLE ROW LEVEL SECURITY;
ALTER TABLE living_allowance_receipts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE living_allowance_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_report_workflows    ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_project_roles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications              ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates                ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_configs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_knowledge_docs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE dingtalk_bindings          ENABLE ROW LEVEL SECURITY;

-- 校验：以下查询应列出全部表且 rls_enabled = true
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
