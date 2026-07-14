import { getSupabaseClient } from '@/storage/database/supabase-client';
import { sendDingTalkNotification, formatDingTalkMessage, type NotificationParams } from '@/lib/dingtalk';

type NotificationSeverity = 'info' | 'warning' | 'danger';
type NotificationRow = { id?: number | string };
type SupabaseErrorLike = { message?: string; details?: string } | null;

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

    if (!webhookSetting?.setting_value || !webhookSetting.enabled) {
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
      ]);

    const typeEnabledMap: Record<string, boolean> = {};
    typeSettings?.forEach((setting: { setting_key: string; enabled: boolean }) => {
      typeEnabledMap[setting.setting_key] = setting.enabled;
    });

    let shouldSend = false;
    if (['new_report', 'new_worker'].includes(type) && typeEnabledMap['new_record_reminder_enabled']) shouldSend = true;
    if (type === 'new_settlement' && (typeEnabledMap['settlement_reminder_enabled'] || typeEnabledMap['new_record_reminder_enabled'])) shouldSend = true;
    if (['new_worker_salary', 'new_salary'].includes(type) && (typeEnabledMap['salary_reminder_enabled'] || typeEnabledMap['new_record_reminder_enabled'])) shouldSend = true;
    if (type === 'new_worker_payment' && (typeEnabledMap['salary_reminder_enabled'] || typeEnabledMap['new_record_reminder_enabled'])) shouldSend = true;
    if (type === 'new_client_payment' && (typeEnabledMap['client_payment_reminder_enabled'] || typeEnabledMap['payment_warning_enabled'] || typeEnabledMap['new_record_reminder_enabled'])) shouldSend = true;
    if (type === 'new_supplier_payment' && (typeEnabledMap['supplier_payment_reminder_enabled'] || typeEnabledMap['payment_warning_enabled'] || typeEnabledMap['new_record_reminder_enabled'])) shouldSend = true;
    if (type === 'cost_warning' && typeEnabledMap['cost_warning_enabled']) shouldSend = true;
    if (type === 'monthly_analysis_workflow' && typeEnabledMap['new_record_reminder_enabled']) shouldSend = true;
    if (type === 'construction_log_alert' && (typeEnabledMap['cost_warning_enabled'] || typeEnabledMap['new_record_reminder_enabled'])) shouldSend = true;

    const { data: dingtalkEnabled } = await supabase
      .from('notification_settings')
      .select('enabled')
      .eq('setting_key', 'dingtalk_enabled')
      .single();
    if (dingtalkEnabled && !dingtalkEnabled.enabled) shouldSend = false;

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
    const result = await sendDingTalkNotification(
      webhookSetting.setting_value,
      secretSetting?.setting_value,
      msgTitle,
      text
    );

    const notificationIds = notificationRows.map((notification) => notification.id).filter(Boolean);
    if (result.success && notificationIds.length > 0) {
      await supabase
        .from('notifications')
        .update({ is_sent: true, sent_at: new Date().toISOString() })
        .in('id', notificationIds);
    }
  } catch (error) {
    console.error('[Business notification] Push failed:', error);
  }
}
