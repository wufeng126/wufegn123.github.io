import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { sendDingTalkNotification, formatDingTalkMessage, type NotificationParams } from '@/lib/dingtalk';

export async function POST(request: NextRequest) {
  const supabase = getSupabaseClient();

  try {
    const body = await request.json();
    const { test, notificationId, notificationIds } = body;

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

    if (!webhookUrl) {
      return NextResponse.json(
        { success: false, error: '钉钉 Webhook 未配置，请在通知设置中配置' },
        { status: 400 }
      );
    }

    // 测试消息
    if (test) {
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
      const result = await sendDingTalkNotification(webhookUrl, secret, title, text);

      if (result.success) {
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
