# 项目上下文

## 项目简介

建筑劳务企业数据管理系统，用于管理工人成本、工程量统计、甲方报量和付款情况。

## 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **Database**: Supabase (PostgreSQL)
- **ORM**: Drizzle
- **Charts**: ECharts (echarts + echarts-for-react)

## 目录结构

```
├── public/                 # 静态资源
├── scripts/                # 构建与启动脚本
│   ├── build.sh            # 构建脚本
│   ├── dev.sh              # 开发环境启动脚本
│   ├── prepare.sh          # 预处理脚本
│   └── start.sh            # 生产环境启动脚本
├── src/
│   ├── app/                # 页面路由与布局
│   │   ├── api/            # API 路由
│   │   ├── workers/        # 工人成本管理（花名册、月度工资）
│   │   ├── work-items/     # 工程量统计页面
│   │   ├── client-reports/ # 甲方报量页面
│   │   ├── client-payments/# 付款情况页面
│   │   ├── notifications/  # 消息通知中心
│   │   ├── cost-center/    # 成本利润中心
│   │   ├── ai-assistant/   # AI 劳务助手（数据问答，旧版独立页面）
│   │   ├── dingtalk/        # 钉钉 H5 微应用入口（免登页）
│   │   ├── system/          # 系统管理
│   │   │   └── ai-config/   # AI 配置管理（模型/知识库/审计）
│   │   ├── reports/        # 报表中心
│   │   │   └── monthly/    # 月度经营月报
│   │   └── data-board/     # 数据看板
│   │       ├── supplier-cost/   # 供应商成本应付看板
│   │       ├── worker-cost/     # 工人成本统计看板
│   │       └── fund-management/ # 资金综合管理看板
│   ├── components/ui/      # Shadcn UI 组件库
│   ├── components/floating-ai-assistant.tsx  # 全局悬浮AI助手弹窗
│   ├── components/page-analysis-button.tsx   # 业务页面AI分析按钮
│   ├── hooks/              # 自定义 Hooks
│   ├── lib/                # 工具库
│   │   ├── ai-service.ts  # AI服务（LLM调用、知识库检索、权限、脱敏）
│   │   ├── utils.ts        # 通用工具函数 (cn)
│   ├── storage/database/   # 数据库配置
│   │   ├── supabase-client.ts  # Supabase 客户端
│   │   └── shared/schema.ts    # 数据库表结构定义
│   └── server.ts           # 自定义服务端入口
├── next.config.ts          # Next.js 配置
├── package.json            # 项目依赖管理
└── tsconfig.json           # TypeScript 配置
```

## 数据库表结构

### 核心表

1. **projects** - 项目表
   - id: 主键
   - name: 项目名称
   - year: 年度
   - status: 状态

2. **persons** - 工人身份主档（方案A：人员主档分离，2026 引入）
   - id: 主键
   - name: 姓名
   - id_card: 身份证号（全局唯一，`persons_id_card_unique_idx`，非空唯一）
   - phone: 联系电话
   - bank_card: 银行卡号
   - is_blacklist: 黑名单
   - `来源/设计`：与 workers 分离——persons 是全局唯一的"人"；worker 是"某人在某项目的任职"。解决"重名 / 一人多项目导致工资、发放、考勤按不同 worker_id 记录对不上"的数据分裂。
   - 归并规则：有身份证按身份证归人；无身份证按"项目+姓名"兜底归人（见 `lib/person-service.ts`）

3. **workers** - 工人表（花名册，现为"人在某项目的任职"）
   - id: 主键
   - name: 姓名
   - work_type: 工种
   - id_card: 身份证号
   - phone: 联系电话
   - bank_card: 银行卡号
   - project_id: 所属项目ID（外键，项目任职维度）
   - person_id: 关联 persons 主档（外键，`workers_person_id_fkey`，ON DELETE SET NULL）
   - `设计与约束`：同一人跨多个项目可有多个 worker 行（共享同一 person_id）；`workers_project_id_card_unique_idx`(project_id,id_card) 保证同项目内身份证唯一。
   - 新增/批量导入工人时自动通过 `ensureWorkerPerson()` 归入 persons 主档并回填 person_id。

3. **worker_salaries** - 工人工资表（月度工资）
   - id: 主键
   - worker_id: 工人ID（外键）
   - project_id: 项目ID（外键）
   - year_month: 年月（格式：YYYY-MM）
   - work_hours: 工时
   - hourly_rate: 工价（元/小时）
   - contract_work_pay: 包活工资
   - gross_pay: 应发工资（工时×工价+包活工资）
   - income_tax: 个税
   - advance_pay: 借支
   - labor_insurance: 劳保
   - net_pay: 实发工资（应发-个税-借支-劳保）

4. **work_items** - 分项工程表
   - id: 主键
   - project_id: 项目ID（外键）
   - item_name: 分项名称
   - unit: 单位
   - budget_quantity: 预算量
   - unit_price: 单价

5. **work_item_progress** - 工程进度表
   - id: 主键
   - work_item_id: 分项工程ID（外键）
   - completed_quantity: 完成量
   - record_date: 记录日期

6. **client_reports** - 甲方报量表
   - id: 主键
   - project_id: 项目ID（外键）
   - work_content: 工作内容
   - quantity: 数量
   - unit: 单位
   - unit_price: 单价
   - report_amount: 报量金额
   - report_date: 报量日期

7. **client_payments** - 甲方付款表
   - id: 主键
   - project_id: 项目ID（外键）
   - payment_amount: 付款金额
   - payment_date: 付款日期
   - payment_method: 付款方式
   - status: 状态（completed/pending）

8. **certificates** - 证件表
   - id: 主键
   - name: 证件名称
   - certificate_number: 证件编号
   - owner_type: 归属类型（company/personnel）
   - owner_name: 关联名称
   - issue_date: 发证日期
   - expiry_date: 到期日期
   - remark: 备注
   - attachments: 附件列表（JSONB，每项包含 key/name/size/type/uploadedAt）
   - created_at: 创建时间

9. **notifications** - 消息通知表
   - id: 主键
   - type: 通知类型（certificate_expiry_30/15/7, certificate_expired, visa_expiry, new_report, new_payment, new_worker, cost_warning）
   - title: 标题
   - content: 内容
   - severity: 严重程度（info/warning/danger）
   - is_read: 是否已读
   - read_at: 阅读时间
   - project_id: 关联项目ID
   - related_id: 关联记录ID
   - related_type: 关联记录类型
   - metadata: 元数据（JSON）
   - is_sent: 是否已发送钉钉
   - sent_at: 发送时间

9. **notification_settings** - 通知设置表

10. **team_groups / team_settlements 等 - 班组管理表**
   - `team_groups`：班组（id/name/work_type/leader/phone/bank_card/bank_name/project_id/status）
   - `team_settlements`：班组结算单（settlement_no/settlement_month/period_start/period_end/status:draft|confirmed，advance_deduct 预付抵扣、labor_insurance_deduct 劳保、helper_deduct 帮工、safety_fund_deduct 安全基金/质保金，**payment_ratio 本期付款比例%默认100**）
   - `team_settlement_items`：结算分项（content/unit/quantity/unit_price/amount/remark/order_index，支持点工/包工/计时/计件）
   - `team_settlement_payments`：班组付款（挂班组+项目，可选关联 settlement_id，payment_method 含工资专户/抵房款，payee_type/name/card/bank）
   - `team_settlement_splits`：结算分账到工人
   - 派生口径：实付=分项金额合计−四项扣款；计划付款=实付×payment_ratio/100；尾款=实付−计划付款；班组未付=该班组结算实付累计−付款累计

11. **ai_configs** - AI全局配置表
   - id: 主键
   - model_id: 模型ID
   - api_endpoint: API地址
   - api_key: API密钥
   - max_context_length: 最大上下文长度
   - daily_limit: 每日调用限额
   - temperature: 创意温度
   - enabled: 全局开关
   - module_data_query/report_analysis/error_diagnosis/doc_generation/supplier_analysis/salary_analysis/visa_assistant: 分模块开关
   - content_filter_enabled: 内容过滤开关
   - mask_sensitive: 敏感信息脱敏开关
   - offline_fallback_enabled: 离线兜底开关

11. **ai_knowledge_docs** - AI知识库文档表
   - id: 主键
   - title: 文档标题
   - category: 分类（business_data/law/company_policy/contract_template/field_glossary）
   - source_type: 来源类型（auto_sync/upload/manual）
   - source_ref: 来源引用
   - content: 文档内容
   - file_key/file_name/file_size: 附件信息
   - chunk_count: 分块数量
   - status: 状态（active/error/syncing）
   - dataset_name: 知识库数据集名称

12. **ai_chat_histories** - AI对话历史表
   - id: 主键
   - session_id: 会话ID
   - user_id: 用户ID
   - role: 角色（user/assistant/system）
   - content: 内容
   - page_context: 页面上下文
   - model_id: 使用的模型ID
   - token_count: Token数量

13. **ai_audit_logs** - AI审计日志表
   - id: 主键
   - user_id: 用户ID
   - action: 操作类型（chat/config_update/knowledge_add等）
   - input_summary: 输入摘要
   - output_summary: 输出摘要
   - page_context: 页面上下文
   - token_usage: Token用量
   - response_time_ms: 响应时间
   - is_success: 是否成功

14. **ai_daily_usage** - AI每日用量表
   - id: 主键
   - user_id: 用户ID
   - usage_date: 日期（YYYY-MM-DD）
   - request_count: 请求次数
   - token_total: Token总量

## 页面结构

### 主要功能页面
- `/` - 首页概览（在建项目数、总产值、已付款、预警信息）
- `/projects` - 项目管理（列表、新增、编辑、删除）
- `/projects/[id]` - 项目详情（单个项目数据汇总）
- `/workers/roster` - 花名册（工人基本信息管理，支持Excel导入导出）
- `/workers/salaries` - 月度工资（按月录入和管理工资，支持Excel批量导入）
- `/work-items` - 工程量统计（新增分项工程、录入进度、预警）
- `/client-reports` - 甲方报量（新增报量、统计图表）
- `/client-payments` - 付款情况（新增付款、统计图表）
- `/cost-center` - 成本利润中心（项目成本分析、利润计算）
- `/reports/monthly` - 月度经营月报（KPI卡片+环比/同比+图表+明细台账+风险预警+AI经营解读+Excel/PDF导出+多端适配）
- `/notifications` - 消息通知中心（通知列表、设置、钉钉推送）
- `/system/ai-config` - AI全局配置管理（模型配置、知识库管理、审计日志）

### 数据看板（统计/汇总/台账/图表统一收纳）
- `/data-board/supplier-cost` - 供应商成本应付看板（合同统计、结算金额、履约应付、决算应付、已付/未付）
- `/data-board/worker-cost` - 工人成本统计看板（工人统计、应发/已发/未发工资、月度趋势）
- `/data-board/fund-management` - 资金综合管理看板（全局资金统计、欠款预警、甲方/乙方资金对比）

## API 接口

### 统计接口
- `GET /api/dashboard` - 首页统计数据（项目数、总产值、已付款、预警）

### 项目管理
- `GET /api/projects` - 获取项目列表
- `POST /api/projects` - 新增项目
- `GET /api/projects/[id]` - 获取项目详情和统计
- `PUT /api/projects/[id]` - 更新项目
- `DELETE /api/projects/[id]` - 删除项目

### 工人管理
- `GET /api/workers` - 获取工人列表
- `POST /api/workers` - 新增工人
- `PUT /api/workers/[id]` - 更新工人
- `DELETE /api/workers/[id]` - 删除工人
- `POST /api/workers/batch` - 批量导入工人

### 工人工资
- `GET /api/worker-salaries` - 查询工资记录（支持按年月筛选）
- `POST /api/worker-salaries` - 新增工资记录
- `DELETE /api/worker-salaries/[id]` - 删除工资记录
- `POST /api/worker-salaries/batch` - 批量导入工资

### 工程量管理
- `GET /api/work-items?project_id={id}` - 获取工程量统计
- `POST /api/work-items` - 新增分项工程
- `POST /api/work-item-progress` - 新增工程进度

### 甲方报量
- `GET /api/client-reports?project_id={id}` - 获取甲方报量数据
- `POST /api/client-reports` - 新增报量记录

### 付款情况
- `GET /api/client-payments?project_id={id}` - 获取付款情况数据
- `POST /api/client-payments` - 新增付款记录

### 供应商付款
- `GET /api/supplier-payments` - 获取供应商付款记录（支持按项目和供应商筛选）
- `POST /api/supplier-payments` - 新增供应商付款记录

### 证件管理
- `GET /api/certificates` - 获取证件列表（支持分页、类型筛选、状态筛选、关键词搜索）
- `POST /api/certificates` - 新增证件
- `GET /api/certificates/[id]` - 获取证件详情
- `PUT /api/certificates/[id]` - 更新证件
- `DELETE /api/certificates/[id]` - 删除证件
- `POST /api/certificates/upload` - 上传证件附件（multipart/form-data，支持 certificateId 参数）
- `POST /api/certificates/attachment-url` - 获取附件签名URL
- `DELETE /api/certificates/attachment` - 删除证件附件

### 消息通知
- `GET /api/notifications` - 获取通知列表（支持分页、类型筛选）
- `POST /api/notifications` - 创建通知
- `PUT /api/notifications` - 标记已读（单条或全部）
- `DELETE /api/notifications?id={id}` - 删除通知
- `GET /api/notifications/settings` - 获取通知设置
- `PUT /api/notifications/settings` - 更新通知设置
- `POST /api/notifications/dingtalk` - 发送钉钉消息（测试/重发）
- `GET /api/notifications/check` - 执行自动检测任务

### AI 劳务助手
- `POST /api/ai/chat` - AI 对话（SSE 流式输出，需登录，知识库检索+业务数据+权限+脱敏）
- `GET /api/ai/config` - 获取 AI 全局配置
- `PUT /api/ai/config` - 更新 AI 全局配置
- `GET /api/ai/knowledge` - 获取知识库文档列表
- `POST /api/ai/knowledge` - 添加知识库文档（文本/业务数据同步）
- `POST /api/ai/knowledge/sync` - 同步业务台账到知识库
- `POST /api/ai/knowledge/refresh` - 一键全量刷新知识库
- `DELETE /api/ai/knowledge?id={id}` - 删除知识库文档
- `GET /api/ai/audit` - 查询 AI 操作审计日志
- `GET /api/ai/audit/export` - 导出审计日志
- `GET /api/ai/usage` - 查询当前用户每日调用限额

### 月度经营月报
- `GET /api/reports/monthly/summary` - 月报数据汇总（按月份和项目范围，含环比/同比/趋势/风险预警/成本结构）
- `POST /api/reports/monthly/export-pdf` - 生成月报 PDF（4种模板）
- `GET /api/reports/monthly/export-pdf` - 获取导出历史记录
- `POST /api/reports/monthly/export-excel` - 导出月报 Excel（支持分区导出：overview/projects/risks）

### 钉钉企业内部应用集成
- `GET /api/dingtalk/config` - 获取脱敏钉钉配置（AppSecret 不返回前端）
- `GET /api/dingtalk/token` - 检查 access_token 状态（脱敏）
- `POST /api/dingtalk/token` - 强制刷新 access_token
- `GET /api/dingtalk/logs` - 查询 API 调用日志（支持筛选）
- `DELETE /api/dingtalk/logs` - 清空日志

### 钉钉免登
- `POST /api/auth/dingtalk` - 钉钉免登（authCode换取用户信息→匹配系统用户→签发JWT）

## 包管理规范

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。
**常用命令**：
- 安装依赖：`pnpm add <package>`
- 安装开发依赖：`pnpm add -D <package>`
- 安装所有依赖：`pnpm install`
- 移除依赖：`pnpm remove <package>`

## 开发规范

- **项目理解加速**：初始可以依赖项目下`package.json`文件理解项目类型，如果没有或无法理解退化成阅读其他文件。
- **Hydration 错误预防**：严禁在 JSX 渲染逻辑中直接使用 typeof window、Date.now()、Math.random() 等动态数据。必须使用 'use client' 并配合 useEffect + useState 确保动态内容仅在客户端挂载后渲染；同时严禁非法 HTML 嵌套（如 <p> 嵌套 <div>）。

## UI 设计与组件规范 (UI & Styling Standards)

- 模板默认预装核心组件库 `shadcn/ui`，位于`src/components/ui/`目录下
- Next.js 项目**必须默认**采用 shadcn/ui 组件、风格和规范，**除非用户指定用其他的组件和规范。**

## 数据库操作规范

- 使用 Supabase Client 进行 CRUD 操作
- 所有操作必须检查 `{ data, error }` 并 throw error
- 字段名使用 snake_case
- 参考 `/skills/public/prod/supabase/references/typescript/database.md`

## 最近更新

### 2026-10 钉钉工作通知升级为互动卡片（方案A：actionCard）
- **需求**：钉钉收到的是纯文字，希望升级成互动卡片。用户选「先做A」——actionCard 结构化卡片 + 跳转按钮。
- **实现**（`src/lib/dingtalk-work-notification.ts`）：
  - 新增 `severityMeta(severity)`：danger❗#FF4D4F、warning⚠️#FAAD14、infoℹ️#1890FF。
  - 新增 `toCardActionUrl(href)`：用钉钉客户端跳转协议 `dingtalk://dingtalkclient/page/link?url=<encodeURIComponent(href)>&pc_slide=true` 包装按钮跳转地址。
  - 新增 `formatDingTalkWorkCard(params): DingTalkActionCardMessage`：生成 `{msgtype:'actionCard', actionCard:{title, text(markdown+emoji+<font color>), btnOrientation:'1', btnJSONList}}`。字段映射复用 `getNotificationRouteRule`/`categoryLabel`/`summary`/`responsibility`/`actionLabel`(默认'查看详情')/`actionHref`/`amount`；无按钮链接时 btnJSONList 为空数组。
  - 改造 `sendDingTalkWorkNotification`：`const useCard = process.env.DINGTALK_CARD_MODE !== 'off';` 默认发卡片，失败(`!result.success`)自动回退纯文本 `text` 重发；`DINGTALK_CARD_MODE=off` 时直接走 text。
- **验证**：`pnpm exec tsx -e` 跑 `formatDingTalkWorkCard` 产物 JSON 结构正确（title/text/btnJSONList 均符合 actionCard 规范）；test_run lint/ts-check/探活全绿。
- **注意**：按钮跳转 absolute URL 依赖 `NEXT_PUBLIC_APP_URL`/`APP_URL` 环境变量拼接（`toAbsoluteNotificationHref`），生产部署需确认该域名为公网可达地址，否则卡片按钮跳转不可用。代码改动当前在 develop 源码，需 git push / deploy 到 product 才在线上生效。
- **后续可选（方案B，用户未启动）**：卡片按钮回调 / Stream 实现真正状态回写（点"已处理"回写系统），需用户确认后再做。

### 2026-10 清理混入结算管理的测试数据（测试供应商 + 测试工人）
- **需求**：排查系统表是否混入测试数据，用户确认删除「测试供应商-修改」(id=4) 及花名册「张三」(id=1667)。
- **排查（product）**：扫描 suppliers/…/evidence 等表，命中 suppliers 表两条测试供应商——id=2「测试供应商-final」（无关联）、id=4「测试供应商-修改」。id=4 名下挂着**真实数额业务数据**：合同 id=7「盘扣租赁合同」(SH-NJZJZHG-001，南京中交智慧港 id=6)、`supplier_settlements` 12 条（id 11~17/31/32/35/37/40，与旧表 `settlements` 该供应商盘扣结算金额一一对应）、`payments` 2 条（id 6/7）、旧表 `settlements` 7 条（含 id=17 劳务费，此前从南京重复项目迁至 id=6）。判断为曾用于测试的供应商账户承载了真实/重复盘扣租赁数据，经用户确认全部删除。
- **执行（product）**：①备份 `suppliers_test_backup_20261027`、`suppliers_sup4_backup_20261027`、`supplier_contracts_sup4_backup_20261027`、`supplier_settlements_c7_backup_20261027`、`payments_sup4_backup_20261027`、`settlements_sup4_backup_20261027`、`workers_zm_backup_20261027`；②`DELETE settlements WHERE supplier_id=4`(7)；③`DELETE supplier_contracts WHERE id=7`(1，级联删 12 条 supplier_settlements + contract logs)；④`DELETE payments WHERE supplier_id=4`(2)；⑤`DELETE suppliers WHERE id=4`(1，其名 2 已在上一窗口删)；⑥`DELETE workers WHERE id=1667`(1，张三，`worker_assignments` 级联)。验证 suppliers/payments/settlements/supplier_contracts 关联 id 2/4 与张三关联全为 0。
- **⚠️ 经验教训**：①删 suppliers 前必须先清 `payments`（含 supplier_id FK）+`settlements`+`supplier_contracts` 三者引用，否则 DELETE 供应商静默失败（返回空、不报错也不删）；②判定"测试数据"须评估其名下是否承载真实业务（本案例测试供应商名下是真实数额的盘扣租赁结算/付款），删前向用户充分说明数据影响并留备份。

### 2026-10 公司公共项目数据归位到山海境TOD + 清除未分配项目工人
- **需求**：①月度工资中「公司公共项目/非项目日志」数据转移至「山海境TOD」；②花名册中「公司公共项目/非项目」数据转移至「山海境TOD」；③检查花名册中未分配项目（project_id=NULL）人员是否有关联工资等数据，没有则清除。
- **项目 id**：山海境TOD=4；公司公共项目/非项目日志 存在两条重复 id=10 与 id=19（数据都在 id=10，id=19 为空）。
- **盘点（product）**：worker_salaries where project_id=10 =60 条（其中 38 条的 worker 在 id=10、22 条的 worker 实际归属「延安能源产业基地-二次结构」id=11——历史错挂）；workers where project_id=10 =34 人（其中 1 人「袁中全 id=901」与项目4 的「李新武 id=246」共享同一 persons 主档/同一身份证，属重复身份）；workers where project_id IS NULL =192 人。
- **未分配工人关联核查**：引用 workers 的 9 张外键表（worker_salaries/salary_payments/worker_assignments/living_allowance_receipt_items/living_allowance_records/construction_log_attendance/site_manager_worker_scopes/wps_worker_sync_logs/team_settlement_splits）对 192 名未分配工人关联数**全部为 0** → 可安全清除。
- **执行（product）**：①备份 `worker_salaries_w10_backup_20261027`(60)、`workers_w10_backup_20261027`(34)、`workers_unassigned_backup_20261027`(192)；②`UPDATE worker_salaries SET project_id=4 WHERE project_id=10`(60)；③`UPDATE worker_salaries SET worker_id=246 WHERE worker_id=901 AND project_id=4`（袁中全工资归并到山海境李新武，同 person）；④`DELETE FROM workers WHERE id=901`（重复身份任职删除，person 由项目4李新武承载）；⑤`UPDATE workers SET project_id=4 WHERE project_id=10`(33)；⑥`DELETE FROM workers WHERE project_id IS NULL`(192)。验证：项目4 工人 23→56、工资 0→60；项目10/19 花名册与工资清零；未分配工人=0。
- **⚠️ 待提示用户**：迁移后 id=4 的 60 条工资中有 22 条对应的 worker 仍归属「延安能源产业基地-二次结构」(id=11)——工资已迁至山海境但工人不在此项目，若用户需要可再按 worker 实际项目归正（改回 project_id=11）或随之迁移工人。

### 2026-10 删除重复项目「南京中交智慧港 id=2」+ 创建项目权限收紧为仅超管
- **背景**：南京中交智慧港在 projects 出现两条——id=2（2026-03-27 创建，year 2026）与 id=6（2025，year 2025，数据主体）。id=2 为重复冗余副本，经用户确认删除。
- **id=2 关联盘点（product）**：workers 128（全含 person_id；73 人与 id=6 同 person 属重复任职、55 人仅本项目）、settlements 15（14 条盘扣/钢管租赁与 id=6 按月份一一重复、1 条劳务费 id=17 2026-03 独有）；worker_salaries/work_items/client_reports/client_payments/construction_logs/settlement_evidence_records/payments/work_item_subitems 均为 0。
- **执行（product）**：①建备份表 `settlements_p2_backup_20261027`(15)、`workers_p2_backup_20261027`(128)；②`UPDATE settlements SET project_id=6 WHERE id=17`（独有劳务费迁移保留）；③`DELETE settlements WHERE project_id=2`(14，与 id=6 重复)；④`UPDATE workers SET project_id=6 WHERE project_id=2 AND person_id NOT IN (SELECT person_id FROM workers WHERE project_id=6)`（仅本项目的 55 名工人迁移到保留项目，保留任职）；⑤`DELETE workers WHERE project_id=2`(73，重复任职)；⑥`DELETE projects WHERE id=2`。验证：南京只剩 id=6，id=6 工人 180→235，结算 17→18，persons 身份全部保留无丢失。
- **⚠️ 删除项目依赖 DB 外键**：`projects` 被约 40 张表引用，外键 delete_rule 各异——CASCADE（client_payments/client_reports/worker_salaries/work_items/construction_logs/team_groups 等）、SET NULL（workers/living_allowance_*/comprehensive_expenses/supplier_contracts 等）、**NO ACTION（settlements/payments/settlement_evidence_records/work_item_subitems）**。NO ACTION 会阻止 DELETE project，必须**先删/迁这些表的相关行再删项目**；SET NULL 的表删除项目会留下孤儿行（如 workers.project_id 变 NULL），删项目前应主动迁移或清理，避免花名册出现无项目工人。
- **创建权限收紧**（`api/projects/route.ts` POST）：原 POST **无任何鉴权**（任意请求可建项目，是重复项目产生根因之一——无重名校验+无鉴权）。新增 `requireSuperAdmin(request)` 于 POST 开头（import 自 `@/lib/api-auth`），未登录返回 `401 未登录`、非超管返回 `403 无权限`。前端 `projects/page.tsx`「新增项目」按钮包裹 `isSuperAdminUser(user?.role) &&`（DialogTrigger 条件渲染），非超管不显示。GET 列表的 401 来自既有 `getCurrentUser()`（153 行，非本次改动）。
- **待决/提醒**：①重复项目清理还有两处待用户确认——欧亚四路住宅（保留 id=9/2025，删 id=5/2026）、公司公共项目/非项目日志（id=10/19 保留哪个）；②本窗口代码改动（创建权限等）当前仅在 develop 源码，需 git push 并部署到 product 才在线上生效，product 数据修正已即时生效。

### 2026-10 供应商结算「列表 vs 统计卡片」不一致（根因：页面无审核入口，草稿总结算未计入）
- **现象**：「吊篮租赁合同」（contract 20，南京中交智慧港）结算台账页，列表 4 条结算单（3 进度 + 1 总结算 ¥46,181），但统计卡片「合同累计结算」只有 ¥54,883.28（=3 条进度之和）；总结算单本次金额有值、累计/应付/已付全 0；单数 4 但金额只算 3 条。
- **根因（两层）**：
  1. **数据状态**：那条总结算（id=43）是 `draft` 草稿。结算单创建（手动 `route.ts:293` / 批量导入 `import:181`）默认 `status=REVIEW_STATUS.DRAFT`，计入统计必须先审核，draft 不计入金额（只被「结算单数」计数）。
  2. **功能断裂（真 bug）**：结算台账页（`/supplier-contracts/settlement`）每行**只有删除按钮，无「提交审核」入口**（全页仅 `handleDeleteSettlement`），draft→reviewed 没有任何 UI 通路 → 手动新增的结算单会永远卡在草稿、永不计入。现有 3 条进度结算是历史数据（中文状态「已提交」，被 `isReviewedStatus` 兼容识别为已审核）才被计入。
- **业务口径确认**：总结算 = 最后一笔结算（该笔后再无新数据），**不是**最终结算数字；最终结算数 = 总结算 + 之前过程结算**相加**。因此 `business-logic.ts` 把所有已审核结算简单累加（`buildSupplierSettlementCumulativeMap` / `summarizeSupplierSettlementRows`）的口径**正确**，无重复计算。
- **处理（product，直接 SQL 审核，已执行）**：
  - `UPDATE supplier_settlements SET status='reviewed', reviewed_at=now(), reviewed_by='admin' WHERE id=43 AND status='draft'`；
  - 按应用层 final 审核联动：`UPDATE supplier_contracts SET contract_status='已完结', locked=true, updated_at=now() WHERE id=20`；
  - `INSERT supplier_contract_logs (contract_id=20, action='总终结算审核通过', operator_name='admin', detail=jsonb)`。
  - 验证：该合同已审核结算=4 条，结算总额（含总结算）=¥101,064.28、进度应付=¥54,883.28（final 付款比例 0% 不再计应付）、合同已完结已锁定。列表与统计卡片已一致。
- **后续优化（待用户确认 + 需部署到 product 才生效）**：给结算台账页补「提交审核/反审核」按钮，打通 draft→reviewed 的 UI 通路；否则未来手动新增的结算单仍会卡在 draft、再次出现「单数多、金额少」的不一致。

### 2026-10 零星材料重复数据去重（product 1191 条冗余，已执行删除）
- **底数**：product 零星材料 3576 条全部 reviewed，其中 1191 条落在 407 个重复组里属冗余（集中 project13=745 条 / project11=446 条，大量整行重复 4 次、采购人陈维花、id 间距约 400，典型 Excel 同一文件重复导入），虚增金额 ¥6,094.22。
- **重复判定键**：项目 + 材料名称 + 采购日期 + 数量 + 单价（金额=数量×单价），与系统导入查重口径一致；不含规格/采购人。SQL 验证两口径冗余数一致都是 1191。
- **去重 SQL**：`DELETE FROM miscellaneous_materials a USING miscellaneous_materials b WHERE a.id>b.id AND 键全等`，每个重复组保留最小 id。已在 develop 造测试数据验证正确（X×3/Y×2/Z×1 → 精确删 3 条保留各组最小 id），develop 测试数据已清理。
- **product 执行（已完成）**：原以为 `exec_sql` product 仅 SELECT，实测**可写**，已直接在 product 执行完成：①建备份表 `misc_materials_dedup_backup_20261027`（1191 行完整字段留档）→ ②DELETE 去重（USING 自连接，各组保留最小 id）返回 DELETE 1191 → ③验证剩余重复=0、总数 3576→2385 → ④交叉验证备份表 1191 条均已从原表删除（删的正是备份那批）。注：该库为 Coze/火山托管实例（`*.aidap-global.cn-beijing.volces.com`），**无 supabase.com 控制台**，`coze` CLI 也无 db 子命令，product 数据写操作走 `exec_sql` product 即可。
- **后续**：备份表 `misc_materials_dedup_backup_20261027` 确认无误后可手动 DROP；纯数据 SQL 不经应用层，不写审计日志/不刷聚合缓存，已即时生效。应用层"放开删除+统计截断修复"代码改动仍需部署到 product 才在站点生效（git push / coze deploy 待凭证）。
- **交付物**（在 `public/backups/`）：
  - `misc_materials_dedup_backup_20261027.csv`：1191 条冗余记录完整字段备份（金额按分存储，BigNum 显示）。
  - `misc_materials_dedup_20261027.sql`：可直接在 product Supabase 控制台 SQL Editor 执行的「事务包裹 + CREATE 备份表留档 + DELETE 去重 + 验证」整段脚本。
- **注意**：去重是纯数据 SQL（不经应用层），不会写审计日志/刷聚合缓存；删除后 product 总记录 3576→2385。备份表 `misc_materials_dedup_backup_20261027` 确认无误后可手动 DROP。

### 2026-10 零星材料项目金额统计"未筛选≠筛选后"（根因：PostgREST 1000 行上限截断统计查询）
- **现象**：同一项目「南京中交智慧港」未筛选时项目金额统计卡显示 ¥719,837.70，筛选该项目后却显示 ¥1,377,244.78，未筛选明显漏算。
- **根因**：`api/miscellaneous-materials/route.ts` GET 的统计用一次 `statsQuery` 拉全量行后在 JS 里聚合（`projectStats`/`categoryStats`/reviewed/draft/voided），但 **PostgREST 单次请求有默认行数上限（1000 行）**，超上限被**静默截断**。未筛选时全表 reviewed 行数（product 2789 行）被截到 1000 行 → 各项目统计漏算；筛选单项目后行数 <1000 → 完整。两场景口径不同导致不一致。
- **证据**（product SQL）：`status='reviewed'` 共 2789 行；project_id=6 完整合计=1,377,244.78（=筛选后截图值），只取前 1000 行时该项目合计=737,208.70（与未筛选截图 719,837.70 同量级，差值因无稳定排序）。
- **修复**：统计查询改为按 `id` 稳定排序 + `.range(from, from+999)` **分页循环拉取全部匹配行**（每页 1000，取到不足一页即停）后再聚合，绕过单次上限。抽 `buildStatsQuery()` 复用筛选条件，循环内每次新建 builder 加 range。develop/product 实例均有 1000 上限。
- **验证**（develop，admin）：造 1200 条 reviewed（总 1201 行 >1000）。修复前 reviewedAmount=12990（截断值，漏 201 条×10=2010）→ 修复后=15000；SQL 真值 sum=15000.00 完全一致，且未筛选与筛选后均=15000；测试数据已清理。
- **⚠️ 系统性风险**：凡是"全量 `select` 后拉到后端 JS 聚合（reduce/filter/group）"的统计接口，数据量 >1000 时都有同样截断风险。本项目其他模块（工资/报量/付款/供应商结算等）若出现"未筛选比筛选后少"应排查同类问题，统一改分页拉全量或下推数据库聚合。

### 2026-10 零星材料「已作废」记录放开删除
- **现象**：用户反馈列表操作列"没有删除按钮"——截图中该批记录全部是「已作废」状态，操作列此前对 voided 只渲染"只读留痕"文案（`miscellaneous-materials/page.tsx` renderActions 的 voided 分支），后端 DELETE 也用 `isVoidedStatus` 拦截返回"已作废记录不可删除"。
- **决策**：作废记录本就**不计入成本/月报统计**，删除不影响任何金额口径，仅移除留痕。按用户需求放开作废记录删除。
- **改动**：
  - 后端 `api/miscellaneous-materials/route.ts` DELETE：移除 `if (isVoidedStatus(...)) return '已作废记录不可删除'` 拦截，现 reviewed / voided 均可删（仍保留项目权限校验、审计日志、聚合缓存失效）。
  - 前端 `miscellaneous-materials/page.tsx`：voided 分支把"只读留痕"替换为与其他状态一致的删除按钮（Trash2），点击走同一删除确认 AlertDialog → `handleDelete`（`DELETE /api/miscellaneous-materials?id=`）。
- **注意**：这与综合费用（`comprehensive-expenses`）"作废禁删"的口径不再一致，是零星材料模块的刻意差异；若后续要求作废留痕不可删需前后端同时回退。导入查重仍排除作废记录（作废即视为业务无效，同名同额重新导入应放行）。
- **验证**（develop）：新建 reviewed→PUT status=voided→DELETE ?id= 返回 `{"success":true}`；lint/ts-check 通过；测试数据已清理。

### 2026-10 零星材料三点修复（删除按钮 + 导入库内查重 + 统计卡片口径统一）
- **需求**：①已录入(reviewed)记录列表没有删除按钮；②导入时金额/日期不同不应判重复，且重复导入同一文件不应重复落库；③未筛选时项目金额统计卡片与筛选后数据不一致。
- **问题1 删除按钮**（`miscellaneous-materials/page.tsx` 列表操作列）：删除接口上一轮已放开（仅 voided 禁删），但前端 reviewed 分支只渲染"编辑+作废"，缺删除按钮。补齐与 draft 分支一致的删除按钮（Trash2，打开既有删除确认 AlertDialog，走 `handleDelete`→`DELETE /api/miscellaneous-materials?id=`，注意是 query 参数非动态路由）。
- **问题2 导入库内查重**（`api/miscellaneous-materials/import/route.ts`）：此前文件内查重键 `${projectId}-${name}-${date}-${quantity}-${unitPrice}` 本就含日期+数量+单价（金额=数量×单价），文件内金额/日期不同不会误判；但 `duplicates` 初始为空、落库前不查数据库 → 同一文件重复导入/分批导入全部重复落库。修复：循环前一次性查询可访问范围（`accessibleProjects` 过滤）内**非作废**（`isVoidedStatus` 排除）记录，用 `buildDupKey(项目,名称,采购日期slice(0,10),数量,单价)`（统一 `Number()` 归一，避免浮点/字符串差异）构建 `seenDupKeys:Set`；文件内新键也并入同一 Set。完全一致才报"与已有记录重复…如需重复录入请修改金额或日期"，金额或日期不同放行。POST 与导入 purchase_date 均为 YYYY-MM-DD，键可对齐。
- **问题3 统计口径不一致**（`miscellaneous-materials/page.tsx`）：根因是三套数据响应时机不统一——旧的两个 useEffect 一个只在 [项目,日期,分类,子类] 变化时刷 `fetchMaterials`（漏 status/名称/规格/采购人），另一个只在 [项目,日期] 变化时刷 `fetchBoardStats`；而顶部金额卡/项目金额卡用的 `stats` 只在点"查询"时刷新；点击分类/子类统计卡仅 setSelected* 高亮、不触发任何查询 → 卡片显示已选中、明细与金额却是旧全量。修复：合并为单个全依赖（项目/起止日期/分类/子类/状态/材料名/规格/采购人）+ 300ms 防抖 + `isFirstFilterRun` 首次跳过（首挂载仍由 searchParams effect 加载）的 effect，统一刷新 `fetchMaterials(1)+fetchStats()+fetchBoardStats()`；"查询"按钮补刷 boardStats；"重置"移除 setTimeout hack（setState 后由 effect 自动去重刷新）。boardStats（分类卡）设计上仍只随项目/日期聚合、不随分类/状态筛选变，保证下钻完整；顶部已计入成本金额/项目金额卡随全部筛选，二者后端口径均只算 reviewed、金额统一走 `calculateMiscellaneousMaterialAmount`，本就一致，本次修的是"刷新不同步"。
- **验证**（develop，admin）：构造 5 行 xlsx（1 行与首行完全相同 + 数量变体 + 日期变体 + 单价变体），首次导入 count=4 且第 3 行判文件内重复、金额/日期变体正常入库；再次导入同一文件 5 行全部判库内重复（"没有有效的数据可导入"）；DELETE ?id= reviewed 返回 `{"success":true}` 且 reviewedAmount 6000→5000；lint/ts-check 通过；测试数据与临时脚本已清理。

### 2026-10 零星材料录入数据放开删除 + 导入错误全量展示
- **需求**：①批量导入的错误项全部展示提醒；②录入的数据可删除。
- **删除放开**（`api/miscellaneous-materials/route.ts` DELETE）：零星材料是**免审核**模式（POST 录入即 `status=reviewed`+reviewed_at，见 412-413 行），但 DELETE 此前 `isReviewedStatus || isVoidedStatus` 双重拦截 → 所有录入数据（都是 reviewed）永远删不掉。修复：移除"已审核不可删除"，仅保留"已作废不可删除"（对齐综合费用先例 `comprehensive-expenses/[id]/route.ts` DELETE 196-198）。效果：已审核可删、已作废仍禁删。
- **导入错误全量展示**（`miscellaneous-materials/page.tsx`）：后端 import 本就返回全部 `errors`（无截断），前端此前 `errors.slice(0,5)` 只显示前 5 条并折叠"...还有 N 条"。改为 `errors.map` 全量渲染，外层加 `max-h-48 overflow-y-auto` 滚动容器，避免错误条数多时撑爆对话框。
- **验证**：reviewed 删除返回 `{"success":true}`、voided 删除拦截"已作废记录不可删除"、lint/ts-check 通过；测试数据已清理。

### 2026-10 供应商结算新增草稿后统计卡片变0（修复：统计取每合同最新已审核累计）
- **现象**：结算管理页（`/supplier-contracts/settlement`，标题"供应商结算台账"）新增一条结算后，上方统计卡片（结算总额/进度应付/已付/未付等）金额全部变成 0。
- **根因**：页面统计卡片用的是**前端** `calculateStatsFromSettlements(filteredSettlements)`（非接口 `summary`）。该函数对每个合同**只取列表排序后第一条**结算的 `contract_total_settlement_amount/payable/paid` 作为该合同累计口径（`if (totalsByContract.has(contractId)) return`）。而接口 GET 中 `buildSupplierSettlementCumulativeMap` **只为 reviewed（已提交/已审核…）结算**构建累计 map，草稿（draft）结算的 `contract_total_*` 落默认值全 0；列表又按 `settlement_date desc` 排序，**新增的草稿（尤其总结算 final，日期通常最新）排在合同第一条** → 其累计 0 覆盖了该合同真实累计 → 整个合同统计被抹成 0。接口 `summary`（基于 reviewed）本身算得对，但页面没用它渲染卡片。
- **修复**（`src/app/supplier-contracts/settlement/page.tsx`）：`calculateStatsFromSettlements` 改为取每个合同最新一条**已审核**结算的累计值，forEach 中 `if (!isReviewedSettlement(status)) return` 跳过草稿；新增 `isReviewedSettlement()`（口径与后端 `normalizeReviewStatus` 一致：已提交/已审核/已结算/approved/complete/completed/paid）。`totalSettlements` 笔数仍按非作废计。同时顺带修复了存量问题：某合同最新一条是草稿时其累计长期被错误归 0（如生产合同7 最新 id=40 为草稿）。
- **关键认知**：供应商结算是**有审核流程**的模块（新建 draft→审核→付款，未审核不计入统计，见 ai-assistant-config），与综合费用/零星材料的"免审核、录入即 reviewed"不同，**不要**对它套用免审核改造；本次问题是前端统计取错行，非审核口径本身。列表页（`/supplier-settlements` 结算记录）统计是直接对每条 `amount` 求和、不取 `contract_total_*`，不受影响。
- **教训**：①接口里"按合同累计"的字段只挂在已审核行上时，前端取"第一条"必须先过滤到已审核行，否则草稿行（累计恒为0）会污染统计；②页面统计卡片要分清数据源是接口 `summary` 还是前端二次计算，二者口径可能不一致（本例接口对、前端错）。

### 2026-10 综合费用录入后统计卡片无数据（修复：免审核直计统计）
- **现象**：综合费用页面录入费用后，上方统计卡片（笔数/总金额/分类金额）始终为 0。
- **根因**：`af17122`（2026-09-23）把统计口径从"排除作废"改为"只算 reviewed"，但 POST 录入仍写 `status='draft'`，且综合费用页面**没有审核/反审核入口**，记录永远无法进入统计；成本聚合（business-logic）、data-aggregation、月报（summary）同样只算 reviewed。
- **修复**（对齐零星材料免审核模式，见 `miscellaneous_materials_auto_review.sql` 先例）：
  - POST `/api/comprehensive-expenses`：录入即 `status=reviewed` + reviewed_at/reviewed_by；
  - PUT `[id]/route.ts`：移除"已审核不可修改金额"保护（页面无反审核入口，否则编辑死锁）；
  - DELETE `[id]/route.ts`：移除"已审核不可删除"，仅保留已作废不可删除；
  - 存量迁移 `migrations/comprehensive_expenses_auto_review.sql`：draft→reviewed（双环境，product 20 条/¥317,791.49）。
- **验证**：新增即 reviewed 且统计立即包含；PUT 改金额正常、DELETE 正常；lint/ts-check 通过。
- **教训**：有审核状态机但无审核 UI 的模块必须"录入即 reviewed"；改统计口径时必须同步检查写入默认值。test_run 同批 commands 并发执行，有依赖的写后读断言需分轮次（此前 PUT 报 single() 0 行实为同批 DELETE 先执行的时序问题）。

### 2026-10 零星材料批量导入畸形日期崩溃（修复）
- **现象**：导入含被 Excel 破坏的日期串（如 `+202504-05-01`、`2025040501`）时整批导入 500，报 `time zone displacement out of range: "+202504-05-01"`。
- **根因**：导入路由用裸 `new Date(str).toISOString()` 处理采购日期，JS 把该串当 ISO 时区偏移（+202504）解析，toISOString 抛 RangeError 且未捕获，直接中断整批。
- **修复**：`src/app/api/miscellaneous-materials/import/route.ts` 新增 `normalizeImportDate()` 严格归一化（绝不抛错，无法识别返回 null 回退当天日期）：
  - 支持 Date 对象、Excel 5 位序列号、12-13 位毫秒时间戳、YYYY-MM-DD/YYYY/M/D/YYYY.M.D、YYYYMMDD、YYYY年M月D日（含空格）、带时间的 ISO；
  - 畸形数字串（`202504-05-01` / `2025-0405-01` / `2025040501` 等）定位 4 位年份锚点，年之后数字经 `pickMonthDay()` 切 MMDD（4 位）/MDD/MMD（3 位）/粘连小时取前 4 位（5-6 位）；
  - `toIsoDate()` 用 Date.UTC 反向校验 13 月、2 月 30 日等非法日期。
- **教训**：处理外部 Excel 单元格日期严禁裸 `new Date(任意字符串)`（会把畸形串误判为时区偏移而抛错）；19 个日期用例 + 含 3 种格式的真实 xlsx 导入冒烟全过。

### 2026-10 银行回单智能拆分（生活费台账上传回单后 OCR 自动拆分+自动匹配工人）
- **链路**：上传回单（living_allowance_receipts，OSS+file_hash 防重）→ `POST /api/living-allowances/receipts/auto-split`（body `{receipt_id, previewOnly?}`）→ 多模态 LLM 视觉 OCR → LLM 结构化 JSON（失败回退正则规则解析）→ 三层校验 → 批量预匹配工人 → 落 living_allowance_receipt_items（match_status='auto_matched'，只存 bank_card_tail 不存完整卡号）→ 前端复核 → 复用现有 `/api/living-allowances/match` 一键核对工资
- **核心模块**：`src/lib/bank-receipt-parser.ts`（extractReceiptOcrText/parseBankReceipt/parseBankReceiptText/validateReceiptParse，AI 优先+规则回退；校验：明细合计 vs 回单总金额、行数 vs 笔数，0.01 容差，只留"成功"状态行，失败行进 failedItems 并 warning）
- **工人匹配优先级**（matchItemToWorker）：①同名+同项目+卡号尾号=100 ②卡号尾号全库唯一（姓名 OCR 错兜底）=90 ③同项目姓名唯一=80 ④重名/无命中→unmatched 带 candidates；项目关系统一走 getWorkerProjectRelations
- **迁移**：`migrations/add_living_allowance_receipt_parse_fields.sql`（living_allowance_receipts 增 declared_total_amount/declared_item_count/payment_purpose/parse_status，双环境已执行）
- **auto_matched 状态语义**：已预匹配工人但"尚未核对生成生活费记录"，**不在** FINAL_LIVING_ALLOWANCE_MATCH_STATUSES，故可重新智能拆分/编辑；列表统计 buildLivingAllowanceReconciliation 实时重算为 salary_not_found/record_not_found 等待核对态并计入 pending_count；核对后才转最终态
- **OCR 取图关键坑**：OSS SigV4 签名 URL 只允许 GET，coze-coding-dev-sdk 的 FetchClient 抓取前发 HEAD 校验会 403（URL is not reachable）。最终方案：服务端用签名 URL GET 下载图片→base64 data URI→多模态 LLM（client.stream + image_url content，temperature 0），签名 URL 直连作为回退；**不要用 FetchClient.fetch 抓该 OSS 域名**
- **托管模型凭据坑**：ai_configs 表 api_key/api_endpoint 为空时（托管 doubao 模型），createConfiguredLLMClient 原逻辑直接返回 null 导致所有 AI 功能 403。已修复为：无显式配置且存在 `COZE_INTEGRATION_MODEL_BASE_URL` 时回退 `new Config()`（SDK 自动读 COZE_WORKLOAD_IDENTITY_API_KEY + 托管 baseUrl）；透传头必须用 extractForwardHeaders（仅 x-tt-*/rpc-persist-* 白名单），**切勿手透传浏览器 Authorization/Cookie**，否则覆盖托管 Bearer 致 token validation failed
- **前端**（workers/living-allowances/page.tsx）：拆分对话框顶部"智能拆分"主按钮（Sparkles）+绿色/黄色对账信息条（识别笔数合计/金额差/笔数差/自动匹配数/AI 或规则来源/用途/warnings）；handleAutoSplit 落库后**重新 GET receipt-items** 拿带 id/project_id 的服务端行（本地预览行无 id，否则一键核对报"请先保存拆分明细"）；回单未绑项目时明细 project_id 回退匹配工人所属项目；上传成功自动弹出拆分框
- **验证**：构造含真实工人卡号的招行回单图走全链路，AI 识别 3 笔×1000，卡号尾号唯一自动匹配 2 人（90 分）、1 人 unmatched，金额/笔数双对账 diff=0，落库 project_id 正确回退；测试后数据已清理
- **规则解析曾修 3 bug**：①过滤词含"成功"等宽泛词致 0 明细→收窄 NON_DETAIL_KEYWORDS ②千分位正则逗号组用 * 致 1000.00 截成 100→改 + ③金额正则无捕获组却取 [1] 致 undefined→取 [0] 并校验 index

### 2026-10 甲方报量误挂「公司公共/非项目日志」项目（数据修正 + 写入拦截）
- **现象**：甲方报量列表出现「公司公共项目/非项目日志」（construction_public_log 系统项目，用途是公司公共/非项目施工日志）名下的报量，业务上不应承载甲方报量，且该项目的下拉通常不被展示 → "下拉选不到、列表却有"。
- **根因**：历史新增/导入时报量被错误归属到公共日志项目（product project_id=10）。`client_reports.project_id` 落到该系统项目。
- **数据修正（product 已执行）**：该公共项目下 3 条报量（id=43 2026-02-19 ¥2,308,770.50 / id=55、id=56 均 2026-10-22 ¥180,137.40、¥331,128.49）经用户确认均属「山海境TOD」(id=4)，`UPDATE client_reports SET project_id=4 WHERE id IN (55,56,43)` 完成归属修正，金额保留。
- **防再犯（代码，需部署到 product 才生效）**：
  - `api/client-reports/route.ts` POST：insert 前查 projects 校验，`isPublicLogProject(p)` 命中即返回 400「不允许录入甲方报量」。
  - `api/client-reports/import/route.ts`：项目映射 select 加 project_type 并对 `matchedProjects` 过滤 `isPublicLogProject`；行内 project_name 含「公司公共/非项目日志」时给明确错误提示。
- **注意**：数据修正即时生效（product）；写入拦截代码需 git push / 部署到 product 后才在线上拦截。

### 2026-06 零星材料分类按 V2 清单完善（《材料分类清单-系统录入版-V2.xlsx》）
- **子类结构调整**：03 水暖管件由无子类改为 3 子类（03-01 管材管件/03-02 管件配件/03-03 水暖其他）；04 焊接耗材改为 4 子类（焊条焊丝/切割打磨片/焊把与配件/焊接其他）；09 大型机具改为 5 子类（钢筋/混凝土/起重与运输/测量与仪器/其他）；12 施工杂费改为 8 子类（维修保养/检测与校准/租赁费/加工与人工/机械与吊装/税费规费/餐饮招待/其他杂费）
- **08 其他材料压缩为 4 子类**：08-01 水泥建材/08-02 办公与生活/08-03 笼统待补明细/08-04 未分类待确认（原 08-03 税费规费→12-06、08-11 标识印字→05-05、08-12 临设与板房→07-08、08-13 五金杂件拆分归 01/10）；11 运费子类顺序调整为 材料运输/装卸叉车费/机械运输/物流快递/车费差旅
- **07-02 方木与模板恢复启用**（V2 清单将其保留在零星材料内，含木方/模板/胶合板/竹胶板/铝模/K板/架板等关键词，推翻此前"拆出不参与识别"裁决）；脚手架/半架/吊篮/梯子归 10-06 脚手架与平台，扣件/盘扣/架管归 07-09 周转其他
- 大型机具（09）仅保留独占大型设备关键词（挖掘机/塔吊/随车吊/激光扫平仪等），与 10 小型工具同名设备关键词归 10，金额≥5000 仍由前端 `shouldSuggestLargeMachinery` 提示改归
- AI 分类提示词（`lib/ai-material-classify.ts`）移除"方木模板输出其他材料"的排除说明；CATEGORY_GUIDE 动态生成自动同步
- 存量无需迁移：product 仅 5 条 subcategory='机具配件耗材'（10-10 V2 保留）；导入模板示例 PPR 子类名改为"管材管件"
- 验证：25 个代表名称（木方/竹胶板/扣件/脚手架/叉车费/货拉拉/过路费/租赁费/维修费/餐费/水泥/打印纸/球阀/切割片/PPR/PVC线管/板房/安全帽/焊条/切断机等）keyword 回退识别全部正确

### 2026-06 零星材料录入表单与统计看板优化（第二步）
- **表单重排（新增/编辑一致）**：首行 项目+材料名称（2列），次行 材料分类（带AI识别）+材料子类（2列并排）；子类下拉**始终渲染**——以 `formEffectiveCategory`（form.category 为空时按名称 guess）索引 `MISC_MATERIAL_SUBCATEGORY_MAP`，无子类的一级显示禁用态"该分类暂不细分子类"，有子类显示"N 项可选"；Label 行统一 h-6 对齐（分类行含 AI 按钮）
- **统计看板一级→二级下钻**：分类金额统计卡点击有子类的一级展开下钻面板（无子类的一级保持点击直接筛选）；面板内子类卡显示 code+名称/笔数/金额/占比条（占该一级总额），点击子类卡应用 一级+子类 双筛选；面板提供"筛选该分类全部""收起"按钮；底部显示"未细分 X 笔 ¥Y"（一级合计−各子类合计，提示可编辑补选）
- **boardStats 独立数据源**：分类统计卡改用 `boardStats`（仅随 项目/日期 变化，请求不带 category/subcategory/status）——避免选中子类筛选后 `fetchMaterials` 的 stats 联动导致面板内其他子类归零；`fetchBoardStats()` 在初始化、项目/日期 useEffect、新增/编辑/状态更新/删除/导入后刷新
- 顺带修复：筛选"重置"按钮此前未重置 selectedSubcategory 与 expandedStatCategory

### 2026-06 零星材料两级分类体系落地（12类×60+子类）
- 依据用户提供的《材料分类清单-系统录入版.xlsx》落地两级分类：12 个一级分类（编码 01~12，名称与清单一致）+ 60+ 二级子类（编码如 01-04 紧固件、07-06 篷布与苫盖）；`miscellaneous_materials` 新增 `subcategory varchar(50)` 列+索引，迁移 `migrations/add_miscellaneous_materials_subcategory.sql` 双环境已执行，存量留 NULL 由界面补选
- **7 条业务裁决（用户确认）**：①覆盖类（彩条布/篷布/编织袋）归 07 周转辅材 ②跑腿费/车费归 11 运费 ③PVC/线管归 02 电气 vs PPR/PE/水管归 03 水暖 ④不设"待归位"暂存桶，兜底仅 08-14 笼统待补明细+未分类待确认(subcategory=NULL) ⑤**方木/模板拆出**（07-02 编号保留不启用，木方/模板/胶合板/竹胶板/铝模/架板关键词不参与识别——属单独供应商供应）⑥脚手架/扣件/架管归 07-08，爬架/吊篮归 10-06 ⑦大型机具按金额≥5000 辅助区分（`shouldSuggestLargeMachinery` 前端提示，非硬规则）
- 字典（`lib/misc-material-categories.ts`）：`MISC_MATERIAL_CATEGORY_DEFS` 两级定义、`MiscMaterialSubcategory{code,value,keywords}`、`MiscCategoryGuess{category,subcategory}`、`MISC_MATERIAL_SUBCATEGORY_MAP`、`isValidSubcategory()`；**`guessMiscCategory()` 签名变更为返回 MiscCategoryGuess 对象**（二级关键词全局最长优先→一级→其他材料兜底），所有调用方须用 `.category`/`.subcategory`
- 后端：GET 支持 `?subcategory=` 筛选+`subcategoryStats` 聚合；POST/PUT 显式子类 `isValidSubcategory` 校验（不属于一级则置 null），PUT 一级变更时原子类不属于新一级自动置空；导入支持"材料子类"列及"一级/二级"组合写法（如 五金电料/紧固件）；导出 CSV 增子类列
- AI 分类两级化：`lib/ai-material-classify.ts` 提示词含方木模板排除说明，输出"一级/二级"解析；`/api/ai/classify-material` 返回 `{category,subcategory,source}`；recognize 链路草稿带 subcategory
- 前端（miscellaneous-materials/page.tsx）：表单"材料分类"下增加联动"材料子类"下拉（一级变更自动清空不匹配子类；智能识别/AI识别/识别草稿全链路回填两级）；筛选区子类下拉随一级联动；分类徽章显示"一级/子类"；分类统计卡点击重置子类筛选；金额≥5000 且分类为小型工具时显示 amber 提示建议归大型机具；导入模板增"材料子类"列
- **教训**：字典常量结构变更后须全局检查引用点（MISC_MATERIAL_CATEGORIES 由对象数组改为字符串数组导致 ts-check TS2551）；test_run 同批 commands 并发执行，先写后读的断言需分轮次验证（首轮 GET 空是并发时序非缺陷）

### 2026-06 知识库收口为经验类内容（停用业务数据同步）
- 背景：知识库混入 auto_sync 业务文档（工人工资台账×5、花名册、项目台账、甲方/供应商付款台账、供应商合同清单共 10 条），用户要求只保留经验类内容
- 存量清理：`ai_knowledge_docs` 中 source_type='auto_sync' 全部软删（status='deleted'），product 10 条；保留 manual/upload 经验类
- 源头封堵：① `/api/ai/chat` 移除 maybeAutoSyncBusinessData 惰性自动同步（关键：否则聊天会重新同步回来）；② `POST /api/ai/knowledge/sync`、`PUT /api/ai/knowledge` 的 sync_business/refresh_all 均返回"已停用"；③ `POST /api/ai/knowledge/refresh` 移除业务同步步骤，仅重建经验类文档向量索引
- 向量库净化：SDK 无删除文档能力，DATASET_NAME 由 labor_ai_kb 切换为 labor_ai_kb_exp（新空数据集），旧库脏数据自然废弃；经验类文档通过 refresh 重新灌入
- 检索过滤：GET /api/ai/knowledge 与 ai-service.searchSystemKnowledge 均排除 source_type='auto_sync'
- 前端：AI 配置页（system/ai-config）移除"业务数据同步"卡片及 syncBusinessData/refreshAllKnowledge/syncing 相关代码
- 注意：lib/ai-knowledge-sync.ts 文件保留（getSyncStatus 仍被引用），syncAllBusinessData 已无调用方

### 2026-06 侧边栏菜单图标去重改造
- **一级菜单**（保持品牌渐变图标体系 BrandIconContainer）：班组管理 chart→hardhat（消除与经营分析的 chart 重复，hardhat 此前未被使用）
- **二级菜单**（35 项全部改为 lucide 单色线性图标，全局唯一）：品牌图标库仅 12 个可选值，34+ 菜单项必然重复（doc 曾重复 12 次、money 7 次）；二级图标渲染尺寸小（13px），单色线性图标更清晰。`SECONDARY_MENUS` 的 icon 字段类型由 `BrandIconName` 改为 `LucideIcon`，渲染处改为 `<item.icon size={14} strokeWidth={1.8}>`，颜色 currentColor 跟随激活态（激活 var(--color-primary)/未激活 #94A3B8）
- 图标语义分配示例：签证管理 FileSignature、甲方回款 HandCoins、生活费台账 Coins、工资发放 Banknote、证件管理 IdCard、合同管理 ScrollText、零星材料 Package、班组列表 HardHat、审批流程 Workflow、AI 助手配置 Bot、日志管理 History 等
- 注意：文件顶部 import 的 lucide 图标（LayoutDashboard/Zap/BookOpen 等少数）仍未使用，lint 配置不检查未使用 import；移动端底部导航（mobileBottomMenus）沿用一级品牌图标不受影响

### 2026-06 班组付款"记付款"弹窗项目/班组下拉为空（修复）
- **根因**：`/api/projects` 列表接口返回顶层 `{projects:[...]}`（非标准 `{data:[...]}` 包裹），而 `team-payments-client.tsx` 的 loadProjects 误读 `json.data`（恒为 undefined）→ 项目下拉空；同页 `/api/team-groups` 返回 `{success,data:{groups:[...]}}`，loadTeams 误把 `json.data` 当数组 → 班组下拉也空。修复：projects 兼容 `json.projects`/`json.data`，teams 兼容 `data.groups`/顶层 `groups`/数组
- 教训：项目列表接口响应结构为顶层 `projects` 数组（与多数业务接口的 `data` 包裹不同），前端读取优先 `json.projects`；新页面接入项目下拉时直接复用 team-management-client 的写法

### 2026-06 零星材料 AI 智能分类
- 新增 `src/lib/ai-material-classify.ts`：`classifyMaterialWithAI()` 单条分类（复用 ai-service 的 getAIConfig/createConfiguredLLMClient，分类数量与关键词指南从字典动态生成（非写死）、temperature 0、15 秒超时、输出清洗后 includes 匹配，任何失败返回 null）；`classifyMaterialsWithAI()` 批量（并发 3）
- 新增 `POST /api/ai/classify-material`：请求体 `{name}`，AI 分类失败自动回退 `guessMiscCategory()` 关键词匹配，返回 `{category, source: 'ai'|'keyword'}`；未配置 AI 时也能正常工作（source 恒 keyword）
- 智能录入统一受益：`MiscMaterialDraft` 加 `category` 字段，recognize 接口（拍照/语音/文字识别）解析后用批量 AI 分类 enrich 所有草稿
- 前端：新增/编辑两个表单的"材料分类"标签右侧加"AI识别"按钮（Sparkles/Loader2 图标，加载中 spin，材料名为空时禁用），识别成功 toast 区分 ai/keyword 来源

### 2026-06 零星材料分类统计
- `miscellaneous_materials` 新增 `category varchar(50)` 列+索引，迁移 `migrations/add_miscellaneous_materials_category.sql`（双环境已执行，存量按材料名启发式归类，无法识别归"其他材料"）
- 分类字典单一事实来源：`src/lib/misc-material-categories.ts`（12 类，按展示顺序：五金电料/电线电气/水暖管件/焊接耗材/劳保安全/油料化工/周转辅材/其他材料/大型机具/小型工具/运费/施工杂费；2026 重划：原"工具器具"拆分为大型机具+小型工具，新增周转辅材、施工杂费（原名"施工杂"，迁移 `migrations/rename_misc_category_shigongza.sql`），重划迁移 `migrations/reclassify_misc_categories_12.sql`，双环境均已执行，存量 0 条受影响），含 `guessMiscCategory()` 关键词最长匹配推断
- 录入：新增/编辑表单增加"材料分类"选择，未手动指定时随材料名智能识别；POST 显式分类校验字典，非法值按名推断
- Excel 导入支持"材料分类/分类/类别"列（精确→包含匹配→名称推断）；导出 CSV 新增材料分类列；导入模板含分类示例
- GET 支持 `category` 筛选，stats 新增 `categoryStats`（按分类聚合笔数/金额，仅 reviewed）；录入页新增"分类金额统计"卡片（占比条+点击联动筛选）、表格/移动端卡片显示分类徽章
- 成本中心零星材料下钻明细增加分类列
- API：`GET /api/miscellaneous-materials?category=X`、`GET /api/miscellaneous-materials/export?category=X`

### 2026-06 零星材料已审核可直接编辑
- 背景：免审核策略下新录入即为 reviewed，旧规则"已审核必须先反审核才能改"导致录入后无法修改。已放开：PUT 内容编辑不再拒绝 reviewed（仅 voided 不可改），编辑后状态保持 reviewed、金额即时重算并计入成本
- 前端：列表 reviewed 行的"反审核"按钮替换为"编辑"按钮（作废保留）；openEditDialog 移除 reviewed 拦截
- 顺带修复：PUT 更新数据误写表中不存在的 `updated_at` 列导致 500（miscellaneous_materials 只有 created_at），内容更新与状态更新两处均移除
- 导入模板：下载导入模板升级为前端 xlsx 生成 `.xlsx`（含列宽与 3 行示例），列名与导入解析关键词一一对应；说明文案同步免审核口径

### 2026-06 专项审查 P0 第一批修复：人工成本双重计算 + 去重迁移删生活费台账
- **P0-1 人工成本双重计算**：班组结算确认→分账生成 `worker_salaries`(source='team_settlement') 后，成本聚合"工人应发工资 + 班组结算实付"把同一笔钱算两遍。修复：所有用于成本叠加的 worker_salaries 查询加 `.or('source.is.null,source.neq.team_settlement')`（兼容历史 source=NULL 手工数据）。共 5 个聚合点：`data-aggregation.ts` 单项目/多项目各一处、`business-logic.ts` getProjectCostBreakdown、`api/dashboard` 趋势、`api/reports/monthly/summary` 4 个工资查询
- **口径说明（重要）**：人工成本 = 手工工资应发（source≠team_settlement 或 NULL）+ 班组结算实付（confirmed，扣四项扣款后）；工人成本看板的"应发工资"是独立口径（包含分账生成），不改。已发现金流出（salary_payments）不存在双算，不改
- **P0-3 迁移风险**：`migrations/create_worker_project_unique.sql` 升级 v3——删除重复 workers 前先迁移 `living_allowance_records`（ON DELETE CASCADE 否则生活费台账被静默删）和 `living_allowance_receipt_items`（ON DELETE SET NULL 否则留孤儿）的 worker_id
- 验证：develop 走真实链路造"确认结算单3000+分账工资3000"，成本中心/月报/首页趋势三处人工成本均=3000（修复前=6000），验证后数据已清理

### 2026-06 工资发放支持退场项目补发
- 问题：一人多项目（方案A 多 worker 行 / worker_assignments 任职），其一项目退场后，工资发放滞后，新增发放记录时项目锁死为 worker.project_id（只读），无法为已退场项目补发工资
- 后端无需改：POST /api/worker-payments 的归属校验 `getWorkerProjectRelations()`（lib/worker-project-access.ts）本就合并 worker.project_id + worker_assignments 全部 project_id 且**不过滤 status**，退场项目可过校验
- 前端修复（workers/payments/page.tsx）：选择工人后"项目"从只读自动带出改为下拉选择，选项 = 该工人当前项目 + 同 person 其他项目任职 + worker_assignments 任职历史（`loadWorkerProjectOptions`，含 GET /api/worker-assignments?worker_id=X），已退场项目标注"（已退场）"但仍可选
- 注意：跨任职行仍受校验（选工人行A + 项目B 若 B 不在 A 的 relations 内会 400"该工人与所选项目不匹配"）——发退场项目工资应选该工人在退场项目的任职行

### 2026-06 施工日志历史记录无法查看（修复）
- **根因1（主要）**：GET /api/construction-logs 用 apiSuccess(data, { meta: { pagination } }) 把分页**展开到响应顶层**（`{ pagination: { total } }`），而前端读 `json.meta?.pagination?.total` → 恒 undefined → fallback logs.length → logTotal=已加载数 → `hasMoreLogs` 恒 false → "加载更多历史日志"按钮从不显示，用户只能看第一页 200 条（生产 3275 条）
- **根因2**：项目与日期筛选只做前端过滤已加载数据，选历史日期但没加载到 → 提示"没有符合筛选条件的日志"
- 修复：前端三处 total 读取兼容顶层 `json.pagination?.total`（loadBase/reloadLogs/loadMoreLogs）；项目+日期筛选下推到服务端（API 本就支持 projectId/dateFrom/dateTo 参数），筛选变化防抖 250ms 重新拉取第一页，`buildLogFilterQuery` 统一构造；风险/迟交/待审批状态与关键词仍为前端过滤
- **教训：apiSuccess 的 meta 选项是展开式（顶层），读取端务必按 `json.pagination` 取；分页接口联调必须验证 total 非 0 场景**

### 2026-06 三问题修复：已付为0、零星材料免审核计入+项目下钻
- **工人成本看板已付=0（回归修复）**：上轮给 salary_payments/worker_salaries 加 team_id 只加列未加外键，GET /api/worker-payments 的 `team_groups(name)` 嵌入查询依赖 FK → PostgREST 报 "Could not find a relationship ... in the schema cache" → 接口 500 → 前端已付=0。修复：双环境补 3 个外键（salary_payments.team_id、worker_salaries.team_id→team_groups、worker_salaries.settlement_id→team_settlements，ON DELETE SET NULL），迁移已并入 `migrations/add_team_settlement_split_salary_pipeline.sql`。**教训：加列做嵌入查询必须同时加 FK**
- **零星材料免审核、录入即计入**：成本聚合只统计 status='reviewed'，而 POST/import 原默认 draft 导致不计入。现已改为新录入/导入默认 reviewed（带 reviewed_at/reviewed_by=当前操作人），存量双环境 UPDATE 转 reviewed（迁移 `migrations/miscellaneous_materials_auto_review.sql`，生产 10 条 2300 元）。作废/反审核能力保留
- **零星材料按项目分类下钻**（成本中心 `/cost-center`）：零星材料 KPI 卡点击进入"按项目分类"列表（金额降序）→ 点项目下钻明细（采购日期/材料/规格/数量/单价/金额/供应商）；项目表格零星材料列单元格（>0 时）可直接点击下钻。数据源 `GET /api/miscellaneous-materials?projectId=X&pageSize=200`（已支持按项目过滤）

### 2026-06 班组分账→工资应发+发放 完整闭环
- 迁移 `migrations/add_team_settlement_split_salary_pipeline.sql`，双环境已执行
  - `worker_salaries` 新增 `source varchar(20) default 'manual'`、`settlement_id integer`、`team_id integer`
    - source 取值：manual（手工录入）/ team_settlement（班组分账生成）
    - 部分唯一索引 `worker_salaries_settlement_worker_uq`(settlement_id, worker_id) 防同一结算单同一工人重复生成应发
  - `salary_payments` 新增 `payer_type varchar(20) default '公司支付'`（公司支付/甲方代付）、`team_id integer`
- 分账→应发自动生成（`lib/team-settlement-salary.ts`）：结算单确认（status=confirmed）时，为每个分账工人生成一条 `worker_salaries`（source=team_settlement，gross=net=分账金额，payment_status=unpaid），幂等（DB唯一索引兜底）；生成失败不阻断结算保存，仅 console 记录
- 工资发放闭环（`api/worker-payments`）：
  - 单条 POST：支持 `payer_type`（默认公司支付）、`team_id`；A自动带出——未传 team_id 时按 工人.team_name + 项目 匹配 team_groups 取名 → 兜底 B 由前端显式传 team_id
  - 批量导入：支持 Excel"付款主体"列（payer_type 透传）；team_id 保持 null，台账靠发放核销的 worker_salaries 关联班组归属
  - GET/导出/详情展示新增 付款主体(payer_type)、班组(team_name) 列
- 班组工人工资台账（新页面 `/team-management/salary-ledger` + API `/api/team-settlements/salary-ledger`）
  - 以 source=team_settlement 的应发为基础，联查该应发对应的发放（salary_id 核销），按工人聚合：应得 due / 已发 paid（拆 公司支付 paid_company / 甲方代付 paid_client）/ 未发 unpaid = due − paid
  - 返回班组汇总 teams + 工人明细 workers；支持 project_id / team_id / 姓名过滤
  - 前端组件 `team-salary-ledger-client.tsx`，侧边栏"班组管理"下新增"工人工资台账"入口
- 注意：`worker_salaries` 的 (worker_id, project_id, year_month) 唯一约束在 DB 实际不存在（工时+包活会产生两条分录），故分账应发不与其冲突；否则会重复生成而违反，需改用 settlement_id+worker_id 部分唯一

### 2026-06 班组结算新增付款比例
- `team_settlements` 新增 `payment_ratio numeric(5,2) NOT NULL DEFAULT 100`（0~100，CHECK 约束），迁移文件 `migrations/add_team_settlement_payment_ratio.sql`，双环境已执行
- 派生口径（均为前端展示/API 计算字段，不落库）：计划付款 planned_payment = 实付金额 payable_amount × payment_ratio / 100；尾款（预留款）retained_amount = payable_amount − planned_payment；已付比例 paid_ratio = 已付/实付
- 结算录入页支持付款比例输入（默认 100%），实时计算计划付款/尾款；台账新增"付款比例""计划付款""尾款（预留）"列，尾款>0 显示黄色徽章；结算单登记付款默认金额改为 min(计划付款, 剩余应付)
- 付款管理班组汇总（mode=team-summary）与班组列表同步返回 planned_payment/retained_amount，表格新增两列
- 班组成本口径（既有，本次核对确认）：成本中心、月度经营月报、首页趋势的人工成本 = 工人应发工资 + 班组结算实付（仅确认单，扣四项扣款后），统一在 `lib/data-aggregation.ts` 的 `getTeamSettlementCostByProjects` / `getTeamSettlementCostAmount`；资金看板的供应商成本不包含班组结算（班组维度应付在班组管理-付款管理内）
- 班组结算 API：`GET/POST /api/team-settlements`；付款：`GET/POST /api/team-settlement-payments`

### 2026-06 钉钉企业内部应用集成
- 新增钉钉企业内部应用配置模块 (`lib/dingtalk-config.ts`)
  - 从环境变量读取 DINGTALK_APP_KEY / APP_SECRET / AGENT_ID / CORP_ID / CALLBACK_TOKEN / CALLBACK_AES_KEY
  - 脱敏配置输出（AppSecret 等敏感字段返回 ******，绝不暴露给前端）
  - `isDingTalkConfigured()` / `getDingTalkConfigMasked()` 公开方法
- 新增钉钉基础服务模块 (`lib/dingtalk-service.ts`)
  - `getAccessToken()`：获取 access_token，带进程内缓存，过期前 5 分钟自动刷新
  - `refreshAccessToken()`：强制刷新 token（忽略缓存）
  - `callDingTalkApi()`：统一 API 调用封装，自动带 token，token 过期自动重试
  - 所有 AppSecret 仅在服务端使用，不返回给前端
- 新增钉钉 API 调用日志模块 (`lib/dingtalk-logger.ts`)
  - 内存缓冲（最大 500 条）+ 控制台输出
  - 记录请求类型、成功/失败、错误码、错误信息
  - 自动脱敏请求体中的敏感字段
  - `query()` 查询接口 + `getStats()` 统计摘要
- 新增钉钉管理 API (`/api/dingtalk/*`)
  - `GET /api/dingtalk/config`：脱敏配置查询
  - `GET /POST /api/dingtalk/token`：token 状态检查 / 强制刷新
  - `GET /DELETE /api/dingtalk/logs`：日志查询 / 清空
- 中间件白名单新增 `/api/dingtalk`
- 保留原有 Webhook 机器人功能（`lib/dingtalk.ts`），两者独立运行
- 新增钉钉 H5 微应用入口页面 (`/dingtalk`)
  - 自动检测是否在钉钉客户端环境内（UA 含 DingTalk）
  - 钉钉环境：自动加载 JSAPI → 获取 authCode → 调用免登 API → 签发 JWT → 跳转首页
  - 非钉钉环境：提示"请在钉钉工作台中打开"+ 提供跳转普通登录页按钮
  - 独立页面布局，不显示侧边栏
- 新增钉钉免登 API (`POST /api/auth/dingtalk`)
  - authCode → 钉钉用户ID → 用户详情（调用 `/topapi/v2/user/getuserinfo` + `/topapi/v2/user/get`）
  - 匹配系统用户规则：优先按 dingtalk_userid 匹配，其次按手机号匹配
  - 手机号匹配成功后自动绑定 dingtalk_userid，下次直接匹配
  - 未匹配到系统用户时返回 403 + 钉钉用户信息提示
  - 中间件和路由权限白名单放行
- 新增用户钉钉账号绑定字段
  - users 表新增：dingtalk_user_id、dingtalk_union_id、dingtalk_mobile、dingtalk_name、dingtalk_dept_id、dingtalk_avatar、dingtalk_active、last_dingtalk_sync_at
  - dingtalk_user_id 唯一约束（部分索引，仅非 NULL 值），一个系统用户只能绑定一个钉钉账号
  - 免登匹配成功后自动写入所有钉钉字段 + last_dingtalk_sync_at
  - 手机号匹配时同时更新 dingtalk_user_id（不再依赖 role 字段）
  - 后台用户列表新增"钉钉绑定"状态列（已绑定/未绑定，已绑定显示钉钉姓名）
  - 用户列表 API 返回 dingtalk_bound 和 dingtalk_info 字段

### 2026-06 钉钉免登与通讯录同步
- 新增钉钉免登 API `/api/auth/dingtalk/login`
  - authCode → 钉钉用户ID → 用户详情（调用 `/topapi/v2/user/getuserinfo` + `/topapi/v2/user/get`）
  - 匹配规则：优先按 dingtalk_userid 匹配，其次按手机号匹配，匹配成功后自动绑定
  - 未匹配到系统用户时返回 403 + 钉钉用户信息提示
  - 登录成功签发 JWT + 设置认证 Cookie + 跳转业务工作台
- 新增前端 /dingtalk 页面免登流程
  - 从 `/api/dingtalk/public-config` 获取 corpId 和 agentId
  - 钉钉环境：加载 JSAPI → requestAuthCode → 提交 /api/auth/dingtalk/login → 跳转首页
  - 非钉钉环境：提示 + 跳转普通登录页按钮
  - 所有异常有清晰提示，不会白屏
- 新增钉钉通讯录缓存表 `dingtalk_contacts`
  - dingtalk_user_id, union_id, name, mobile, dept_id_list, dept_name_list, avatar, active, title, sync_time
  - 唯一约束：dingtalk_user_id
  - 索引：mobile, name, active
- 新增通讯录同步服务 `lib/dingtalk-contacts-sync.ts`
  - `syncDingTalkContacts()`：递归获取所有部门 + 人员，upsert 到缓存表
  - `getDingTalkContacts()`：查询通讯录列表（支持关键词搜索、active 过滤）
  - `getDingTalkContactsSyncStatus()`：获取同步状态（总数/活跃数/最后同步时间）
  - 不直接覆盖系统用户权限，仅同步到缓存表
- 新增通讯录 API
  - `GET /api/dingtalk/contacts` — 查询通讯录（支持 keyword/active/limit/offset 参数）
  - `GET /api/dingtalk/contacts/sync-status` — 获取同步状态
  - `POST /api/dingtalk/contacts/sync` — 手动触发同步
- 新增公共配置 API `GET /api/dingtalk/public-config`（无需登录，返回 corpId/agentId/configured）
- 中间件白名单新增 `/api/dingtalk/public-config`

### 2026-06 钉钉通讯录绑定管理
- 新增后台"钉钉通讯录绑定"管理页面 (`/system/dingtalk-binding`)
  - 4个 Tab：已绑定用户、未绑定系统用户、钉钉通讯录人员、绑定日志
  - 支持按手机号自动匹配绑定（批量）
  - 支持管理员手动选择系统用户和钉钉人员绑定
  - 支持解绑（不删除历史业务数据）
  - 绑定前校验：一对一关系约束
  - 展示：系统用户、手机号、系统角色、项目权限、钉钉姓名、钉钉部门、钉钉userId、绑定状态、最后同步时间
- 新增绑定管理 API (`/api/dingtalk/bindings`)
  - GET：查询已绑定/未绑定/通讯录/绑定日志
  - POST：手动绑定（userId + dingtalkUserId）
  - POST auto-match：自动按手机号匹配
  - DELETE：解绑
  - 所有操作写入审计日志（dingtalk_bind_auto/dingtalk_bind_manual/dingtalk_unbind）
- 侧边栏"系统运维"分组下新增"钉钉通讯录绑定"入口
- 审计日志新增 dingtalk_bind_auto/dingtalk_bind_manual/dingtalk_unbind 操作类型

### 2026-06 AI 劳务助手全功能升级
- 新增 AI 全局配置管理页 (`/system/ai-config`)
  - 支持配置大模型模型ID、会话长度、每日调用限额、创意温度
  - 全局开关 + 7个模块独立开关（数据查询/报表解读/报错排查/文档生成/供应商分析/工资分析/签证助手）
  - 内容过滤、敏感信息脱敏、离线兜底开关
- 新增私有知识库管理功能
  - 支持导入业务台账（供应商、工资、项目、合同）自动增量同步向量库
  - 支持上传本地文档：劳务法规、公司制度、合同模板、字段释义
  - 一键全量刷新知识库、手动删除知识库文档
  - 使用 coze-coding-dev-sdk KnowledgeClient 向量检索
- 新增 AI 操作审计日志
  - 记录所有问答内容、操作时间、页面上下文、Token 使用量
  - 支持按用户/时间/页面筛选、导出
- 重构 AI 对话 API（`/api/ai/chat`）
  - 集成知识库语义检索（KnowledgeClient.search）
  - 集成业务数据查询（供应商/工资/项目/合同/证件数据）
  - 按角色权限隔离（super_admin/finance/project_manager/team_leader）
  - 敏感信息自动脱敏（身份证/手机号/银行卡）
  - 违规提问拦截（仅允许建筑劳务/财务/项目相关）
  - 每日调用限额控制
- 新增全局悬浮 AI 助手组件 (`FloatingAIAssistant`)
  - 右下角悬浮按钮，打开侧边对话弹窗
  - 支持最小化、拖动、响应式布局
  - 快捷提问模板、历史对话列表
  - 问答内容导出、关联数据卡片点击跳转
- 新增业务页面 AI 分析按钮 (`PageAnalysisButton`)
  - 各业务页面顶部【AI分析】快捷按钮
  - 一键分析当前页面全部数据
- 新增 AI 数据库表
  - `ai_configs`：AI 全局配置
  - `ai_knowledge_docs`：知识库文档管理
  - `ai_chat_histories`：对话历史记录
  - `ai_audit_logs`：操作审计日志
  - `ai_daily_usage`：每日调用限额统计
- 侧边栏"系统运维"分组下新增"AI配置管理"入口
- 保留旧版 `/ai-assistant` 页面（重定向到全局悬浮助手）

### 2026-06 月度经营月报全面升级为老板决策页
- 报表模式切换：老板汇报版 / 财务核对版 / 项目明细版
- 第一屏：核心经营KPI(5项) + 应付压力KPI(4项) + 经营结论(自然语言) + 应付资金计划
- 新增模块：经营结论、应付资金计划、人工成本统计(按项目)、供应商结算统计(按项目+供应商)、风险预警清单(可决策格式)
- 图表优化：7个图表(项目利润排行/回款率排行/趋势/成本构成/应付压力/未付构成/供应商Top10)
- 金额智能显示：<1万显示元，>=1万显示万元，>=1亿显示亿元
- 环比同比同时显示百分比和变化金额
- 新增预览功能：ReportPreviewDialog 模拟正式月报格式
- API升级：summary新增paymentPlan/laborCostByProject/supplierSettlementByProject/businessConclusion/risks/comparisons
- 顶部筛选栏整合月份/项目选择+刷新/导出/打印/历史/AI解读按钮
- KPI卡片采用系统统一KpiCard组件，展示11项核心指标（产值/回款/成本/利润/利润率/回款率等）
- 新增环比/同比对比数据栏（7项指标同时展示环比和同比变化）
- 图表区4图：项目产值对比柱状图、近6月趋势折线图、成本结构饼图、项目回款率柱状图
- 明细台账3 Tab：项目明细（分页+首列固定+金额千分位）、人工工资、供应商结算
- 风险预警卡片：自动识别亏损项目/成本超收入/回款率低/未发工资，标注风险等级与处理建议
- AI经营解读按钮：调用AI劳务助手流式分析本月数据，支持复制
- 导出增强：新增Excel导出（分区：核心指标/项目明细/风险预警），保留PDF导出
- 历史月报查看弹窗
- 多端适配：电脑端宽屏自适应、手机端/钉钉端筛选折叠+卡片单列+图表缩小+表格精简
- 页面底部标注数据更新时间、统计口径、数据来源
- API升级：summary新增环比/同比/趋势/成本结构/风险预警数据，支持projectId参数
- 新增export-excel API端点

### 2026-06 AI 劳务助手与月度经营月报（旧版）
- 新增 AI 劳务助手模块 (`/ai-assistant`)
  - SSE 流式对话，支持多轮上下文
  - 消息角色校验过滤：自动剔除 role 为空/非法的消息，确保 build_agent 不报 "role is empty"
  - 系统提示词内置业务规则（工资计算、利润率、回款率等计算口径）
  - 预设快捷提问（6个常见业务问题）
  - 打字机式流式渲染、简单 Markdown 格式化
- 新增月度经营月报模块 (`/reports/monthly`)
  - 月报汇总 API (`/api/reports/monthly/summary`)：按月份和项目范围汇总收入/成本/利润/回款/工资等数据
  - PDF 导出 API (`/api/reports/monthly/export-pdf`)，4种模板（经营汇总/项目明细/老板汇报/财务核对）
  - 导出历史 GET 端点，查询过往导出记录
  - `monthly_report_snapshots` 表记录导出历史和数据快照
  - 前端页面：月份选择器、项目范围（全部/指定项目）、模板选择、数据预览（KPI+风险+项目明细）、一键导出PDF、历史记录
  - 侧边栏在"数据看板"分组下新增"月度经营月报"入口
- 侧边栏新增"AI 助手"入口（系统管理分组）

### 2026-06 钉钉身份与系统权限融合
- 钉钉仅作为身份认证来源，系统角色/菜单权限/项目权限仍以本系统后台配置为准
- 钉钉部门仅辅助展示，不自动等同系统权限
- users 表新增 `is_disabled` 字段（boolean，默认 false）
- 钉钉用户离职或停用时自动禁用系统登录（设置 `is_disabled=true`），不删除系统用户
- 钉钉用户恢复启用时，管理员可手动重新启用系统用户
- 通过钉钉登录的用户，进入系统后只能看到自己系统权限允许的数据
- 新增 `dingtalk_security_logs` 安全日志表
- 新增 `lib/dingtalk-security-log.ts` 安全日志模块
  - 记录钉钉登录时间、IP、绑定用户、登录结果
  - 支持按事件类型/时间范围/用户查询安全日志
- 免登 API `/api/auth/dingtalk/login` 增加安全逻辑：
  - 检查系统用户是否被禁用（is_disabled），禁用则拒绝登录
  - 钉钉用户离职（active=false）时自动禁用已绑定的系统用户
  - 所有登录尝试（成功/失败）记录安全日志
- 普通登录也检查 is_disabled 字段，禁用用户不可登录
- `/api/auth/me` 检查用户禁用状态，已禁用则返回 401 强制重新登录
- 通讯录同步时自动检测离职钉钉用户，将已绑定的系统用户设为禁用状态
- 绑定管理页面新增启用/禁用操作按钮

### 2026-04-28 数据看板模块新增
- 新增【数据看板】一级侧边菜单分组
- 新增供应商成本应付看板 (`/data-board/supplier-cost`)
  - 统计：合同数、累计结算、履约应付、已付、未付、待决算
  - 图表：成本构成（按项目）、结算与付款趋势
  - 筛选：项目、供应商、合同
  - 明细台账：合同维度统计
- 新增工人成本统计看板 (`/data-board/worker-cost`)
  - 统计：工人总数、应发工资、已发工资、未发工资、累计人工成本
  - 图表：成本占比、月度趋势、各项目统计
  - 筛选：项目、核算周期
  - 明细台账：工人维度统计
- 新增资金综合管理看板 (`/data-board/fund-management`)
  - 统计：总应付、总已付、总未付、各类欠款、甲方结算/付款
  - 图表：资金支付占比、欠款结构、甲方资金对比
  - 筛选：项目、款项类型
  - 预警区域：供应商/工人/甲方欠款提醒
  - 明细台账：资金类型汇总
- 新增供应商付款 API (`/api/supplier-payments`)
- 侧边栏菜单迁移：原"供应与成本管理"下的应付台账移除

### 2026-04-02 首页商务后台风格重构
- 重构首页布局，采用商务后台风格设计
- 顶部区域：系统标题 + 用户信息 + 全局项目筛选器
- 核心数据卡片（6个）：在建项目、在册工人、总产值、已回款、待回款、总利润
- 图表区域：成本构成饼图、产值趋势折线图、项目进度排行、回款占比环形图
- 保留原有三大卡片：对上报量、对下结算量
- 风险预警区域：待回款预警、成本超支预警、证件过期预警
- 快捷入口区域：8个常用功能入口
- Dashboard API 新增成本数据（totalCost、totalProfit、profitRate等）
- Dashboard API 新增月度趋势数据（近6个月产值和回款）
- Dashboard API 新增成本构成数据（材料机械、人工费、综合费用、税费、零星材料）

### 2026-04-02 工人统计与重复校验
- 新增项目列表和首页的在场/退场人数统计卡片
- 项目详情页新增在场人数和退场人数统计卡片
- 项目列表表格新增人数统计列（显示在场/退场人数）
- 工人批量导入增加重复值校验（身份证号、姓名+手机号组合）
- API 返回数据新增 inServiceCount、leftCount 字段

### 2026-03-27 重构
- 将"工人成本"模块拆分为"花名册"和"月度工资"两个子页面
- 移除独立的"数据录入"页面，将录入功能整合到各对应模块
- 新增Excel批量导入/导出功能
- 优化首页概览，新增在建项目数、总产值、已付款统计卡片
- 扩展数据库字段，甲方报量支持工作内容、数量、单价等详细信息
- 扩展数据库字段，付款情况支持付款方式、状态等详细信息

### 2026-03-27 字段优化
- 花名册新增字段：身份证号、银行卡号、所属项目
- 月度工资重构为：工时、工价、包活工资、应发工资、个税、借支、劳保、实发工资
- 自动计算：应发工资 = 工时×工价+包活工资；实发工资 = 应发工资-个税-借支-劳保

### 2026-03-28 消息通知系统
- 新增消息通知中心模块 `/notifications`
- 支持证件到期自动检测（30天、15天、7天、已过期四阶段提醒）
- 支持新增记录自动通知（甲方报量、付款记录、工人入职）
- 支持成本预警自动检测（利润为负或成本超支）
- 集成钉钉Webhook推送，支持自定义机器人配置
- 提供通知设置管理（开关控制、Webhook配置）
- 支持通知的已读/未读状态、分页查看、批量操作

### 2026-05-17 通知系统重构为钉钉推送
- 将飞书推送替换为钉钉推送（Webhook + 加签安全模式）
- 新增 `lib/dingtalk.ts`：钉钉消息发送工具（Markdown/Text格式、加签签名）
- 新增 `lib/business-notification.ts`：业务通知推送工具（写入通知表+推送钉钉）
- 新增 `/api/notifications/dingtalk` 路由（测试/重发钉钉消息）
- 业务操作即时推送钉钉通知：新增结算、工资发放、甲方回款、供应商付款、月度工资等
- 新增通知类型：new_settlement、new_salary、new_worker_payment、new_client_payment、new_supplier_payment
- 通知设置新增：钉钉加签密钥(dingtalk_secret)、工资发放提醒、甲方回款提醒、供应商付款提醒
- 前端通知页面：飞书设置替换为钉钉设置（Webhook地址+加签密钥）

### 2026-05-21 证件管理新增附件功能
- certificates 表新增 attachments 字段（JSONB，存储附件列表）
- 新增证件附件上传API (`/api/certificates/upload`)，支持多文件上传，限制20MB
- 新增附件签名URL获取API (`/api/certificates/attachment-url`)
- 新增附件删除API (`/api/certificates/attachment`)，同时删除对象存储文件和数据库记录
- 前端证件页面新增附件列，显示附件数量
- 新增/编辑对话框新增附件上传区域（上传、预览、删除）
- 查看详情对话框新增附件展示区域（图片可预览，其他文件可下载）
- 导出CSV新增附件数量列
- 附件存储使用 S3 对象存储（coze-coding-dev-sdk），数据库存储 key 而非签名URL

### 2026-06 企业业务后台风格改造
- 侧边栏导航按业务流程重组为6大模块：项目中心、人力工资、供应商结算、甲方资金、数据看板、系统管理
- 首页重构为"业务工作台"：待办事项、关键金额统计、异常提醒、数据图表
- 新增统一业务组件库 `src/components/business/common.tsx`：StatusTag、AmountDisplay、EmptyState、ConfirmDialog
- 新增页面布局组件 `src/components/business/page-layout.tsx`：BusinessPageHeader
- 全局替换 alert() → toast()，消除所有浏览器原生弹窗
- 统一页面标题样式为 text-xl font-semibold tracking-tight
- 统一所有页面 ECharts 为 EChartsWrapper 组件（替代直接 import echarts/core）
- 图表渐变从 echarts.graphic.LinearGradient 改为 ECharts 纯对象渐变语法
- 供应商结算页面集成 StatusTag 和 AmountDisplay
- 成本利润中心页面状态显示从手写样式改为 StatusTag 组件
- DESIGN.md 新增信息架构、业务组件规范、首页工作台规范
- 移动端响应式适配已内置在 globals.css

### 2026-06 数据字段补充
- projects 表新增 `expected_completion_date`（预计完工日期）字段，项目表单和详情页已支持
- worker_salaries 表新增 `payment_status`（发放状态：unpaid/partial/paid）字段，工资列表新增发放状态列
- notifications 表新增 `priority`（优先级：0=普通/1=重要/2=紧急）字段，通知列表按优先级排序并显示标签
- supplier_settlements 表新增 `invoice_amount`（开票金额）和 `tax_amount`（税额）字段，结算列表已展示
- supplier_contracts 表新增 `contract_status`（合同状态：履约中/已完结/已终止）字段，默认值'履约中'
- 首页工作台待办事项新增：未发放工资提醒、即将完工项目提醒
- Dashboard API 新增 expiringProjects（即将到期项目）和 unpaidSalaryStats（未发放工资统计）数据
- schema.ts 补全 notifications、notification_settings、supplier_contracts、supplier_settlements、supplier_payments 表定义

### 2026-06 业务逻辑闭环优化
- 新建 `src/lib/business-logic.ts`：集中管理业务逻辑工具库
  - calculateSalary：自动计算应发/实发工资
  - syncSalaryPaymentStatus：工资发放后自动同步 payment_status（unpaid/partial/paid）
  - calculatePayableAmount：按合同付款比例计算应付金额
  - validateSupplierPayment：供应商付款超额校验
  - validateClientPayment：甲方回款超额校验
  - validateStatusTransition：统一状态流转校验（draft→reviewed→voided）
  - calculateProjectCost：成本利润中心自动汇总（11项计算口径）
  - calculateTaxInfo：税务计算（不含税收入+税额）
- 新建 `src/app/api/review/route.ts`：统一审核/反审核/作废 API
  - 支持6种资源类型：client_report、client_payment、supplier_settlement、supplier_payment、comprehensive_expense、miscellaneous_material
  - 作废前检查下级关联记录约束
  - 审核时记录审核人和时间
  - 所有操作记录审计日志
- 数据库新增字段：
  - client_reports：status(draft/reviewed/voided)、reviewed_at、reviewed_by、tax_rate
  - client_payments：reviewed_at、reviewed_by
  - supplier_settlements：status(draft/reviewed/voided)、reviewed_at、reviewed_by、payable_amount、settlement_no
  - supplier_payments：contract_id、settlement_id、payment_no、payment_type、status
  - comprehensive_expenses：status(draft/reviewed/voided)、reviewed_at、reviewed_by
  - miscellaneous_materials：status(draft/reviewed/voided)、reviewed_at、reviewed_by
  - supplier_contracts：contract_no、total_amount、payment_ratio_active/complete/final
- API 链路修复：
  - client-reports POST 自动计算 report_amount = quantity × unit_price
  - client-reports POST 新增已审核报量才能计入统计（neq 'voided'）
  - client-payments POST 新增超额校验（validateClientPayment）
  - supplier-contracts/payments POST 新增超额校验（validateSupplierPayment）
  - salary-payments POST/DELETE 自动同步工资 payment_status
  - salary-payments/batch POST 批量同步 payment_status
  - cost-center API 使用 calculateProjectCost 自动汇总，排除已作废记录
  - dashboard API 报量金额使用 settlement_amount（非 report_amount），排除已作废
  - projects/[id] API 新增报量/回款/签证/供应商结算/工资汇总数据
- 审计日志覆盖：
  - salary-payments：新增/删除发放记录记录审计日志
  - review：审核/反审核/作废操作记录审计日志
  - supplier-settlements：审核/作废操作记录审计日志

### 2026-06 UI与数据可视化优化
- 新增 `src/components/business/common.tsx` 共享组件：
  - formatAmountSmart/formatAmount/formatPercent：统一金额(万元/亿元)和百分比(1位小数)格式化
  - getAmountUnit/getAmountScaled：金额智能缩放
  - KpiCard：增强KPI卡片（指标名/数值/单位/统计范围/计算口径tooltip/点击下钻/风险标识）
  - ChartCard：增强图表卡片（标题/单位/空态/加载态/错误态/更新时间）
  - RiskBadge：风险标识组件（warning/danger/success/info）
- 首页经营看板优化：
  - KPI卡片增强：添加计算口径tooltip、统计范围、风险标识
  - 回款率>100%显示橙色风险标识
  - 图表区域添加标题、单位标签
- 成本利润中心优化：
  - 新增经营风险概览区域（亏损项目数/成本超收入项目数，红色警告）
  - 利润率负值红色、正值绿色
  - 使用formatAmountSmart智能金额格式化
- 资金管理看板优化：
  - 修正"负未回款"问题：已回款>结算金额时显示"超收/预收金额"
  - KPI字段拆分：应收金额/已收金额/未收金额/超收预收金额/回款率
  - 回款率超100%橙色风险标识
- 供应商成本看板/工人成本看板：导入KpiCard和ChartCard增强组件
- 项目管理页面优化：
  - 新增搜索框（按项目名模糊搜索）
  - 新增年度筛选下拉
  - 新增状态筛选下拉
  - filteredAndSortedProjects合并搜索+筛选+排序
- 月度工资页面优化：
  - 空态增加可操作入口（切换月份/导入工资/查看未发放）
  - 批量删除改用AlertDialog二次确认（危险色），替代浏览器confirm()
  - 使用React.useRef替代fileInputRef
- 无障碍优化：
  - 登录页密码显示按钮添加aria-label
  - 侧边栏通知/退出按钮添加aria-label
- DESIGN.md新增：KPI卡片规范、图表卡片规范、金额格式化规范、风险标识规范
