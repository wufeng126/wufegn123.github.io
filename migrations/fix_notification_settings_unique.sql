-- Fix duplicated notification settings that could make DingTalk Webhook appear unsaved.
DO $$
BEGIN
  IF to_regclass('public.notification_settings') IS NOT NULL THEN
    WITH ranked AS (
      SELECT
        id,
        setting_key,
        ROW_NUMBER() OVER (
          PARTITION BY setting_key
          ORDER BY
            CASE WHEN COALESCE(setting_value, '') <> '' THEN 0 ELSE 1 END,
            id
        ) AS rn
      FROM notification_settings
    )
    DELETE FROM notification_settings
    WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

    INSERT INTO notification_settings (setting_key, setting_value, enabled, description)
    VALUES
      ('dingtalk_enabled', '', 'true', '允许系统向钉钉推送消息'),
      ('dingtalk_robot_broadcast_enabled', '', 'true', '允许公司级广播消息发送到钉钉群机器人'),
      ('dingtalk_webhook', '', 'true', '钉钉群机器人 Webhook，仅用于公司级广播'),
      ('dingtalk_secret', '', 'true', '钉钉群机器人加签 Secret'),
      ('todo_digest_enabled', '', 'true', '允许定时向个人推送待办汇总')
    ON CONFLICT DO NOTHING;

    CREATE UNIQUE INDEX IF NOT EXISTS notification_settings_setting_key_key
    ON notification_settings(setting_key);
  END IF;
END $$;
