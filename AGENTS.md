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

2. **workers** - 工人表（花名册）
   - id: 主键
   - name: 姓名
   - work_type: 工种
   - id_card: 身份证号
   - phone: 联系电话
   - bank_card: 银行卡号
   - project_id: 所属项目ID（外键）

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

10. **ai_configs** - AI全局配置表
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
