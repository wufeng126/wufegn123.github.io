import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { sendDingTalkNotification, formatDingTalkMessage, type NotificationParams } from '@/lib/dingtalk';
import { sendDingTalkWorkNotification } from '@/lib/dingtalk-work-notification';
import { requireAuth } from '@/lib/api-auth';

function isEnabled(value: unknown, fallback = true) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (['false', '0', 'off', 'no', 'disabled'].includes(normalized)) return false;
  if (['true', '1', 'on', 'yes', 'enabled'].includes(normalized)) return true;
  return fallback;
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseClient();

  try {
    const body = await request.json();
    const { test, channel = 'robot', notificationId, notificationIds } = body;

    // 获取钉钉 Webhook 设置
    const { data: webhookSetting } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('setting_key', 'dingtalk_webhook')
      .single();

    const { data: secretSetting } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('setting_key', 'dingtalk_secret')
      .single();

    const webhookUrl = webhookSetting?.setting_value;
    const secret = secretSetting?.setting_value;

    // 测试消息
    if (test) {
      if (channel === 'work') {
        const auth = await requireAuth(request);
        if (!auth.ok) return auth.response;

        const { data: currentUser, error: userError } = await supabase
          .from('users')
          .select('id,dingtalk_user_id,dingtalk_name,name,username')
          .eq('id', auth.user.id)
          .maybeSingle();

        if (userError || !currentUser?.dingtalk_user_id) {
          return NextResponse.json(
            { success: false, error: '当前账号没有绑定钉钉 UserId，无法测试个人工作通知' },
            { status: 400 }
          );
        }

        const result = await sendDingTalkWorkNotification([currentUser.dingtalk_user_id], {
          type: 'test',
          title: '测试通知',
          content: '这是一条来自建筑劳务管理系统的钉钉个人工作通知测试消息。',
          severity: 'info',
          extra: { 接收人: currentUser.dingtalk_name || currentUser.name || currentUser.username || String(auth.user.id) },
        });

        if (result.success) {
          return NextResponse.json({ success: true, message: '测试消息已发送，请检查当前账号的钉钉工作通知' });
        }

        return NextResponse.json(
          { success: false, error: result.errmsg || '个人工作通知发送失败' },
          { status: 500 }
        );
      }

      if (!webhookUrl || !isEnabled(webhookSetting?.enabled, true)) {
        return NextResponse.json(
          { success: false, error: '钉钉群机器人 Webhook 未配置或未启用，请在通知设置中配置' },
          { status: 400 }
        );
      }

      const result = await sendDingTalkNotification(
        webhookUrl,
        secret,
        '测试通知',
        '### 🔵 钉钉通知测试\n\n这是一条来自**建筑劳务管理系统**的测试消息。\n\n---\n⏰ ' + new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      );

      if (result.success) {
        return NextResponse.json({ success: true, message: '测试消息已发送，请检查钉钉群' });
      }
      return NextResponse.json(
        { success: false, error: `发送失败: ${result.errmsg || '未知错误'}` },
        { status: 500 }
      );
    }

    // 重发指定通知
    let targetIds = notificationIds || [];
    if (notificationId) {
      targetIds = [notificationId];
    }

    if (targetIds.length === 0) {
      return NextResponse.json(
        { success: false, error: '请指定要发送的通知ID' },
        { status: 400 }
      );
    }

    const { data: notifications } = await supabase
      .from('notifications')
      .select('*')
      .in('id', targetIds);

    if (!notifications || notifications.length === 0) {
      return NextResponse.json(
        { success: false, error: '未找到指定通知' },
        { status: 404 }
      );
    }

    // 获取项目名称映射
    const projectIds = [...new Set(notifications.map((n: { project_id: number }) => n.project_id).filter(Boolean))];
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name')
      .in('id', projectIds);

    const projectMap = new Map((projects || []).map((p: { id: number; name: string }) => [p.id, p.name]));
    const recipientIds = [...new Set(notifications.map((n: { recipient_user_id?: number | null }) => n.recipient_user_id).filter(Boolean))];
    const { data: recipientUsers } = recipientIds.length > 0
      ? await supabase
        .from('users')
        .select('id,dingtalk_user_id,is_disabled,dingtalk_active')
        .in('id', recipientIds)
      : { data: [] };
    const dingtalkUserBySystemUserId = new Map(
      (recipientUsers || [])
        .filter((user: { id: number; dingtalk_user_id?: string | null; is_disabled?: boolean | null; dingtalk_active?: boolean | null }) =>
          user.dingtalk_user_id && user.is_disabled !== true && user.dingtalk_active !== false
        )
        .map((user: { id: number; dingtalk_user_id: string }) => [user.id, user.dingtalk_user_id])
    );

    let sentCount = 0;
    let failCount = 0;

    for (const notification of notifications) {
      const projectName = notification.project_id ? projectMap.get(notification.project_id) : undefined;

      const params: NotificationParams = {
        type: notification.type,
        title: notification.title,
        content: notification.content,
        severity: notification.severity || 'info',
        projectName,
      };

      const { title, text } = formatDingTalkMessage(params);
      let sent = false;

      if (webhookUrl && isEnabled(webhookSetting?.enabled, true)) {
        const result = await sendDingTalkNotification(webhookUrl, secret, title, text);
        sent = sent || result.success;
      }

      const dingtalkUserId = notification.recipient_user_id
        ? dingtalkUserBySystemUserId.get(notification.recipient_user_id)
        : null;
      if (dingtalkUserId) {
        const workResult = await sendDingTalkWorkNotification([dingtalkUserId], params);
        sent = sent || workResult.success;
      }

      if (sent) {
        sentCount++;
        // 更新通知发送状态
        await supabase
          .from('notifications')
          .update({ is_sent: true, sent_at: new Date().toISOString() })
          .eq('id', notification.id);
      } else {
        failCount++;
      }
    }

    return NextResponse.json({
      success: sentCount > 0,
      sentCount,
      failCount,
      message: `成功发送 ${sentCount} 条${failCount > 0 ? `，失败 ${failCount} 条` : ''}`,
    });
  } catch (error) {
    console.error('[DingTalk] Route error:', error);
    return NextResponse.json(
      { success: false, error: '发送失败' },
      { status: 500 }
    );
  }
}
