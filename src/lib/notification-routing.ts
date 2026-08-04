export type WorkbenchTodoKey =
  | 'constructionLogsPending'
  | 'monthlyReportsPending'
  | 'visasPending'
  | 'knowledgePending'
  | 'businessNotificationsPending';

export type DingTalkChannel = 'personal' | 'robot' | 'none';

export type NotificationRouteRule = {
  type: string;
  label: string;
  description: string;
  settingKeys: string[];
  mode: '实时触发' | '定时生成' | '定时汇总' | '通道开关';
  trigger: string;
  target: string;
  channel: DingTalkChannel;
  channelLabel: string;
  detail: string;
  href: string;
  workbenchTodoKey?: WorkbenchTodoKey;
  workbenchTodoLabel?: string;
  cron?: string;
  bindingConfigurable?: boolean;
  includeInTodoDigest?: boolean;
};

export const NOTIFICATION_ROUTE_RULES: NotificationRouteRule[] = [
  {
    type: 'construction_log_alert',
    label: '施工日志风险',
    description: '施工日志识别出风险后自动提醒',
    settingKeys: ['cost_warning_enabled', 'new_record_reminder_enabled'],
    mode: '实时触发',
    trigger: '施工日志提交后识别到风险内容',
    target: '项目绑定预算员',
    channel: 'personal',
    channelLabel: '钉钉个人工作通知',
    detail: '按项目角色中的预算员接收，不因超级管理员可看全部项目而默认接收全部提醒。',
    href: '/construction-logs?tab=risks&status=pending',
    workbenchTodoKey: 'constructionLogsPending',
    workbenchTodoLabel: '施工日志待确认',
    bindingConfigurable: true,
    includeInTodoDigest: true,
  },
  {
    type: 'construction_log_comment',
    label: '施工日志评论',
    description: '施工日志新增评论后自动提醒',
    settingKeys: ['construction_log_comment_reminder_enabled', 'new_record_reminder_enabled'],
    mode: '实时触发',
    trigger: '有人在施工日志详情中发表评论',
    target: '日志作者、项目预算员、项目经理等相关人员',
    channel: 'personal',
    channelLabel: '钉钉个人工作通知',
    detail: '评论提醒落到施工日志待办，提醒相关人员及时查看和补充说明。',
    href: '/construction-logs?tab=logs',
    workbenchTodoKey: 'constructionLogsPending',
    workbenchTodoLabel: '施工日志待确认',
    bindingConfigurable: true,
    includeInTodoDigest: true,
  },
  {
    type: 'monthly_analysis_workflow',
    label: '月度分析流转',
    description: '月度分析提交、确认、退回等节点提醒',
    settingKeys: ['new_record_reminder_enabled'],
    mode: '实时触发',
    trigger: '预算员、项目经理、老板提交下一步时',
    target: '当前流程节点负责人',
    channel: 'personal',
    channelLabel: '钉钉个人工作通知',
    detail: '按流程当前负责人推送，工作台进入月度分析待处理，避免和普通知识库经验混在一起。',
    href: '/knowledge?status=pending',
    workbenchTodoKey: 'monthlyReportsPending',
    workbenchTodoLabel: '月度分析待处理',
    bindingConfigurable: true,
    includeInTodoDigest: true,
  },
  {
    type: 'visa_workflow',
    label: '签证流程流转',
    description: '签证提交、签字、确认等节点提醒',
    settingKeys: ['visa_reminder_enabled', 'new_record_reminder_enabled'],
    mode: '实时触发',
    trigger: '签证流程进入下一处理节点',
    target: '项目经理 / 原发起预算员 / 当前负责人',
    channel: 'personal',
    channelLabel: '钉钉个人工作通知',
    detail: '签证流转只提醒当前需要推进的人，工作台进入签证待办理。',
    href: '/visas?todo=mine',
    workbenchTodoKey: 'visasPending',
    workbenchTodoLabel: '签证待办理',
    bindingConfigurable: true,
    includeInTodoDigest: true,
  },
  {
    type: 'visa_workflow_overdue',
    label: '签证超期推进',
    description: '签证超过期限未推进时自动提醒',
    settingKeys: ['visa_reminder_enabled', 'new_record_reminder_enabled'],
    mode: '定时生成',
    trigger: '定时检测发现签证超过期限未进入下一状态',
    target: '当前负责人',
    channel: 'personal',
    channelLabel: '钉钉个人工作通知',
    detail: '用于催办长时间停滞的签证事项，仍按当前负责人精准推送。',
    href: '/visas?todo=mine',
    workbenchTodoKey: 'visasPending',
    workbenchTodoLabel: '签证待办理',
    cron: '/api/notifications/check?force=true',
    bindingConfigurable: true,
    includeInTodoDigest: true,
  },
  {
    type: 'construction_daily_report',
    label: '项目日报汇总',
    description: '每天 12 点生成后推送到钉钉群',
    settingKeys: ['new_record_reminder_enabled', 'dingtalk_robot_broadcast_enabled'],
    mode: '定时生成',
    trigger: '每天 12 点截止后调用日报生成接口',
    target: '公司全员查看，群内广播',
    channel: 'robot',
    channelLabel: '钉钉群机器人',
    detail: '日报汇总属于公司级信息，只走群机器人广播，不进入个人待办，避免每个人收到重复个人催办。',
    href: '/construction-logs?tab=daily-reports',
    cron: '/api/construction-daily-reports/generate',
  },
  {
    type: 'new_settlement',
    label: '供应商结算新增',
    description: '新增供应商结算单后自动提醒',
    settingKeys: ['settlement_reminder_enabled', 'new_record_reminder_enabled'],
    mode: '实时触发',
    trigger: '新增供应商结算单',
    target: '消息类型绑定接收人，或业务流程指定人员',
    channel: 'personal',
    channelLabel: '钉钉个人工作通知',
    detail: '消息内容带供应商、项目、结算金额摘要，工作台进入经营消息待查看。',
    href: '/supplier-contracts/settlement',
    workbenchTodoKey: 'businessNotificationsPending',
    workbenchTodoLabel: '经营消息待查看',
    bindingConfigurable: true,
    includeInTodoDigest: true,
  },
  {
    type: 'new_supplier_payment',
    label: '供应商付款新增',
    description: '新增供应商付款记录后自动提醒',
    settingKeys: ['supplier_payment_reminder_enabled', 'payment_warning_enabled', 'new_record_reminder_enabled'],
    mode: '实时触发',
    trigger: '新增供应商付款记录',
    target: '消息类型绑定接收人，或业务流程指定人员',
    channel: 'personal',
    channelLabel: '钉钉个人工作通知',
    detail: '用于让经营、预算、财务及时知道供应商付款变化。',
    href: '/supplier-contracts/payment',
    workbenchTodoKey: 'businessNotificationsPending',
    workbenchTodoLabel: '经营消息待查看',
    bindingConfigurable: true,
    includeInTodoDigest: true,
  },
  {
    type: 'new_client_payment',
    label: '甲方回款新增',
    description: '新增甲方回款记录后自动提醒',
    settingKeys: ['client_payment_reminder_enabled', 'payment_warning_enabled', 'new_record_reminder_enabled'],
    mode: '实时触发',
    trigger: '新增甲方回款记录',
    target: '消息类型绑定接收人，或业务流程指定人员',
    channel: 'personal',
    channelLabel: '钉钉个人工作通知',
    detail: '用于同步项目回款变化，消息摘要带项目和回款金额。',
    href: '/client-payments',
    workbenchTodoKey: 'businessNotificationsPending',
    workbenchTodoLabel: '经营消息待查看',
    bindingConfigurable: true,
    includeInTodoDigest: true,
  },
  {
    type: 'new_worker_salary',
    label: '工资核算导入',
    description: '工资核算数据导入成功后自动提醒',
    settingKeys: ['salary_reminder_enabled', 'new_record_reminder_enabled'],
    mode: '实时触发',
    trigger: '导入工资核算数据',
    target: '消息类型绑定接收人，或业务流程指定人员',
    channel: 'personal',
    channelLabel: '钉钉个人工作通知',
    detail: '工资类消息不发群，避免工资信息扩散。',
    href: '/workers/salaries',
    workbenchTodoKey: 'businessNotificationsPending',
    workbenchTodoLabel: '经营消息待查看',
    bindingConfigurable: true,
    includeInTodoDigest: true,
  },
  {
    type: 'new_worker_payment',
    label: '工资发放导入',
    description: '工资发放数据导入成功后自动提醒',
    settingKeys: ['salary_reminder_enabled', 'new_record_reminder_enabled'],
    mode: '实时触发',
    trigger: '导入工资发放数据',
    target: '消息类型绑定接收人，或业务流程指定人员',
    channel: 'personal',
    channelLabel: '钉钉个人工作通知',
    detail: '工资发放消息只推个人工作通知，不进入群广播。',
    href: '/workers/payments',
    workbenchTodoKey: 'businessNotificationsPending',
    workbenchTodoLabel: '经营消息待查看',
    bindingConfigurable: true,
    includeInTodoDigest: true,
  },
  {
    type: 'todo_digest',
    label: '待办事项汇总',
    description: '定时汇总个人未读待办并推送',
    settingKeys: ['todo_digest_enabled', 'dingtalk_enabled'],
    mode: '定时汇总',
    trigger: '定时汇总每个人未读待办',
    target: '当前待办负责人',
    channel: 'personal',
    channelLabel: '钉钉个人工作通知',
    detail: '汇总内容只包含能在工作台承接的未读事项，减少杂乱消息。',
    href: '/workspace',
    cron: '/api/notifications/todo-digest',
  },
];

export const ROUTED_NOTIFICATION_TYPES = NOTIFICATION_ROUTE_RULES.map((rule) => rule.type);

export function getNotificationRouteRule(type?: string | null) {
  return NOTIFICATION_ROUTE_RULES.find((rule) => rule.type === type);
}

export function getNotificationRulesByTodoKey(todoKey: WorkbenchTodoKey) {
  return NOTIFICATION_ROUTE_RULES.filter((rule) => rule.workbenchTodoKey === todoKey);
}

export function shouldUseRobotBroadcast(type: string) {
  return getNotificationRouteRule(type)?.channel === 'robot';
}

export function shouldUsePersonalWorkNotice(type: string) {
  return getNotificationRouteRule(type)?.channel === 'personal';
}

export function isNotificationTypeEnabled(
  type: string,
  settings: Record<string, { enabled?: unknown } | undefined>,
) {
  const rule = getNotificationRouteRule(type);
  if (!rule) return null;
  return rule.settingKeys.some((key) => settings[key]?.enabled !== false);
}
