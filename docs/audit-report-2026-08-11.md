# 建筑劳务管理系统 — 深度全方位审查报告

- **审查日期**：2026-08-11
- **审查范围**：全系统（安全 / 数据一致性 / 架构 / 前端质量 / 性能）
- **审查方式**：3 路并行只读代码审查 + 历史修复追溯
- **代码基线**：master @ 8257d3e

---

## 一、总体结论

系统主体架构（Next.js 16 + Supabase + 多端集成）运行稳定，**工资"已发"口径已与发放记录表严格对齐**、删除守卫/越权修复/导入幂等等上一轮问题已闭环。

本轮发现 **11 个高危 / 14 个中危 / 12 个低危** 问题，主要集中在：
1. **认证链路存在绕过面**（middleware 放行无效 token + 关键路由无内部鉴权）——**最优先修复**
2. **多处统计口径不一致**（供应商应付、甲方收入、付款率基数、未付容差）
3. **核心表无建表迁移**（架构缺口，新环境无法复现库结构）
4. **一处数据丢失 bug**（编辑供应商合同会清空 4 个字段）

---

## 二、高危问题（11 项）

### 安全类（6 项）

| # | 问题 | 位置 | 修复建议 |
|---|------|------|---------|
| S1 | **认证绕过**：middleware 对无效 token 仅删 cookie 后放行，以下路由**无内部鉴权**：dashboard 经营数据、salary-payments/batch 伪造发放、reports 月度报表导出、ai/config PUT 篡改 AI 配置、projects GET 全量 | middleware.ts:195-201；dashboard/route.ts:31 等 | middleware 对无效 token 的 API 请求直接 401；关键路由内部强制 requireAuth/requirePermission |
| S2 | **x-user-role 请求头可伪造**：knowledge/sync、refresh 仅信请求头判断管理员 → 未认证者可把含身份证/工资的全量数据同步到外部 Coze 知识库 | ai/knowledge/sync/route.ts:15、refresh/route.ts:16 | 改用 requirePermission(request,'system:ai_manage')；cron 密钥常量时间比对 |
| S3 | **IDOR**：managed-projects 按 body 的 user_id 任意改他人项目（可把自己加入全部项目）| auth/center/users/managed-projects/route.ts:52 | 校验操作者是否超管或目标用户本人 |
| S4 | **logout 不失效 token**：JWT 7 天有效，URL/Authorization 渠道无法失效 | auth/logout/route.ts:4 | jti 黑名单或短时 token |
| S5 | **通知检查接口公开**：可反复触发扫描轰炸钉钉群、生成日报 | api/notifications/check/route.ts:603 | 要求定时任务密钥 |
| S6 | **越权读取**：knowledge GET 读全部文档内容（含同步的工资/证件数据）；certificates GET 读全部证件 | ai/knowledge/route.ts:10、certificates/route.ts:27 | 按角色/项目过滤 |

### 数据一致类（3 项）

| # | 问题 | 位置 | 修复建议 |
|---|------|------|---------|
| D1 | **供应商应付/未付口径三套并存**：台账用 Σsettlement_amount，结算汇总/看板用 Σpayable_amount（进度结算时差 20%）| supplier-contracts/account/route.ts:244-269 vs account-dashboard/route.ts:68 | 统一以 payable_amount 为应付口径，同步三处 |
| D2 | **首页供应商成本表源不一致**：KPI 查老表 settlements（无作废过滤），项目对比图查新表 supplier_settlements（有过滤）| dashboard/route.ts:467-482 vs :673 | KPI 统一走 data-aggregation |
| D3 | **甲方收入口径三处不同**：invoice\|\|settlement\|\|report（有 fallback）vs 无 fallback vs 只用 invoice | data-aggregation.ts:267 vs business-logic.ts:407-423 vs dashboard:591-593 | 统一 fallback 顺序，回款校验复用汇总层 |

### 架构/代码类（2 项）

| # | 问题 | 位置 | 修复建议 |
|---|------|------|---------|
| A1 | **核心表无建表迁移**：workers/projects/suppliers/users/settlements/payments/worker_salaries 等 14+ 表无 CREATE TABLE 迁移，新环境无法复现库结构 | schema.ts（定义）vs migrations/（缺失）| 补齐基线建表迁移并纳入 apply_all_pending |
| A2 | **编辑合同清空字段**：编辑时 sign_date/expire_date/supply_content/remark 被重置为空并写库（数据丢失）| supplier-contracts/page.tsx:177-194 + [id]/route.ts:133-141 | 编辑回填原值；PUT 改 PATCH 语义空值不覆盖 |

---

## 三、中危问题（14 项）

### 数据一致（5 项）

| # | 问题 | 位置 |
|---|------|------|
| D4 | 老表+新表直接相加无去重（数据迁移后重复计）| reports/monthly/summary:237-321、account:219-231 |
| D5 | 供应商付款两入口校验不一致：一处绕过余额/作废校验 | supplier-payments/route.ts:45 vs supplier-contracts/payments:139 |
| D6 | 工人"未付"容差不一致：≤1 元工资页"已结清"、成本页"有未付" | workers/query:266 vs worker-cost:186 |
| D7 | 无工资单的独立发放：worker-salaries 汇总偏低（成本页计入）| worker-salaries:215-224 vs worker-cost:184 |
| D8 | 应收双算法：按比例应收 vs 实际应收，两页面数字不同 | cost-center:175 vs data-aggregation:420 |

### 安全（3 项）

| # | 问题 | 位置 |
|---|------|------|
| S7 | 通知配置 PATCH/PUT/DELETE 仅需 notifications:view 权限（过宽）| route-permissions.ts:355-362 |
| S8 | Cookie 未设 Secure（HTTPS 下可被 HTTP 携带）| auth.ts:148 |
| S9 | 知识库上传文件名未净化（OSS key 可含 ../）| ai/knowledge/upload:135 |

### 架构/代码（6 项）

| # | 问题 | 位置 |
|---|------|------|
| A3 | **全量拉取 + 无分页**：workers/salaries/payments/settlements 等 GET 无 limit；worker-cost 一次并发拉 4 个全量表 | workers/route.ts 等 + worker-cost/page:101 |
| A4 | **getAccessibleProjectIds 三处重复定义**：workers/worker-salaries 内联副本不查 user_project_roles（走项目角色授权的用户查不到数据）| api-project-access.ts:47 vs workers/route.ts:51 |
| A5 | O(n²) 渲染：工资表每行 filter+sort 找上月工资 | workers/salaries/page.tsx:935 |
| A6 | 供应商页 4 处 catch {} 静默吞错 | suppliers/page.tsx:147-199 |
| A7 | 硬编码 roleId: 1（super_admin 魔数）| auth/me/route.ts:72 |
| A8 | .env.example 与实际环境变量不一致（INIT_SECRET/WPS_WORKER_SYNC_TOKEN 等缺失）| .env.example |

---

## 四、低危问题（12 项）

| # | 问题 | 位置 |
|---|------|------|
| L1 | 错误信息回显可能泄露表结构 | api-utils.ts:110-114 |
| L2 | cost-center 供应商成本老表/新表两接口 | cost-center/composition:122 vs cost-center:163 |
| L3 | dashboard fallback 收入口径与主口径不一致 | dashboard:701 |
| L4 | 在岗人数口径：in_service/空 vs status!=='left'（archived 计入）| worker-cost:168 vs data-aggregation:500 |
| L5 | 应收≥100万阈值硬编码 | business-analysis:155 |
| L6 | 付款比例默认值前后端重复 | supplier-contracts:96/156 |
| L7 | 全库 :any 673 处（类型安全）| 全局 |
| L8 | 金额显示缺 Number.isFinite 兜底（"NaN万"）| payments/page:87 |
| L9 | URL ?token= 传参进日志/Referer | auth.ts:195-215 |
| L10 | preferInput 死代码 | wps-worker-sync.ts:299 |
| L11 | fileExists 回退分支恒 false | oss-storage.ts:250-254 |
| L12 | Excel 日期序列号时区偏移（±1 天）| settlements/import |

---

## 五、修复优先级建议

**P0（立即，安全底线）**：S1 认证绕过 → S2 知识库越权同步 → S3 IDOR → S5 通知轰炸
**P1（本周）**：D1/D2/D3 口径统一 → A1 建表迁移 → A2 合同字段清空 → S4/S6 越权读取 → A4 权限函数统一
**P2（本月）**：D4-D8 剩余口径 → A3 分页 → S7-S9 → A5-A8 → 低危项

---

## 六、已确认无问题（审查通过项）

- **SQL 注入**：全部走 Supabase 参数化，无字符串拼接
- **SSRF**：fetch-url 已覆盖 IPv4/IPv6-mapped/DNS rebinding
- **JWT**：jose HS256，生产强制 ≥32 位密钥，无默认密钥
- **上传安全**：类型/大小/路径穿越校验齐全（除 S9 一处文件名）
- **XSS**：dangerouslySetInnerHTML 前均有 escapeHtml
- **工资状态机**：paid/partial/unpaid 判定三处口径一致（含容差）
- **结算状态机**：已审核锁定、作废不可付款守卫齐全
- **删除保护**：工人/供应商/合同删除守卫完整
