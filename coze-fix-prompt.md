你必须修复一个 Next.js + Supabase 建筑劳务管理系统。以下是深度代码排查发现的15个Bug，请逐一修复。

系统技术栈：Next.js 16 + Supabase + Drizzle ORM + shadcn/ui + zod^4.3.5 + jose(JWT)

---

## 🔴 Bug 1 [致命] — supabase-client.ts 认证头语法错误

**文件路径**：src/storage/database/supabase-client.ts
**当前代码**（第124行附近）：
```typescript
return createClient(url, anonKey, {
  global: {
    headers: { Authorization: *** ${token}` },
  },
```
**修复要求**：将第123-125行改为正确语法 `Authorization: \`Bearer ${token}\``。`***` 应改为 `Bearer`，且模板字符串的语法要正确闭合。

---

## 🔴 Bug 2 [致命] — schema.ts apiKey 字段名截断

**文件路径**：src/storage/database/shared/schema.ts
**当前代码**（第645行）：
```typescript
apiKey: varcha...ey", { length: 500 }),
```
**修复要求**：改为 `apiKey: varchar("api_key", { length: 500 }),`

---

## 🔴 Bug 3 [致命] — 所有表缺少RLS行级安全（数据安全漏洞）

**文件路径**：src/storage/database/shared/schema.ts（全文件）
**当前代码**：每个表最后都有4行 pgPolicy，允许公开public角色进行select/insert/update/delete
```typescript
pgPolicy("xxx_允许公开删除", { as: "permissive", for: "delete", to: ["public"], using: sql`true` }),
pgPolicy("xxx_允许公开更新", { as: "permissive", for: "update", to: ["public"] }),
pgPolicy("xxx_允许公开写入", { as: "permissive", for: "insert", to: ["public"] }),
pgPolicy("xxx_允许公开读取", { as: "permissive", for: "select", to: ["public"] }),
```
**修复要求**：
1. 删除所有表的这些 pgPolicy 行（约20个表，每个表4行）
2. 在迁移SQL中添加真正的RLS策略：
   - 所有已认证用户可读
   - 只有超级管理员可写（或根据用户角色的project_id权限控制）
3. 在drizzle migration中添加 `alter table xxx enable row level security;`

---

## 🔴 Bug 4 [致命] — Supabase客户端从不传递用户Token

**文件路径**：src/storage/database/supabase-client.ts
**分析**：`getSupabaseClient(token?: string)` 函数接受token参数，但所有API路由中调用时都不传token。
**修复要求**：
1. 在所有API路由中，从 `getCurrentUser()` 或 `request.headers` 获取用户token
2. 调用 `getSupabaseClient(userToken)` 传递token
3. 确保每个路由都经过认证后再执行数据库操作

---

## 🟠 Bug 5 [高危] — 项目权限过滤逻辑旁路

**文件中存在此问题的路由**：
- src/app/api/worker-salaries/route.ts（第152-155行）
- src/app/api/workers/route.ts（第101-103行）
- src/app/api/projects/route.ts（第69-70行）

**当前代码**：
```typescript
if (accessibleProjects.length > 0) {
  filteredData = filteredData.filter((record: any) => accessibleProjects.includes(record.project_id));
}
```
**修复要求**：
- 当用户不是 super_admin 且 `accessibleProjects` 为空数组时，应该返回空结果 `[]`
- 当用户是 super_admin 时，不过滤（显示所有数据）
- 提取 `getAccessibleProjectIds` 为公共工具函数，避免代码重复

---

## 🟠 Bug 6 [高危] — API响应格式不一致

**文件路径**：全库所有API路由
**当前问题**：部分路由使用 `apiSuccess/apiError` 格式 `{success, data, error, code}`，部分路由返回原始格式如 `{salaries: [...], totalGrossPay: ...}` 或 `{workers: [...]}`。
**修复要求**：
1. 统一所有API路由的响应格式
2. GET列表路由：`{ success: true, data: [...], error: null, code: 'OK' }`
3. POST/PUT/DELETE：`{ success: true, data: {...}, error: null, code: 'OK' }`
4. 错误响应：`{ success: false, data: null, error: '错误信息', code: 'ERROR_CODE' }`
5. 让前端fetch拦截器可以统一解析

---

## 🟠 Bug 7 [高危] — Zod版本不兼容 + 缺乏输入验证

**文件路径**：package.json（版本号）、所有POST/PUT路由

**当前问题**：
1. zod@4.3.5 与 shadcn/ui 的 @hookform/resolvers 不兼容（zod v4是重写版本）
2. 所有API路由的POST/PUT请求体没有任何输入验证

**修复要求**：
1. 将 zod 降级到 `^3.24.0`（与 @hookform/resolvers/zod 兼容版本）
2. 至少为关键API创建输入验证schema：
   - 工人创建：`z.object({ name: z.string().min(1).max(100), ... })`
   - 工资批量导入：`z.object({ worker_id: z.number(), year_month: z.string().regex(...), ... })`
   - 项目创建：`z.object({ name: z.string().min(1), year: z.number(), ... })`
3. 在每个POST/PUT路由中调用 `.parse()` 进行验证

---

## 🟡 Bug 8 [中危] — worker_assignments 表未定义

**文件路径**：src/app/api/workers/route.ts（第172行）
**当前代码**：
```typescript
await client.from('worker_assignments').upsert(...)
```
**修复要求**：
- 在 schema.ts 中补充 `worker_assignments` 表定义，包含字段：`id, worker_id, project_id, start_date, end_date, status, created_at`
- 或者在创建/更新工人时直接更新 workers 表的 project_id，不再单独操作 worker_assignments 表

---

## 🟡 Bug 9 [中危] — batch-update 路由缺少权限校验

**文件路径**：src/app/api/worker-salaries/batch-update/route.ts
**当前问题**：没有调用 `getCurrentUser()` 或 `getAccessibleProjectIds()`，任何用户都可批量修改工资
**修复要求**：
- 在函数开头添加权限校验：获取当前用户和可访问项目列表
- 验证要修改的记录是否都在用户权限范围内

---

## 🟡 Bug 10 [中危] — api-utils.ts 中的 verifySession 函数无用

**文件路径**：src/lib/api-utils.ts（第51-64行）
**修复要求**：删除此函数及其相关代码，或将其改为实际可用的工具函数。

---

## 🟡 Bug 11 [中危] — 大量 `any` 类型绕开 TypeScript 严格模式

**修复要求**：为 API 响应、数据库行等创建 TypeScript 接口，替换 `as any`、`any` 类型。例如：
- `WorkerSalaryRow` 接口
- `WorkerRow` 接口
- `ProjectRow` 接口

---

## 🟡 Bug 12 [中危] — 登录页面被 SidebarLayout 和 RouteGuard 包裹

**文件路径**：src/app/layout.tsx（第28-35行）
**当前问题**：`<SidebarLayout>` 和 `<RouteGuard>` 包裹了所有子页面包括登录页
**修复要求**：
- 在 layout.tsx 中添加条件判断：当 pathname === '/login' 时不渲染 SidebarLayout
- 或者创建一个独立的 login layout

---

## 🟡 Bug 13 [中危] — 工作台权限码未在路由权限映射中注册

**文件路径**：src/app/workspace/page.tsx（第11-13行）
**当前问题**：`dashboard:view`、`ai:chat` 权限码在 `ROUTE_PERMISSIONS` 中不存在
**修复要求**：在 `src/lib/route-permissions.ts` 的 `ROUTE_PERMISSIONS` 中添加：
```
'/workspace': { permission: 'projects:view' },
```

---

## 🟢 Bug 14 [低危] — Package.json 缺少 xlsx 类型定义

**修复要求**：在 devDependencies 中添加 `@types/xlsx` 或使用 `import * as XLSX from 'xlsx'` 替代 `require('xlsx')`

---

## 🟢 Bug 15 [低危] — Dashboard路由过于臃肿

**文件路径**：src/app/api/dashboard/route.ts（881行）
**修复要求**：将查询逻辑拆分为独立函数：
- `getProjectStats()`
- `getWorkerStats()`
- `getClientReportAndPayment()`
- `getCostData()`
- `getCertificateStats()`

然后 GET handler 组合这些函数的结果。

---

## 修复优先级

1. **立即修复**[Bug 1, 2, 4] → 系统核心功能不可用
2. **及时修复**[Bug 3, 5, 7] → 安全漏洞
3. **后续修复**[Bug 6, 8, 9, 12] → 功能完整性
4. **优化修复**[Bug 10, 11, 13, 14, 15] → 代码质量
