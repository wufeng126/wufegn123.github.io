import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getNotificationRouteRule } from '@/lib/notification-routing';

/**
 * GET /api/dingtalk/notification-debug?type=monthly_report_approval&user_id=12
 * 排查「系统有提示但钉钉没推」：看接收人绑定状态、通知设置、最近通知的发送标记。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const type = String(searchParams.get('type') || 'monthly_report_approval');
    const userId = Number(searchParams.get('user_id')) || Number(auth.user.id);

    const { data: user } = await client
      .from('users')
      .select('id, name, username, role, dingtalk_user_id, dingtalk_active, is_disabled')
      .eq('id', userId)
      .maybeSingle();

    const { data: settings } = await client
      .from('notification_settings')
      .select('key, enabled, value');
    const settingsMap = new Map<string, { enabled?: boolean; value?: string }>();
    (settings || []).forEach((row: { key?: unknown; enabled?: unknown; value?: unknown }) => {
      settingsMap.set(String(row.key), { enabled: row.enabled as boolean, value: row.value as string });
    });

    const { data: notifications } = await client
      .from('notifications')
      .select('id, type, title, is_sent, sent_at, created_at, recipient_user_id')
      .eq('recipient_user_id', userId)
      .order('id', { ascending: false })
      .limit(10);

    const rule = getNotificationRouteRule(type);
    const dingtalkUserId = String((user as { dingtalk_user_id?: unknown } | null)?.dingtalk_user_id || '');

    return apiSuccess({
      user: {
        id: Number(user?.id || 0),
        name: String(user?.name || user?.username || ''),
        role: String(user?.role || ''),
        dingtalkUserId,
        dingtalkActive: (user as { dingtalk_active?: unknown } | null)?.dingtalk_active ?? null,
        disabled: Boolean((user as { is_disabled?: unknown } | null)?.is_disabled),
        canReceivePersonalNotice: Boolean(dingtalkUserId) && (user as { dingtalk_active?: unknown } | null)?.dingtalk_active !== false && !(user as { is_disabled?: unknown } | null)?.is_disabled,
      },
      settings: {
        dingtalk_enabled: settingsMap.get('dingtalk_enabled')?.enabled ?? null,
        robot_broadcast: settingsMap.get('dingtalk_robot_broadcast_enabled')?.enabled ?? null,
        webhook_configured: Boolean(settingsMap.get('dingtalk_webhook')?.value),
      },
      routeRule: rule
        ? { type: rule.type, channel: rule.channel, category: rule.category, alwaysSend: rule.alwaysSend ?? false }
        : null,
      recentNotifications: notifications || [],
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '诊断失败'));
  }
}
