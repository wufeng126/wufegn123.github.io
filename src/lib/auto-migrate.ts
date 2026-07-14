// 应用启动迁移检测
// 部署后检查表是否存在，若不存在则提示手动执行 SQL

let checked = false;

export async function runMigrations() {
  if (checked) return;
  checked = true;

  try {
    const { getSupabaseClient } = await import('@/storage/database/supabase-client');
    const supabase = getSupabaseClient();

    // 检查施工日志表是否存在
    const { error: logErr } = await supabase.from('construction_logs').select('id').limit(1);
    if (logErr?.message?.includes('does not exist')) {
      console.log('[Migration] ⚠️ construction_logs 表不存在，使用项目内 SQL 手动创建');
      console.log('[Migration] 📄 文件: migrations/create_construction_logs.sql');
    }

    // 检查审批配置表是否存在
    const { error: wfErr } = await supabase.from('workflow_configs').select('id').limit(1);
    if (wfErr?.message?.includes('does not exist')) {
      console.log('[Migration] ⚠️ workflow_configs 表不存在，使用项目内 SQL 手动创建');
      console.log('[Migration] 📄 文件: migrations/create_workflow_config.sql');
    }

    // 检查内部附加清单表是否存在
    const { error: addonErr } = await supabase.from('internal_addon_templates').select('id').limit(1);
    if (addonErr?.message?.includes('does not exist')) {
      console.log('[Migration] ⚠️ internal_addon_templates 表不存在，使用项目内 SQL 手动创建');
      console.log('[Migration] 📄 文件: migrations/create_internal_addon_items.sql');
    }

    const { error: recipientErr } = await supabase
      .from('notifications')
      .select('recipient_user_id')
      .limit(1);
    if (recipientErr?.message?.includes('recipient_user_id')) {
      console.log('[Migration] notifications 缺少 recipient_user_id 字段，请执行 migrations/add_notification_recipients.sql');
    }
  } catch (e) {
    console.log('[Migration] 检查跳过，不影响运行');
  }
}
