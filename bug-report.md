# 建筑劳务管理系统 Bug 深度排查报告

排查时间：2026-07-10
项目路径：E:\project_20260710_163323\projects
源文件数量：306 个

---

## 🔴 1号Bug [致命] — supabase-client.ts 认证头语法崩溃

**文件**：`src/storage/database/supabase-client.ts` 第124行

```typescript
// 当前错误代码：
headers: { Authorization: *** ${token}` },

// 正确代码：
headers: { Authorization: `Bearer ${token}` },
```

**影响**：所有需要认证的API返回401，token中的用户信息（userId/role/permissions）全部丢失。**系统全线崩溃**。

---

## 🔴 2号Bug [致命] — schema.ts apiKey 字段名截断

**文件**：`src/storage/database/shared/schema.ts` 第645行

```typescript
// 当前错误代码：
apiKey: varcha...ey", { length: 500 }),

// 正确代码：
apiKey: varchar("api_key", { length: 500 }),
```

**影响**：`ai_configs` 表迁移失败，AI配置模块不可用。字段名被截断导致列名不匹配。

---

## 🔴 3号Bug [致命] — 所有表没有RLS行级安全

**文件**：`src/storage/database/shared/schema.ts` 全文件

```typescript
// 每个表都设置了公开权限（举例）：
pgPolicy("projects_允许公开删除", { as: "permissive", for: "delete", to: ["public"], using: sql`true` }),
pgPolicy("projects_允许公开更新", { as: "permissive", for: "update", to: ["public"] }),
pgPolicy("projects_允许公开写入", { as: "permissive", for: "insert", to: ["public"] }),
pgPolicy("projects_允许公开读取", { as: "permissive", for: "select", to: ["public"] }),
```

**影响**：任何人只要有Supabase anon key就可以增删改查所有表。**数据安全为零**。所有表(projects/workers/worker_salaries/suppliers/settlements/payments等)全部公开。

**修复方案**：删除所有表的 `pgPolicy` 行，改用 `authenticated` 角色的 RLS 策略。

---

## 🔴 4号Bug [致命] — Supabase客户端从未传递用户Token

**文件**：`src/storage/database/supabase-client.ts` 第101行

```typescript
export function getSupabaseClient(token?: string): SupabaseClient {
  // token参数虽然接受，但所有调用方从未传递！
```

所有API路由调用 `getSupabaseClient()` 时都**不传token**：
```typescript
const client = getSupabaseClient();  // 没有传token！
```

即使修复了 #1 号Bug，Supabase查询仍使用anon key，完全绕过RLS。

**修复方案**：每个API路由调用 `getSupabaseClient(userToken)` 传递当前用户token。

---

## 🟠 5号Bug [高危] — 数据权限过滤逻辑旁路

**文件**：
- `src/app/api/worker-salaries/route.ts` 第152-155行
- `src/app/api/workers/route.ts` 第101-103行
- `src/app/api/projects/route.ts` 第69-70行

```typescript
// worker-salaries/route.ts
if (accessibleProjects.length > 0) {
  filteredData = filteredData.filter((record: any) => accessibleProjects.includes(record.project_id));
}
```

当用户没有分配任何项目时，`getAccessibleProjectIds()` 返回空数组 `[]`，条件 `length > 0` 为false，**跳过所有过滤**，用户可以看到**所有项目**的数据。

**修复方案**：当 `accessibleProjects` 为空数组时返回 `[]` 空结果（除非是超级管理员）。

---

## 🟠 6号Bug [高危] — API响应格式不一致

**文件**：全库API路由

返回格式不统一，部分路由使用 `apiSuccess/apiError` 工具函数，部分路由直接返回原始 `NextResponse.json`。

- `api-utils.ts` 定义统一格式：`{ success, data, error, code }`
- `worker-salaries/route.ts` 返回：`{ salaries, totalGrossPay, ... }`（无 success/data 包裹）
- `workers/route.ts` 返回：`{ workers: [...] }`
- `projects/route.ts` 返回：`{ projects: [...] }`

**影响**：前端调用API时统一解析方式可能出错，前端需要在不同格式间切换。

---

## 🟠 7号Bug [高危] — Zod版本不兼容 + 未使用输入验证

**文件**：`package.json` 第73行

```json
"zod": "^4.3.5"
```

**问题1**：Zod v4 和 v3 API 完全不兼容（v4改用 `.pipe()` 替代 `.refine()`，`.object()` 用法改变）。shadcn/ui的 `@hookform/resolvers` 可能依赖zod v3，导致运行时崩溃。

**问题2**：全项目没有一行 z.object().parse() 输入验证代码。所有POST/PUT请求体直接 `body = await request.json()` 后直接使用，没有类型验证和错误信息提示。

---

## 🟡 8号Bug [中危] — worker_assignments 表未定义但被引用

**文件**：`src/app/api/workers/route.ts` 第172-177行

```typescript
await client.from('worker_assignments').upsert({
  worker_id: worker.id,
  project_id: project_id,
  start_date: entry_date || null,
  status: 'active',
}, { onConflict: 'worker_id,project_id' });
```

`worker_assignments` 表在 `schema.ts` 中不存在，如果表在Supabase中未手动创建，创建工人时**会抛出数据库错误**。

---

## 🟡 9号Bug [中危] — 批量更新未校验用户权限

**文件**：`src/app/api/worker-salaries/batch-update/route.ts` 第4-70行

```typescript
export async function POST(request: NextRequest) {
  // 没有校验用户是否有权限修改工资记录
  // 没有调用 getCurrentUser() 或 getAccessibleProjectIds()
  // 直接更新数据库
```

**影响**：任何登录用户都可以批量修改任何项目的工资数据，没有项目权限检查。

---

## 🟡 10号Bug [中危] — api-utils.ts 中的 verifySession 函数失效

**文件**：`src/lib/api-utils.ts` 第51-64行

```typescript
export async function verifySession(request: Request): Promise<string | null> {
  const sessionToken = request.headers.get('x-session');
  if (!sessionToken) return null;
  ...
  const { data, error } = await supabase.auth.getUser(sessionToken);
```

`getCurrentUser()` 用 JWT 而非 Supabase session，前端也没有发送 `x-session` header。这个函数从未被调用，是无用代码。

---

## 🟡 11号Bug [中危] — 前端大量使用 `any` 类型

全库大量使用 `as any` 类型断言，`strict: true` 的 TypeScript 配置被完全绕开：

- `src/app/api/worker-salaries/route.ts`：17个 `as any` / `any` 使用
- `src/app/api/workers/route.ts`：9个 `any` 使用
- TypeScript 编译检查虽然能通过（`skipLibCheck: true`），但实际类型安全性为零

---

## 🟡 12号Bug [中危] — Layout中全局包裹 SidebarLayout 和 RouteGuard

**文件**：`src/app/layout.tsx`

```typescript
<PermissionProvider>
  <SidebarLayout>
    <RouteGuard>{children}</RouteGuard>
  </SidebarLayout>
</PermissionProvider>
```

- 登录页面 `/login` 也被包裹了 SidebarLayout，导致登录页异常渲染布局组件
- `<RouteGuard>` 在所有页面执行权限检查，可能在没有token时阻止访问登录页

---

## 🟡 13号Bug [中危] — 工作台页面权限码 'dashboard:view' 和 'ai:chat' 未定义

**文件**：`src/app/workspace/page.tsx` 第11-13行

```typescript
{ key: 'dashboard', label: '业务工作台', ..., permission: 'dashboard:view' },
{ key: 'ai-assistant', label: 'AI 劳务助手', ..., permission: 'ai:chat' },
```

`dashboard:view` 和 `ai:chat` 权限码在 `ROUTE_PERMISSIONS` 映射中不存在，前端 TabContainer 可能有条件渲染但不会报错。

---

## 🟢 14号Bug [低危] — Package.json 缺少 @types/xlsx 定义

**文件**：`package.json`

多处使用 `require('xlsx')`（CommonJS风格），但 `xlsx` 的 TypeScript 定义可能不完整。

---

## 🟢 15号Bug [低危] — Dashboard路由881行过于臃肿

**文件**：`src/app/api/dashboard/route.ts` — 881行

一个API路由包含所有业务逻辑（工人统计、工程量、报量、付款、签证、证件、成本计算、趋势数据）。应该拆分为多个独立的查询函数。

---

## 总结

| 严重级别 | 数量 | 说明 |
|---------|------|------|
| 🔴 致命 | 4 | 系统无法正常运行 |
| 🟠 高危 | 3 | 安全漏洞/功能异常 |
| 🟡 中危 | 6 | 逻辑缺陷/维护问题 |
| 🟢 低危 | 2 | 代码质量问题 |
| **合计** | **15** | **需要优先解决致命Bug** |
