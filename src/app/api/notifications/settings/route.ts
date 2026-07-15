import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const DEFAULT_SETTINGS = [
  { key: 'dingtalk_enabled', value: '', enabled: true, description: '开启后允许系统向钉钉推送消息' },
  { key: 'dingtalk_robot_broadcast_enabled', value: '', enabled: true, description: '开启后允许公司级广播消息发送到钉钉群机器人' },
  { key: 'dingtalk_webhook', value: '', enabled: true, description: '钉钉群机器人 Webhook，仅用于公司级广播' },
  { key: 'dingtalk_secret', value: '', enabled: true, description: '钉钉群机器人加签 Secret' },
  { key: 'new_record_reminder_enabled', value: '', enabled: true, description: '新增记录、流程节点和日报汇总提醒' },
  { key: 'visa_reminder_enabled', value: '', enabled: true, description: '签证流程和签证超期提醒' },
  { key: 'cost_warning_enabled', value: '', enabled: true, description: '成本、施工日志风险提醒' },
  { key: 'salary_reminder_enabled', value: '', enabled: true, description: '工资核算和工资发放提醒' },
  { key: 'payment_warning_enabled', value: '', enabled: true, description: '付款预警提醒' },
  { key: 'client_payment_reminder_enabled', value: '', enabled: true, description: '甲方回款提醒' },
  { key: 'supplier_payment_reminder_enabled', value: '', enabled: true, description: '供应商付款提醒' },
  { key: 'settlement_reminder_enabled', value: '', enabled: true, description: '结算单提醒' },
  { key: 'certificate_reminder_enabled', value: '', enabled: true, description: '证件到期提醒' },
];

function isEnabledValue(value: unknown, fallback = true) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (['false', '0', 'off', 'no', 'disabled'].includes(normalized)) return false;
  if (['true', '1', 'on', 'yes', 'enabled'].includes(normalized)) return true;
  return fallback;
}

async function ensureDefaultSettings(client: ReturnType<typeof getSupabaseClient>) {
  const keys = DEFAULT_SETTINGS.map((item) => item.key);
  const { data } = await client
    .from('notification_settings')
    .select('setting_key')
    .in('setting_key', keys);

  const existingKeys = new Set((data || []).map((item: { setting_key: string }) => item.setting_key));
  const missing = DEFAULT_SETTINGS.filter((item) => !existingKeys.has(item.key));
  if (missing.length === 0) return;

  await client.from('notification_settings').insert(
    missing.map((item) => ({
      setting_key: item.key,
      setting_value: item.value,
      enabled: String(item.enabled),
      description: item.description,
    })),
  );
}

export async function GET() {
  try {
    const client = getSupabaseClient();
    await ensureDefaultSettings(client);

    const { data, error } = await client
      .from('notification_settings')
      .select('*')
      .order('id');

    if (error) {
      throw new Error(`查询设置失败: ${error.message}`);
    }

    const settings: Record<string, { value: string; enabled: boolean; description: string }> = {};
    data?.forEach((item) => {
      settings[item.setting_key] = {
        value: item.setting_value || '',
        enabled: isEnabledValue(item.enabled, true),
        description: item.description || '',
      };
    });

    return NextResponse.json({ settings, raw: data });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '查询失败' },
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
    const defaultSetting = DEFAULT_SETTINGS.find((item) => item.key === key);

    const { data: existing, error: existingError } = await client
      .from('notification_settings')
      .select('id')
      .eq('setting_key', key)
      .maybeSingle();

    if (existingError) {
      throw new Error(`查询设置失败: ${existingError.message}`);
    }

    if (!existing?.id) {
      const { error: insertError } = await client
        .from('notification_settings')
        .insert({
          setting_key: key,
          setting_value: value ?? defaultSetting?.value ?? '',
          enabled: String(enabled ?? defaultSetting?.enabled ?? true),
          description: defaultSetting?.description || '',
        });

      if (insertError) {
        throw new Error(`新增设置失败: ${insertError.message}`);
      }

      return NextResponse.json({ success: true });
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (value !== undefined) updateData.setting_value = value;
    if (enabled !== undefined) updateData.enabled = String(enabled);

    const { error } = await client
      .from('notification_settings')
      .update(updateData)
      .eq('setting_key', key);

    if (error) {
      throw new Error(`更新设置失败: ${error.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '更新失败' },
      { status: 500 },
    );
  }
}
