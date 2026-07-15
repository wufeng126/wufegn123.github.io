import { getSupabaseClient } from '@/storage/database/supabase-client';
import { sendDingTalkNotification, formatDingTalkMessage, type NotificationParams } from '@/lib/dingtalk';
import { sendDingTalkWorkNotification } from '@/lib/dingtalk-work-notification';

type NotificationSeverity = 'info' | 'warning' | 'danger';
type NotificationRow = { id?: number | string; recipient_user_id?: number | null };
type SupabaseErrorLike = { message?: string; details?: string } | null;
type SettingEnabled = boolean | string | number | null | undefined;

function isEnabled(value: SettingEnabled, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = value.trim().toLowerCase();
  if (['false', '0', 'off', 'no', 'disabled'].includes(normalized)) return false;
  if (['true', '1', 'on', 'yes', 'enabled'].includes(normalized)) return true;
  return fallback;
}

function getPriority(severity: NotificationSeverity) {
  if (severity === 'danger') return 2;
  if (severity === 'warning') return 1;
  return 0;
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

    const uniqueRecipientIds = Array.from(new Set((recipientUserIds || []).filter(Boolean)));
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

    const { data: typeSettings } = await supabase
      .from('notification_settings')
      .select('setting_key, enabled')
      .in('setting_key', [
        'new_record_reminder_enabled',
        'settlement_reminder_enabled',
        'payment_warning_enabled',
        'salary_reminder_enabled',
        'client_payment_reminder_enabled',
        'supplier_payment_reminder_enabled',
        'cost_warning_enabled',
        'visa_reminder_enabled',
      ]);

    const typeEnabledMap: Record<string, boolean> = {};
    typeSettings?.forEach((setting: { setting_key: string; enabled: SettingEnabled }) => {
      typeEnabledMap[setting.setting_key] = isEnabled(setting.enabled, true);
    });
    const isTypeEnabled = (key: string) => typeEnabledMap[key] !== false;

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

    const { data: dingtalkEnabled } = await supabase
      .from('notification_settings')
      .select('enabled')
      .eq('setting_key', 'dingtalk_enabled')
      .single();
    if (dingtalkEnabled && !isEnabled(dingtalkEnabled.enabled, true)) shouldSend = false;

    if (!shouldSend) return;

    const { data: webhookSetting } = await supabase
      .from('notification_settings')
      .select('setting_value, enabled')
      .eq('setting_key', 'dingtalk_webhook')
      .single();

    const { data: secretSetting } = await supabase
      .from('notification_settings')
      .select('setting_value')
      .eq('setting_key', 'dingtalk_secret')
      .single();

    let projectName: string | undefined;
    if (projectId) {
      const { data: project } = await supabase
        .from('projects')
        .select('name')
        .eq('id', projectId)
        .single();
      projectName = project?.name;
    }

    const targetNames = Array.isArray(metadata?.targetNames) ? metadata.targetNames.filter(Boolean).join('、') : '';
    const extra = targetNames ? { 提醒对象: targetNames } : undefined;
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
    if (webhookSetting?.setting_value && isEnabled(webhookSetting.enabled, true)) {
      const result = await sendDingTalkNotification(
        webhookSetting.setting_value,
        secretSetting?.setting_value,
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
