import { getSupabaseClient } from '@/storage/database/supabase-client';
import { sendDingTalkNotification, formatDingTalkMessage, type NotificationParams } from '@/lib/dingtalk';
import { sendDingTalkWorkNotification } from '@/lib/dingtalk-work-notification';
import { getNotificationSettingsMap, isNotificationSettingEnabled } from '@/lib/notification-settings';

type NotificationSeverity = 'info' | 'warning' | 'danger';
type NotificationRow = { id?: number | string; recipient_user_id?: number | null };
type SupabaseErrorLike = { message?: string; details?: string } | null;

function parseRecipientBindings(value?: string | null): Record<string, number[]> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    return Object.entries(parsed).reduce<Record<string, number[]>>((acc, [type, ids]) => {
      if (!Array.isArray(ids)) return acc;
      const normalizedIds = Array.from(
        new Set(
          ids
            .map((id) => Number(id))
            .filter((id) => Number.isInteger(id) && id > 0),
        ),
      );
      if (normalizedIds.length > 0) acc[type] = normalizedIds;
      return acc;
    }, {});
  } catch {
    return {};
  }
}

function getPriority(severity: NotificationSeverity) {
  if (severity === 'danger') return 2;
  if (severity === 'warning') return 1;
  return 0;
}

function shouldUseRobotBroadcast(type: string) {
  return ['construction_daily_report'].includes(type);
}

function toText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'string') return value.trim();
  return '';
}

function pickText(metadata: Record<string, unknown> | undefined, keys: string[]): string {
  if (!metadata) return '';
  for (const key of keys) {
    const value = toText(metadata[key]);
    if (value) return value;
  }
  return '';
}

function pickNumber(metadata: Record<string, unknown> | undefined, keys: string[]): number | null {
  if (!metadata) return null;
  for (const key of keys) {
    const raw = metadata[key];
    const value = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/[^\d.-]/g, ''));
    if (Number.isFinite(value) && value !== 0) return value;
  }
  return null;
}

function formatCurrency(value: number | null): string {
  if (value === null) return '';
  return `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}

function compactText(value: string, maxLength = 120): string {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function buildBusinessSummary(params: {
  type: string;
  title: string;
  content: string;
  projectName?: string;
  metadata?: Record<string, unknown>;
}) {
  const { type, title, content, projectName, metadata } = params;
  const explicitSummary = pickText(metadata, ['businessSummary', 'summary', 'notificationSummary', 'dingTalkSummary']);
  if (explicitSummary) return compactText(explicitSummary);

  const supplierName = pickText(metadata, ['supplierName', 'supplier_name', 'companyName', 'company_name']);
  const contractName = pickText(metadata, ['contractName', 'contract_name']);
  const visaNumber = pickText(metadata, ['visaNumber', 'visa_number']);
  const visaName = pickText(metadata, ['visaName', 'visa_name']);
  const workerName = pickText(metadata, ['workerName', 'worker_name', 'name']);
  const yearMonth = pickText(metadata, ['yearMonth', 'year_month', 'salaryMonth', 'salary_month', 'reportMonth', 'report_month']);
  const date = pickText(metadata, ['settlementDate', 'settlement_date', 'paymentDate', 'payment_date', 'reportDate', 'report_date', 'logDate', 'log_date']);
  const certificateType = pickText(metadata, ['certificateType', 'certificate_type']);
  const expiryDate = pickText(metadata, ['expiryDate', 'expiry_date']);
  const daysLeft = pickText(metadata, ['daysLeft', 'days_left']);
  const status = pickText(metadata, ['status', 'state', 'to', 'workflowState', 'workflow_state']);
  const riskLevel = pickText(metadata, ['riskLevel', 'risk_level']);
  const amount = formatCurrency(pickNumber(metadata, [
    'settlementAmount',
    'settlement_amount',
    'paymentAmount',
    'payment_amount',
    'amount',
    'payableAmount',
    'payable_amount',
    'visaAmount',
    'visa_amount',
    'net_pay',
    'gross_pay',
    'totalAmount',
    'total_amount',
  ]));

  switch (type) {
    case 'new_report':
      return compactText(`${projectName || '项目'}新增甲方报量${amount ? `，金额${amount}` : ''}${yearMonth ? `，月份${yearMonth}` : ''}`);
    case 'new_payment':
      return compactText(`${projectName || '项目'}新增付款记录${amount ? `，金额${amount}` : ''}${date ? `，日期${date}` : ''}`);
    case 'new_settlement':
      return compactText(`${supplierName || contractName || '供应商'}新增结算${amount ? `，金额${amount}` : ''}${date ? `，日期${date}` : ''}`);
    case 'certificate_expired':
      return compactText(`${workerName || '工人'}${certificateType || '证件'}已过期${expiryDate ? `，到期日${expiryDate}` : ''}${daysLeft ? `，已过期${Math.abs(Number(daysLeft) || 0)}天` : ''}`);
    case 'certificate_expiry_7':
    case 'certificate_expiry_15':
    case 'certificate_expiry_30':
      return compactText(`${workerName || '工人'}${certificateType || '证件'}即将到期${expiryDate ? `，到期日${expiryDate}` : ''}${daysLeft ? `，剩余${daysLeft}天` : ''}`);
    case 'new_supplier_payment':
      return compactText(`${supplierName || '供应商'}新增付款${amount ? `，金额${amount}` : ''}${date ? `，日期${date}` : ''}`);
    case 'new_client_payment':
      return compactText(`${projectName || '项目'}收到甲方回款${amount ? `，金额${amount}` : ''}${date ? `，日期${date}` : ''}`);
    case 'new_worker_salary':
    case 'new_salary':
      return compactText(`${yearMonth ? `${yearMonth} ` : ''}${workerName || '工人'}工资核算${amount ? `，金额${amount}` : ''}`);
    case 'new_worker_payment':
      return compactText(`${yearMonth ? `${yearMonth} ` : ''}${workerName || '工人'}工资发放${amount ? `，金额${amount}` : ''}${date ? `，日期${date}` : ''}`);
    case 'construction_log_alert':
      return compactText(`${projectName || '项目'}施工日志风险${riskLevel ? `（${riskLevel}）` : ''}：${content}`);
    case 'construction_daily_report':
      return compactText(`${date || pickText(metadata, ['reportDate']) || '当日'}项目日报汇总：${content}`);
    case 'monthly_analysis_workflow':
      return compactText(`月度分析流转${status ? `至${status}` : ''}：${content}`);
    case 'visa_workflow':
    case 'visa_workflow_overdue':
      return compactText(`签证流程提醒：${[visaNumber, visaName].filter(Boolean).join(' ') || '签证'}${status ? `，状态${status}` : ''}${amount ? `，金额${amount}` : ''}。${content}`);
    case 'cost_warning':
      return compactText(`${projectName || '项目'}成本预警${status ? `：${status}` : ''}。${content}`);
    case 'new_worker':
      return compactText(`${workerName || '工人'}入场${projectName ? `，项目${projectName}` : ''}`);
    default:
      return compactText(content || title);
  }
}

export function buildNotificationExtra(params: {
  type: string;
  title: string;
  content: string;
  projectName?: string;
  metadata?: Record<string, unknown>;
}): Record<string, string> | undefined {
  const { metadata } = params;
  const extra: Record<string, string> = {};
  const summary = buildBusinessSummary(params);
  if (summary) extra['业务摘要'] = summary;

  const targetNames = Array.isArray(metadata?.targetNames)
    ? metadata.targetNames.map(toText).filter(Boolean).join('、')
    : '';
  if (targetNames) extra['提醒对象'] = targetNames;

  const businessObject = pickText(metadata, [
    'supplierName',
    'supplier_name',
    'companyName',
    'company_name',
    'workerName',
    'worker_name',
    'contractName',
    'contract_name',
    'visaName',
    'visa_name',
    'certificateType',
    'certificate_type',
    'visaNumber',
    'visa_number',
  ]);
  if (businessObject) extra['业务对象'] = businessObject;

  const amount = formatCurrency(pickNumber(metadata, [
    'settlementAmount',
    'settlement_amount',
    'paymentAmount',
    'payment_amount',
    'amount',
    'payableAmount',
    'payable_amount',
    'visaAmount',
    'visa_amount',
    'net_pay',
    'gross_pay',
    'totalAmount',
    'total_amount',
  ]));
  if (amount) extra['金额'] = amount;

  const period = pickText(metadata, ['yearMonth', 'year_month', 'salaryMonth', 'salary_month', 'reportMonth', 'report_month']);
  if (period) extra['所属期间'] = period;

  const status = pickText(metadata, ['status', 'state', 'to', 'workflowState', 'workflow_state']);
  if (status) extra['当前状态'] = status;

  return Object.keys(extra).length > 0 ? extra : undefined;
}

function isMissingRecipientColumn(error: unknown) {
  const err = error as SupabaseErrorLike;
  const message = String(err?.message || err?.details || '');
  return message.includes('recipient_user_id') || message.includes('recipient_role');
}

export async function pushBusinessNotification(params: {
  type: string;
  title: string;
  content: string;
  severity?: NotificationSeverity;
  projectId?: number;
  relatedId?: number;
  relatedType?: string;
  recipientUserIds?: number[];
  recipientRole?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const {
      type,
      title,
      content,
      severity = 'info',
      projectId,
      relatedId,
      relatedType,
      recipientUserIds,
      recipientRole,
      metadata,
    } = params;

    const notificationSettings = await getNotificationSettingsMap(supabase, [
      'dingtalk_enabled',
      'dingtalk_webhook',
      'dingtalk_secret',
      'dingtalk_robot_broadcast_enabled',
      'dingtalk_recipient_bindings',
      'new_record_reminder_enabled',
      'settlement_reminder_enabled',
      'payment_warning_enabled',
      'salary_reminder_enabled',
      'client_payment_reminder_enabled',
      'supplier_payment_reminder_enabled',
      'cost_warning_enabled',
      'visa_reminder_enabled',
    ]);
    const configuredRecipientIds = parseRecipientBindings(notificationSettings.dingtalk_recipient_bindings?.value)[type] || [];
    const resolvedRecipientIds = recipientUserIds && recipientUserIds.length > 0
      ? recipientUserIds
      : configuredRecipientIds;
    const uniqueRecipientIds = Array.from(new Set((resolvedRecipientIds || []).filter(Boolean)));
    const baseNotification = {
      type,
      title,
      content,
      severity,
      priority: getPriority(severity),
      project_id: projectId || null,
      related_id: relatedId || null,
      related_type: relatedType || null,
      recipient_role: recipientRole || null,
      metadata: metadata || null,
    };

    const insertRows = uniqueRecipientIds.length > 0
      ? uniqueRecipientIds.map((userId) => ({ ...baseNotification, recipient_user_id: userId }))
      : [{ ...baseNotification, recipient_user_id: null }];

    let notificationRows: NotificationRow[] = [];
    let insertError: SupabaseErrorLike = null;
    const inserted = await supabase
      .from('notifications')
      .insert(insertRows)
      .select();

    if (inserted.error && isMissingRecipientColumn(inserted.error)) {
      const fallback = await supabase
        .from('notifications')
        .insert({
          type,
          title,
          content,
          severity,
          priority: getPriority(severity),
          project_id: projectId || null,
          related_id: relatedId || null,
          related_type: relatedType || null,
          metadata: metadata || null,
        })
        .select();
      notificationRows = fallback.data || [];
      insertError = fallback.error;
    } else {
      notificationRows = inserted.data || [];
      insertError = inserted.error;
    }

    if (insertError) {
      console.error('[Notification] Failed to insert:', insertError);
      return;
    }

    const isTypeEnabled = (key: string) => notificationSettings[key]?.enabled !== false;

    let shouldSend = false;
    if (['new_report', 'new_worker'].includes(type) && isTypeEnabled('new_record_reminder_enabled')) shouldSend = true;
    if (type === 'new_settlement' && (isTypeEnabled('settlement_reminder_enabled') || isTypeEnabled('new_record_reminder_enabled'))) shouldSend = true;
    if (['new_worker_salary', 'new_salary'].includes(type) && (isTypeEnabled('salary_reminder_enabled') || isTypeEnabled('new_record_reminder_enabled'))) shouldSend = true;
    if (type === 'new_worker_payment' && (isTypeEnabled('salary_reminder_enabled') || isTypeEnabled('new_record_reminder_enabled'))) shouldSend = true;
    if (type === 'new_client_payment' && (isTypeEnabled('client_payment_reminder_enabled') || isTypeEnabled('payment_warning_enabled') || isTypeEnabled('new_record_reminder_enabled'))) shouldSend = true;
    if (type === 'new_supplier_payment' && (isTypeEnabled('supplier_payment_reminder_enabled') || isTypeEnabled('payment_warning_enabled') || isTypeEnabled('new_record_reminder_enabled'))) shouldSend = true;
    if (type === 'cost_warning' && isTypeEnabled('cost_warning_enabled')) shouldSend = true;
    if (type === 'monthly_analysis_workflow' && isTypeEnabled('new_record_reminder_enabled')) shouldSend = true;
    if (type === 'construction_log_alert' && (isTypeEnabled('cost_warning_enabled') || isTypeEnabled('new_record_reminder_enabled'))) shouldSend = true;
    if (type === 'construction_daily_report' && isTypeEnabled('new_record_reminder_enabled')) shouldSend = true;
    if (['visa_workflow', 'visa_workflow_overdue'].includes(type) && (isTypeEnabled('visa_reminder_enabled') || isTypeEnabled('new_record_reminder_enabled'))) shouldSend = true;

    if (!isNotificationSettingEnabled(notificationSettings.dingtalk_enabled?.enabled, true)) shouldSend = false;

    if (!shouldSend) return;

    let projectName: string | undefined;
    if (projectId) {
      const { data: project } = await supabase
        .from('projects')
        .select('name')
        .eq('id', projectId)
        .single();
      projectName = project?.name;
    }

    const extra = buildNotificationExtra({ type, title, content, projectName, metadata });
    const notifParams: NotificationParams = {
      type,
      title,
      content,
      severity,
      projectName,
      extra,
    };

    const { title: msgTitle, text } = formatDingTalkMessage(notifParams);
    const notificationIds = notificationRows
      .map((notification) => notification.id)
      .filter((id): id is number | string => id !== undefined && id !== null);

    let robotSent = false;
    const canSendRobotBroadcast =
      shouldUseRobotBroadcast(type) &&
      isNotificationSettingEnabled(notificationSettings.dingtalk_robot_broadcast_enabled?.enabled, true);

    if (
      canSendRobotBroadcast &&
      notificationSettings.dingtalk_webhook?.value &&
      isNotificationSettingEnabled(notificationSettings.dingtalk_webhook?.enabled, true)
    ) {
      const result = await sendDingTalkNotification(
        notificationSettings.dingtalk_webhook.value,
        notificationSettings.dingtalk_secret?.value,
        msgTitle,
        text
      );
      robotSent = result.success;
    }

    const sentNotificationIds = new Set<number | string>();
    if (robotSent) {
      notificationIds.forEach((id) => sentNotificationIds.add(id));
    }

    if (uniqueRecipientIds.length > 0) {
      const { data: recipientUsers, error: recipientError } = await supabase
        .from('users')
        .select('id,dingtalk_user_id,is_disabled,dingtalk_active')
        .in('id', uniqueRecipientIds);

      if (recipientError) {
        console.error('[DingTalk Work] Failed to query recipients:', recipientError);
      } else {
        const systemUserIdByDingTalkId = new Map<string, number>();
        const dingtalkUserIds = (recipientUsers || [])
          .filter((user: { dingtalk_user_id?: string | null; is_disabled?: boolean | null; dingtalk_active?: boolean | null }) => {
            if (!user.dingtalk_user_id) return false;
            if (user.is_disabled === true) return false;
            if (user.dingtalk_active === false) return false;
            return true;
          })
          .map((user: { id: number; dingtalk_user_id: string }) => {
            systemUserIdByDingTalkId.set(String(user.dingtalk_user_id), user.id);
            return String(user.dingtalk_user_id);
          });

        const workResult = await sendDingTalkWorkNotification(dingtalkUserIds, notifParams);
        if (!workResult.success && workResult.errmsg && !workResult.missingConfig) {
          console.error('[DingTalk Work] Send failed:', workResult.errmsg);
        }

        const sentSystemUserIds = new Set(
          workResult.sentUserIds
            .map((dingtalkUserId) => systemUserIdByDingTalkId.get(dingtalkUserId))
            .filter((id): id is number => Boolean(id))
        );
        notificationRows.forEach((notification) => {
          if (notification.id && notification.recipient_user_id && sentSystemUserIds.has(notification.recipient_user_id)) {
            sentNotificationIds.add(notification.id);
          }
        });
      }
    }

    if (sentNotificationIds.size > 0) {
      await supabase
        .from('notifications')
        .update({ is_sent: true, sent_at: new Date().toISOString() })
        .in('id', Array.from(sentNotificationIds));
    }
  } catch (error) {
    console.error('[Business notification] Push failed:', error);
  }
}
