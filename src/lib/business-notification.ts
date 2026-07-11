/**
 * 业务通知推送工具
 * 在业务操作（新增结算、工资、回款等）时即时推送钉钉通知
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';
import { sendDingTalkNotification, formatDingTalkMessage, type NotificationParams } from '@/lib/dingtalk';

/**
 * 推送业务通知到钉钉并写入通知表
 */
export async function pushBusinessNotification(params: {
  type: string;
  title: string;
  content: string;
  severity?: 'info' | 'warning' | 'danger';
  projectId?: number;
  relatedId?: number;
  relatedType?: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { type, title, content, severity = 'info', projectId, relatedId, relatedType, metadata } = params;

    // 1. 写入通知表
    const { data: notification, error } = await supabase
      .from('notifications')
      .insert({
        type,
        title,
        content,
        severity,
        project_id: projectId || null,
        related_id: relatedId || null,
        related_type: relatedType || null,
        metadata: metadata || null,
      })
      .select()
      .single();

    if (error) {
      console.error('[通知] 写入失败:', error);
      return;
    }

    // 2. 推送到钉钉
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
      return; // 钉钉未配置或未启用
    }

    // 检查通知类型开关
    const { data: typeSettings } = await supabase
      .from('notification_settings')
      .select('setting_key, enabled')
      .in('setting_key', [
        'new_record_reminder_enabled',
        'settlement_reminder_enabled',
        'payment_warning_enabled',
      ]);

    const typeEnabledMap: Record<string, boolean> = {};
    typeSettings?.forEach((s: { setting_key: string; enabled: boolean }) => {
      typeEnabledMap[s.setting_key] = s.enabled;
    });

    // 根据类型判断是否需要发送
    let shouldSend = false;
    if (['new_report', 'new_worker'].includes(type) && typeEnabledMap['new_record_reminder_enabled']) shouldSend = true;
    if (type === 'new_settlement' && (typeEnabledMap['settlement_reminder_enabled'] || typeEnabledMap['new_record_reminder_enabled'])) shouldSend = true;
    if (['new_worker_salary', 'new_salary'].includes(type) && (typeEnabledMap['salary_reminder_enabled'] || typeEnabledMap['new_record_reminder_enabled'])) shouldSend = true;
    if (type === 'new_worker_payment' && (typeEnabledMap['salary_reminder_enabled'] || typeEnabledMap['new_record_reminder_enabled'])) shouldSend = true;
    if (type === 'new_client_payment' && (typeEnabledMap['client_payment_reminder_enabled'] || typeEnabledMap['payment_warning_enabled'] || typeEnabledMap['new_record_reminder_enabled'])) shouldSend = true;
    if (type === 'new_supplier_payment' && (typeEnabledMap['supplier_payment_reminder_enabled'] || typeEnabledMap['payment_warning_enabled'] || typeEnabledMap['new_record_reminder_enabled'])) shouldSend = true;
    if (type === 'cost_warning' && typeEnabledMap['cost_warning_enabled']) shouldSend = true;
    if (type === 'monthly_analysis_workflow' && typeEnabledMap['new_record_reminder_enabled']) shouldSend = true;

    // 钉钉总开关检查
    const { data: dingtalkEnabled } = await supabase
      .from('notification_settings')
      .select('enabled')
      .eq('setting_key', 'dingtalk_enabled')
      .single();
    if (dingtalkEnabled && !dingtalkEnabled.enabled) shouldSend = false;

    if (!shouldSend) return;

    // 获取项目名称
    let projectName: string | undefined;
    if (projectId) {
      const { data: proj } = await supabase
        .from('projects')
        .select('name')
        .eq('id', projectId)
        .single();
      projectName = proj?.name;
    }

    const notifParams: NotificationParams = {
      type,
      title,
      content,
      severity,
      projectName,
    };

    const { title: msgTitle, text } = formatDingTalkMessage(notifParams);
    const result = await sendDingTalkNotification(
      webhookSetting.setting_value,
      secretSetting?.setting_value,
      msgTitle,
      text
    );

    if (result.success && notification) {
      await supabase
        .from('notifications')
        .update({ is_sent: true, sent_at: new Date().toISOString() })
        .eq('id', notification.id);
    }
  } catch (error) {
    console.error('[业务通知] 推送失败:', error);
    // 不抛出错误，避免影响业务操作
  }
}
