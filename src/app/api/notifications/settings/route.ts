import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET() {
  try {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('notification_settings')
      .select('*')
      .order('id');

    if (error) {
      throw new Error(`查询设置失败: ${error.message}`);
    }

    // 转换为键值对格式
    const settings: Record<string, { value: string; enabled: boolean; description: string }> = {};
    data?.forEach(item => {
      settings[item.setting_key] = {
        value: item.setting_value || '',
        enabled: item.enabled,
        description: item.description || '',
      };
    });

    return NextResponse.json({ settings, raw: data });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '查询失败' },
      { status: 500 }
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

    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
    if (value !== undefined) updateData.setting_value = value;
    if (enabled !== undefined) updateData.enabled = enabled;

    const { error } = await client
      .from('notification_settings')
      .update(updateData)
      .eq('setting_key', key);

    if (error) {
      throw new Error(`更新设置失败: ${error.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '更新失败' },
      { status: 500 }
    );
  }
}
