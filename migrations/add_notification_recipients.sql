ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient_user_id INTEGER;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient_role VARCHAR(50);

CREATE INDEX IF NOT EXISTS notifications_recipient_user_id_idx ON notifications(recipient_user_id);
CREATE INDEX IF NOT EXISTS notifications_recipient_role_idx ON notifications(recipient_role);
