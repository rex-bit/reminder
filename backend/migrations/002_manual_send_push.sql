-- Manual sending with notifications: a reminder whose recipients are "manual share" becomes `due` at its
-- scheduled time; admins get a Web Push notification and send it from their own WhatsApp.
-- NOTE: the new enum value must not be used inside this migration (PostgreSQL restriction).
ALTER TYPE reminder_status ADD VALUE IF NOT EXISTS 'due';

CREATE TYPE manual_share_status AS ENUM ('due', 'done');

-- One row per manual-share recipient of a reminder occurrence.
CREATE TABLE manual_shares (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_id   uuid NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  recipient_id  uuid NOT NULL REFERENCES recipients(id) ON DELETE RESTRICT,
  status        manual_share_status NOT NULL DEFAULT 'due',
  due_at        timestamptz NOT NULL DEFAULT now(),
  done_at       timestamptz,
  done_by       uuid REFERENCES admins(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reminder_id, recipient_id),
  CONSTRAINT manual_shares_done_chk CHECK (status <> 'done' OR done_at IS NOT NULL)
);
CREATE INDEX manual_shares_open_idx ON manual_shares (reminder_id) WHERE status = 'due';
CREATE TRIGGER manual_shares_updated_at BEFORE UPDATE ON manual_shares FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Browser push subscriptions (Web Push / VAPID). The endpoint is unique per browser install.
CREATE TABLE push_subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        uuid NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  endpoint        text NOT NULL UNIQUE,
  p256dh          text NOT NULL,
  auth            text NOT NULL,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  last_error      text
);
CREATE INDEX push_subscriptions_admin_idx ON push_subscriptions (admin_id);
