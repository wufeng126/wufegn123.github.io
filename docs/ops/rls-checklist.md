# 数据库 RLS（行级安全）检查清单

> 目的：即使 anon key 泄露，也无法绕过系统接口直接读全库。
> 适用：Supabase / Coze 托管 Postgres（`*.aidap-global.cn-beijing.volces.com`）

## 一、先查现状（只读，安全）

在数据库 SQL 控制台执行：

```sql
-- 1) 哪些表没开 RLS
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY rowsecurity, tablename;

-- 2) 哪些表有 RLS 但没有策略（等于"谁都读不到"，可能造成线上异常）
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       COUNT(p.polname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public' AND c.relkind = 'r'
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relrowsecurity, policy_count;
```

**判读**：

| rowsecurity | policy_count | 含义 |
|---|---|---|
| false | - | ❌ 未启用 RLS（风险） |
| true | 0 | ⚠️ 启用但无策略 → 匿名/普通角色读不到（系统用的是 service_role，通常不受影响） |
| true | >0 | ✅ 已配置策略 |

## 二、启用 RLS 的安全顺序

> ⚠️ 系统后端使用 **service_role**，service_role 会**绕过 RLS**，因此开启 RLS 不会影响现有接口。
> 但仍建议先在测试库验证。

```sql
-- 对业务表逐张开启（示例，按实际表名补全）
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_salaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_settlement_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_settlement_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE miscellaneous_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_report_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_report_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE labor_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_voucher_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
```

**不要**给 `anon` / `authenticated` 授予任何业务表策略（系统通过后端 service_role 访问）。

## 三、验证步骤

```sql
-- 确认已开启
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname='public' AND tablename IN ('workers','worker_salaries','salary_payments','client_reports','supplier_payments');
```

然后：

1. 浏览器正常登录，打开花名册/工资/报量/结算 → 均能正常加载
2. 用 anon key 直接请求 REST（Postman/Supabase SDK）查询 `workers` → 应返回空或 401（不是全量数据）

## 四、风险与回滚

| 风险 | 处理 |
|---|---|
| 某接口用的是 anon/普通角色连接（非 service_role） | 开启后会读不到数据 → 用上面的查询确认后端连接角色；如有异常，`ALTER TABLE x DISABLE ROW LEVEL SECURITY` 回滚 |
| 视图/存储过程依赖表权限 | 同样先测试库验证 |
| RLS 策略写错导致误拦 | 保持"无策略"即可（只允许 service_role），不要加宽松策略 |

## 五、检查频率

- 新增表后：确认 `rowsecurity = true`
- 每季度：跑一次第一节的两条查询
- 备份/恢复后：确认 RLS 状态未被重置
