# 核心指标口径说明（唯一事实来源）

> 目的：同一个指标只允许一种算法。改口径先改本文档和 `src/lib/metrics.ts`，再改调用点。
> 最后更新：2026-11-02

## 一、状态口径

| 概念 | 判定 | 代码位置 |
|---|---|---|
| 已审核 | `isReviewedStatus`（兼容英文 reviewed/approved/completed 与中文"已审核/已提交"） | `src/lib/review-status.ts` |
| 已作废 | `isVoidedStatus`（voided/作废） | `src/lib/review-status.ts` |
| 参与统计 | 非作废，且（已审核 或 状态为空） | `isIncludedInStats`（`src/lib/metrics.ts`） |
| SQL 过滤"已审核且容忍 NULL" | `.or('status.is.null,status.eq.reviewed')` | `REVIEWED_STATUS_OR_NULL` |
| 工人在场 | 空状态 / in_service / active / 在场 / 在岗 / 正常 | `isActiveWorkerStatus` |
| 工人退场 | left / resigned / 退场 / 离职 | `isLeftWorkerStatus` |
| 项目在建 | 非「已完成/已完工/竣工结算/已归档」 | `isActiveProjectStatus` |

**刚性规则**：
1. 禁止在 SQL 里写裸 `.neq('status', ...)`（NULL 行会被排除）——`pnpm check:guards` 会拦截。
2. 禁止写 `.eq('status','reviewed')`——会漏历史中文状态与 NULL。

## 二、金额口径

| 指标 | 算法 | 说明 |
|---|---|---|
| **累计产值** | 甲方报量中「已审核」记录的**开票金额**（`invoice_amount`）合计 | 统一走 `getReportRevenue`（`src/lib/revenue.ts`）。草稿不计入 |
| **累计回款** | 甲方回款中「已完成/已审核」记录的付款金额合计 | `isEffectiveSupplierPaymentStatus` |
| **应收未收** | 按项目付款比例计算的应收 − 已收 | 月报/成本中心 |
| **供应商应付** | 该合同**已审核结算单**的累计应付款 | 结算单按合同累计，只认已审核 |
| **供应商已付** | 供应商付款记录（有效状态）合计 | 老表 `payments` 会合并计入 |
| **班组结算成本** | 已审核（reviewed/confirmed）的班组结算单**实付金额** | 实付 = 分项合计 − 四项扣款 |
| **工资应发** | 各月 `gross_pay` 合计 | `sumSalaryGross` |
| **工资实发** | 各月 `net_pay` 合计 | `sumSalaryNet` |
| **工资已发** | `salary_payments` 发放记录合计（按工资单 ID 归集） | |
| **工资未发** | 实发 − 已发（跨月汇总，历史欠发不丢） | 月报口径 |
| **资金缺口** | 应付未付 + 工资未发 − 应收未收 | 首页/经营总览 |

## 三、"录入即生效"的模块（没有审核环节）

| 模块 | 写入时状态 |
|---|---|
| 甲方报量 | reviewed |
| 甲方回款 | completed |
| 综合费用 | reviewed |
| 零星材料 | reviewed |
| 供应商结算 | reviewed（审核按钮已移除） |

这些模块**不要**再引入"草稿"概念，否则统计会归零（历史事故：报量默认 draft 导致产值恒为 0）。

## 四、有审批流的模块

| 模块 | 状态机 |
|---|---|
| 班组结算 | draft → pending → reviewed / rejected；通过时才生成分账工资并计入成本 |
| 月报 | draft → pending_manager（项目经理补充）→ pending_boss（老板审批）→ approved / rejected |
| 签证 | 提交 → 项目经理办理 → 预算审核 → 老板审批 → 完成 |

**审批人规则**：指定了审批人就只认该人；未指定才回退项目负责人/老板。提交人本人不能审批自己提交的单据。

## 五、数据完整性要求

1. 统计接口一律分页取全量（`fetchAllRows`），单次查询上限 1000 行。
2. 金额为字符串/带单位时用 `parseNumeric` 统一解析。
3. 关键写操作失败要回滚或拒绝（如审批通过前先生成工资）。
4. 删除前检查引用（项目删除 13 张表预检）。

## 六、相关文档

- 数据体检：系统管理 → 数据健康（重复/孤儿/空状态/金额异常）
- 数据备份：系统管理 → 数据备份（每日全量导出到 OSS）
- 安全检查：系统管理 → 安全加固
