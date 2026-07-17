import { getSupabaseClient } from '@/storage/database/supabase-client';

export const DEFAULT_NOTIFICATION_SETTINGS = [
  { key: 'dingtalk_enabled', value: '', enabled: true, description: '允许系统向钉钉推送消息' },
  { key: 'dingtalk_robot_broadcast_enabled', value: '', enabled: true, description: '允许公司级广播消息发送到钉钉群机器人' },
  { key: 'dingtalk_webhook', value: '', enabled: true, description: '钉钉群机器人 Webhook，仅用于公司级广播' },
  { key: 'dingtalk_secret', value: '', enabled: true, description: '钉钉群机器人加签 Secret' },
  { key: 'todo_digest_enabled', value: '', enabled: true, description: '允许定时向个人推送待办汇总' },
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

type SupabaseClient = ReturnType<typeof getSupabaseClient>;

export type NotificationSettingValue = {
  value: string;
  enabled: boolean;
  description: string;
};

type NotificationSettingRow = {
  id: number;
  setting_key: string;
  setting_value?: string | null;
  enabled?: boolean | string | number | null;
  description?: string | null;
};

export function isNotificationSettingEnabled(value: unknown, fallback = true) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (['false', '0', 'off', 'no', 'disabled'].includes(normalized)) return false;
  if (['true', '1', 'on', 'yes', 'enabled'].includes(normalized)) return true;
  return fallback;
}

function chooseCanonical(rows: NotificationSettingRow[], requestedValue?: string) {
  if (requestedValue !== undefined) return rows[0];
  return rows.find((row) => String(row.setting_value || '').trim()) || rows[0];
}

export function normalizeNotificationSettings(rows: NotificationSettingRow[] = []) {
  const grouped = new Map<string, NotificationSettingRow[]>();
  rows.forEach((row) => {
    if (!row.setting_key) return;
    const list = grouped.get(row.setting_key) || [];
    list.push(row);
    grouped.set(row.setting_key, list);
  });

  const settings: Record<string, NotificationSettingValue> = {};
  grouped.forEach((list, key) => {
    const canonical = chooseCanonical(list) || list[0];
    const valueRow = list.find((row) => String(row.setting_value || '').trim()) || canonical;
    const descriptionRow = list.find((row) => String(row.description || '').trim()) || canonical;
    settings[key] = {
      value: String(valueRow?.setting_value || ''),
      enabled: isNotificationSettingEnabled(canonical?.enabled, true),
      description: String(descriptionRow?.description || ''),
    };
  });
  return settings;
}

export async function ensureDefaultNotificationSettings(client: SupabaseClient) {
  const keys = DEFAULT_NOTIFICATION_SETTINGS.map((item) => item.key);
  const { data } = await client
    .from('notification_settings')
    .select('setting_key')
    .in('setting_key', keys);

  const existingKeys = new Set((data || []).map((item: { setting_key: string }) => item.setting_key));
  const missing = DEFAULT_NOTIFICATION_SETTINGS.filter((item) => !existingKeys.has(item.key));
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

export async function cleanupDuplicateNotificationSettings(client: SupabaseClient, keys?: string[]) {
  let query = client
    .from('notification_settings')
    .select('id, setting_key, setting_value, enabled, description')
    .order('id', { ascending: true });

  if (keys?.length) {
    query = query.in('setting_key', keys);
  }

  const { data, error } = await query;
  if (error) throw new Error(`查询通知配置失败: ${error.message}`);

  const grouped = new Map<string, NotificationSettingRow[]>();
  ((data || []) as NotificationSettingRow[]).forEach((row) => {
    const list = grouped.get(row.setting_key) || [];
    list.push(row);
    grouped.set(row.setting_key, list);
  });

  for (const [key, rows] of grouped) {
    if (rows.length <= 1) continue;

    const canonical = chooseCanonical(rows);
    const valueRow = rows.find((row) => String(row.setting_value || '').trim()) || canonical;
    const descriptionRow = rows.find((row) => String(row.description || '').trim()) || canonical;
    const duplicateIds = rows.filter((row) => row.id !== canonical.id).map((row) => row.id);

    const defaults = DEFAULT_NOTIFICATION_SETTINGS.find((item) => item.key === key);
    await client
      .from('notification_settings')
      .update({
        setting_value: valueRow?.setting_value ?? defaults?.value ?? '',
        enabled: String(isNotificationSettingEnabled(canonical.enabled, defaults?.enabled ?? true)),
        description: descriptionRow?.description || defaults?.description || '',
        updated_at: new Date().toISOString(),
      })
      .eq('id', canonical.id);

    if (duplicateIds.length > 0) {
      await client.from('notification_settings').delete().in('id', duplicateIds);
    }
  }
}

export async function getNotificationSettingsMap(client: SupabaseClient, keys?: string[]) {
  let query = client
    .from('notification_settings')
    .select('id, setting_key, setting_value, enabled, description')
    .order('id', { ascending: true });

  if (keys?.length) {
    query = query.in('setting_key', keys);
  }

  const { data, error } = await query;
  if (error) throw new Error(`查询通知配置失败: ${error.message}`);
  return normalizeNotificationSettings((data || []) as NotificationSettingRow[]);
}

export async function getNotificationSetting(client: SupabaseClient, key: string) {
  const settings = await getNotificationSettingsMap(client, [key]);
  return settings[key];
}

export async function upsertNotificationSetting(
  client: SupabaseClient,
  key: string,
  input: { value?: string; enabled?: boolean },
) {
  const defaultSetting = DEFAULT_NOTIFICATION_SETTINGS.find((item) => item.key === key);
  const { data, error } = await client
    .from('notification_settings')
    .select('id, setting_key, setting_value, enabled, description')
    .eq('setting_key', key)
    .order('id', { ascending: true });

  if (error) throw new Error(`查询通知配置失败: ${error.message}`);

  const rows = (data || []) as NotificationSettingRow[];
  if (rows.length === 0) {
    const { error: insertError } = await client.from('notification_settings').insert({
      setting_key: key,
      setting_value: input.value ?? defaultSetting?.value ?? '',
      enabled: String(input.enabled ?? defaultSetting?.enabled ?? true),
      description: defaultSetting?.description || '',
    });
    if (insertError) throw new Error(`新增通知配置失败: ${insertError.message}`);
    return;
  }

  const canonical = chooseCanonical(rows, input.value);
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.value !== undefined) updateData.setting_value = input.value;
  if (input.enabled !== undefined) updateData.enabled = String(input.enabled);

  const { error: updateError } = await client
    .from('notification_settings')
    .update(updateData)
    .eq('id', canonical.id);

  if (updateError) throw new Error(`更新通知配置失败: ${updateError.message}`);

  const duplicateIds = rows.filter((row) => row.id !== canonical.id).map((row) => row.id);
  if (duplicateIds.length > 0) {
    await client.from('notification_settings').delete().in('id', duplicateIds);
  }
}
