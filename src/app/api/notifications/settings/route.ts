import { NextRequest, NextResponse } from 'next/server';
import {
  cleanupDuplicateNotificationSettings,
  ensureDefaultNotificationSettings,
  getNotificationSettingsMap,
  upsertNotificationSetting,
} from '@/lib/notification-settings';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET() {
  try {
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
    const body = await request.json();
    const { key, value, enabled } = body;

    if (!key) {
      return NextResponse.json({ error: '请提供设置键名' }, { status: 400 });
    }

    const client = getSupabaseClient();
    await ensureDefaultNotificationSettings(client);
    await upsertNotificationSetting(client, key, { value, enabled });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '更新通知配置失败' },
      { status: 500 },
    );
  }
}
