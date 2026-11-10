-- Delivery method per reminder: WhatsApp automatic send (Cloud API), website push notification, or both.
-- Existing reminders keep working exactly as before (WhatsApp recipients + class-page push), which is what 'both' means.
CREATE TYPE delivery_method AS ENUM ('whatsapp', 'push', 'both');
ALTER TABLE reminders ADD COLUMN delivery_method delivery_method NOT NULL DEFAULT 'both';

-- One row per reminder occurrence that was pushed. UNIQUE(reminder_id, run_key) is what prevents a duplicate push.
CREATE TABLE push_deliveries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_id    uuid NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  run_key        text NOT NULL,                 -- epoch ms of the scheduled instant
  status         text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed', 'skipped')),
  devices_total  integer NOT NULL DEFAULT 0,
  devices_sent   integer NOT NULL DEFAULT 0,
  devices_failed integer NOT NULL DEFAULT 0,
  error_message  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  UNIQUE (reminder_id, run_key)
);
CREATE INDEX push_deliveries_reminder_idx ON push_deliveries (reminder_id);
