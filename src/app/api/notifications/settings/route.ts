import { NextRequest, NextResponse } from 'next/server';
import {
  cleanupDuplicateNotificationSettings,
  DEFAULT_NOTIFICATION_SETTINGS,
  ensureDefaultNotificationSettings,
  getNotificationSettingsMap,
  upsertNotificationSetting,
} from '@/lib/notification-settings';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requirePermission } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'notifications:settings');
    if (!auth.ok) return auth.response;

    const client = getSupabaseClient();
    await ensureDefaultNotificationSettings(client);
    await cleanupDuplicateNotificationSettings(client);
    const settings = await getNotificationSettingsMap(client);

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '查询通知配置失败' },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'notifications:settings');
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { key, value, enabled } = body;

    if (typeof key !== 'string' || !key.trim()) {
      return NextResponse.json({ error: '请提供设置键名' }, { status: 400 });
    }
    const normalizedKey = key.trim();
    const allowedKeys = new Set(DEFAULT_NOTIFICATION_SETTINGS.map((item) => item.key));
    if (!allowedKeys.has(normalizedKey)) {
      return NextResponse.json({ error: '不支持的通知配置项' }, { status: 400 });
    }
    if (value !== undefined && (typeof value !== 'string' || value.length > 20000)) {
      return NextResponse.json({ error: '通知配置值格式不正确或过长' }, { status: 400 });
    }
    if (enabled !== undefined && typeof enabled !== 'boolean') {
      return NextResponse.json({ error: '启用状态格式不正确' }, { status: 400 });
    }

    const client = getSupabaseClient();
    await ensureDefaultNotificationSettings(client);
    await upsertNotificationSetting(client, normalizedKey, { value, enabled });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '更新通知配置失败' },
      { status: 500 },
    );
  }
}
