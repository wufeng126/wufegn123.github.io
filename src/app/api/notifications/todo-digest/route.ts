import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { sendDingTalkWorkNotification } from '@/lib/dingtalk-work-notification';
import { getNotificationSettingsMap, isNotificationSettingEnabled } from '@/lib/notification-settings';
import { getSupabaseClient } from '@/storage/database/supabase-client';

type NotificationRow = {
  id: number;
  type?: string | null;
  title?: string | null;
  content?: string | null;
  severity?: 'info' | 'warning' | 'danger' | null;
  recipient_user_id?: number | null;
  is_read?: boolean | string | number | null;
  created_at?: string | null;
};

type UserRow = {
  id: number;
  username?: string | null;
  name?: string | null;
  dingtalk_name?: string | null;
  dingtalk_user_id?: string | null;
  is_disabled?: boolean | null;
  dingtalk_active?: boolean | null;
};

function isUnread(value: unknown) {
  return value === false || value === 'false' || value === 0 || value === '0' || value === null || value === undefined;
}

async function authorize(request: NextRequest) {
  const configuredSecret = process.env.DINGTALK_TODO_DIGEST_CRON_SECRET;
  const requestSecret = request.headers.get('x-cron-secret') || request.nextUrl.searchParams.get('secret');

  if (configuredSecret && requestSecret && requestSecret === configuredSecret) {
    return { ok: true as const };
  }

  const auth = await requireAuth(request);
  if (!auth.ok) return { ok: false as const, response: auth.response };

  if (!auth.user.is_super_admin) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, error: '只有超级管理员可以手动触发待办提醒' }, { status: 403 }),
    };
  }

  return { ok: true as const };
}

function buildDigestContent(userName: string, notifications: NotificationRow[]) {
  const total = notifications.length;
  const urgentCount = notifications.filter((item) => item.severity === 'danger' || item.severity === 'warning').length;
  const topItems = notifications
    .slice(0, 5)
    .map((item, index) => `${index + 1}. ${item.title || '待办事项'}`)
    .join('\n');

  return [
    `${userName}，你当前有 ${total} 项待办需要处理。`,
    urgentCount > 0 ? `其中 ${urgentCount} 项为重要/紧急提醒。` : '',
    '',
    topItems,
    total > 5 ? `还有 ${total - 5} 项未展示，请进入系统查看。` : '',
  ].filter(Boolean).join('\n');
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const settings = await getNotificationSettingsMap(supabase, ['dingtalk_enabled', 'todo_digest_enabled']);
    if (
      !isNotificationSettingEnabled(settings.dingtalk_enabled?.enabled, true) ||
      !isNotificationSettingEnabled(settings.todo_digest_enabled?.enabled, true)
    ) {
      return NextResponse.json({ success: true, skipped: true, reason: '待办钉钉提醒未启用' });
    }

    const { data: rows, error } = await supabase
      .from('notifications')
      .select('id,type,title,content,severity,recipient_user_id,is_read,created_at')
      .not('recipient_user_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) throw new Error(error.message);

    const unreadRows = ((rows || []) as NotificationRow[]).filter((item) => item.recipient_user_id && isUnread(item.is_read));
    const grouped = new Map<number, NotificationRow[]>();
    unreadRows.forEach((item) => {
      const userId = Number(item.recipient_user_id);
      const list = grouped.get(userId) || [];
      list.push(item);
      grouped.set(userId, list);
    });

    const userIds = Array.from(grouped.keys());
    if (userIds.length === 0) {
      return NextResponse.json({ success: true, sentCount: 0, message: '当前没有需要推送的个人待办' });
    }

    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id,username,name,dingtalk_name,dingtalk_user_id,is_disabled,dingtalk_active')
      .in('id', userIds);

    if (userError) throw new Error(userError.message);

    let sentCount = 0;
    let skippedCount = 0;
    const failed: Array<{ userId: number; error: string }> = [];
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '';

    for (const user of ((users || []) as UserRow[])) {
      const notifications = grouped.get(Number(user.id)) || [];
      if (!notifications.length) continue;

      if (!user.dingtalk_user_id || user.is_disabled === true || user.dingtalk_active === false) {
        skippedCount++;
        continue;
      }

      const userName = user.dingtalk_name || user.name || user.username || `用户${user.id}`;
      const result = await sendDingTalkWorkNotification([user.dingtalk_user_id], {
        type: 'todo_digest',
        title: '待办事项提醒',
        content: buildDigestContent(userName, notifications),
        severity: notifications.some((item) => item.severity === 'danger') ? 'danger' : 'warning',
        extra: appUrl ? { 打开系统: `${appUrl.replace(/\/$/, '')}/workspace` } : undefined,
      });

      if (result.success) {
        sentCount++;
      } else {
        failed.push({ userId: user.id, error: result.errmsg || '钉钉待办提醒发送失败' });
      }
    }

    return NextResponse.json({
      success: failed.length === 0,
      sentCount,
      skippedCount,
      failedCount: failed.length,
      failed,
    });
  } catch (error) {
    console.error('[Todo Digest] Push failed:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '待办提醒推送失败' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  if (!process.env.DINGTALK_TODO_DIGEST_CRON_SECRET) {
    return NextResponse.json(
      { success: false, error: '未配置待办提醒定时任务密钥 DINGTALK_TODO_DIGEST_CRON_SECRET' },
      { status: 403 },
    );
  }

  return POST(request);
}
