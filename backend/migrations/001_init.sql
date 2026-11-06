-- 001_init: full schema for the Reminder System.
-- Runs inside a transaction (see src/db/migrate.ts).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- enums ----------
CREATE TYPE admin_status     AS ENUM ('active', 'disabled');
CREATE TYPE reminder_kind    AS ENUM ('daily', 'emergency');
CREATE TYPE reminder_status  AS ENUM ('draft', 'pending', 'sent', 'failed', 'cancelled');
CREATE TYPE recurrence_type  AS ENUM ('none', 'daily', 'weekly', 'monthly');
CREATE TYPE job_status       AS ENUM ('scheduled', 'queued', 'active', 'completed', 'failed', 'cancelled');
CREATE TYPE recipient_type   AS ENUM ('individual', 'group');
CREATE TYPE delivery_channel AS ENUM ('whatsapp_cloud', 'manual_share');
CREATE TYPE delivery_status  AS ENUM ('queued', 'accepted', 'sent', 'delivered', 'read', 'failed');

-- ---------- helpers ----------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------- roles & permissions ----------
CREATE TABLE roles (
  id          smallint PRIMARY KEY,
  key         text NOT NULL UNIQUE CHECK (key ~ '^[a-z_]+$'),
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_system   boolean NOT NULL DEFAULT true
);

INSERT INTO roles (id, key, name, description) VALUES
  (1, 'owner', 'Owner', 'Full access. Exactly one per installation.'),
  (2, 'admin', 'Admin', 'Configurable permissions granted by the Owner.');

CREATE TABLE permissions (
  id          smallserial PRIMARY KEY,
  key         text NOT NULL UNIQUE CHECK (key ~ '^[a-z_]+\.[a-z_]+$'),
  category    text NOT NULL,
  description text NOT NULL DEFAULT ''
);

CREATE TABLE role_permissions (
  role_id       smallint NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id smallint NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- ---------- admins ----------
CREATE SEQUENCE admin_code_seq START 1;

CREATE TABLE admins (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_code            text NOT NULL UNIQUE
                        DEFAULT ('ADM-' || lpad(nextval('admin_code_seq')::text, 4, '0')),
  username              text NOT NULL CHECK (username ~ '^[A-Za-z0-9_.-]{3,32}$'),
  email                 text NOT NULL CHECK (position('@' in email) > 1),
  display_name          text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  password_hash         text NOT NULL,
  role_id               smallint NOT NULL REFERENCES roles(id),
  status                admin_status NOT NULL DEFAULT 'active',
  token_version         integer NOT NULL DEFAULT 0,
  must_change_password  boolean NOT NULL DEFAULT false,
  failed_login_attempts integer NOT NULL DEFAULT 0,
  locked_until          timestamptz,
  last_login_at         timestamptz,
  created_by            uuid REFERENCES admins(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);
CREATE UNIQUE INDEX admins_username_uq ON admins (lower(username)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX admins_email_uq    ON admins (lower(email))    WHERE deleted_at IS NULL;
-- Only one active Owner (role id 1) may exist.
CREATE UNIQUE INDEX admins_single_owner_uq ON admins ((1)) WHERE role_id = 1 AND deleted_at IS NULL;
CREATE INDEX admins_role_idx ON admins (role_id);
CREATE TRIGGER admins_updated_at BEFORE UPDATE ON admins FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Per-admin overrides on top of the role's default permissions.
CREATE TABLE admin_permissions (
  admin_id      uuid NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  permission_id smallint NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted       boolean NOT NULL,
  granted_by    uuid REFERENCES admins(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (admin_id, permission_id)
);

CREATE TABLE refresh_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     uuid NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  family_id    uuid NOT NULL,
  token_hash   text NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  replaced_by  uuid,
  user_agent   text,
  ip           text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_admin_idx  ON refresh_tokens (admin_id);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);
CREATE INDEX refresh_tokens_expiry_idx ON refresh_tokens (expires_at);

-- ---------- recipients ----------
CREATE TABLE recipients (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  type          recipient_type NOT NULL,
  channel       delivery_channel NOT NULL DEFAULT 'whatsapp_cloud',
  phone_e164    text CHECK (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  wa_group_id   text,
  is_active     boolean NOT NULL DEFAULT true,
  notes         text NOT NULL DEFAULT '',
  created_by    uuid REFERENCES admins(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  -- Individuals need a phone; groups using the Cloud API need a group id; manual share needs neither.
  CONSTRAINT recipients_target_chk CHECK (
    channel = 'manual_share'
    OR (type = 'individual' AND phone_e164 IS NOT NULL)
    OR (type = 'group' AND wa_group_id IS NOT NULL)
  )
);
CREATE INDEX recipients_active_idx ON recipients (is_active) WHERE deleted_at IS NULL;
CREATE TRIGGER recipients_updated_at BEFORE UPDATE ON recipients FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- templates ----------
CREATE TABLE reminder_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description   text NOT NULL DEFAULT '',
  content       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- same shape as reminders.content
  message_body  text,                                  -- optional custom message layout
  created_by    uuid REFERENCES admins(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE UNIQUE INDEX reminder_templates_name_uq ON reminder_templates (lower(name)) WHERE deleted_at IS NULL;
CREATE TRIGGER reminder_templates_updated_at BEFORE UPDATE ON reminder_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- reminders ----------
CREATE TABLE reminders (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title              text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  kind               reminder_kind NOT NULL DEFAULT 'daily',
  status             reminder_status NOT NULL DEFAULT 'draft',
  reminder_date      date NOT NULL,
  -- {uniform, subjects[], homework[], piket[], notes, announcements}
  content            jsonb NOT NULL DEFAULT '{}'::jsonb,
  custom_message     text,                       -- admin-edited final message; NULL = generate from content
  template_id        uuid REFERENCES reminder_templates(id) ON DELETE SET NULL,
  timezone           text NOT NULL,
  scheduled_at       timestamptz,
  recurrence         recurrence_type NOT NULL DEFAULT 'none',
  recurrence_until   date,
  source_reminder_id uuid REFERENCES reminders(id) ON DELETE SET NULL,  -- duplicates / generated occurrences
  sent_at            timestamptz,
  created_by         uuid REFERENCES admins(id) ON DELETE SET NULL,
  updated_by         uuid REFERENCES admins(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz,
  CONSTRAINT reminders_pending_needs_schedule CHECK (status <> 'pending' OR scheduled_at IS NOT NULL)
);
CREATE INDEX reminders_status_idx    ON reminders (status) WHERE deleted_at IS NULL;
CREATE INDEX reminders_scheduled_idx ON reminders (scheduled_at) WHERE status = 'pending' AND deleted_at IS NULL;
CREATE INDEX reminders_date_idx      ON reminders (reminder_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX reminders_kind_idx      ON reminders (kind);
CREATE INDEX reminders_title_lower_idx ON reminders (lower(title));
CREATE TRIGGER reminders_updated_at BEFORE UPDATE ON reminders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE reminder_recipients (
  reminder_id  uuid NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES recipients(id) ON DELETE RESTRICT,
  PRIMARY KEY (reminder_id, recipient_id)
);
CREATE INDEX reminder_recipients_recipient_idx ON reminder_recipients (recipient_id);

-- ---------- scheduled jobs (mirror of the BullMQ queue, source of truth for status) ----------
CREATE TABLE scheduled_jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_id      uuid NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  run_at           timestamptz NOT NULL,
  status           job_status NOT NULL DEFAULT 'scheduled',
  queue_job_id     text,
  idempotency_key  text NOT NULL UNIQUE,          -- e.g. reminder:<id>:<run_at epoch>
  attempts         integer NOT NULL DEFAULT 0,
  max_attempts     integer NOT NULL DEFAULT 5,
  last_error       text,
  started_at       timestamptz,
  finished_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scheduled_jobs_due_idx      ON scheduled_jobs (run_at) WHERE status IN ('scheduled', 'queued');
CREATE INDEX scheduled_jobs_reminder_idx ON scheduled_jobs (reminder_id);
CREATE TRIGGER scheduled_jobs_updated_at BEFORE UPDATE ON scheduled_jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- delivery logs ----------
CREATE TABLE delivery_logs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_id      uuid NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  job_id           uuid REFERENCES scheduled_jobs(id) ON DELETE SET NULL,
  recipient_id     uuid REFERENCES recipients(id) ON DELETE SET NULL,
  channel          delivery_channel NOT NULL,
  status           delivery_status NOT NULL DEFAULT 'queued',
  wa_message_id    text,                          -- id returned by Meta; real statuses only
  idempotency_key  text NOT NULL UNIQUE,          -- reminder:<id>:recipient:<id>:run:<epoch>
  message_body     text NOT NULL,
  attempt          integer NOT NULL DEFAULT 1,
  error_code       text,
  error_message    text,
  sent_at          timestamptz,
  delivered_at     timestamptz,
  read_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX delivery_logs_wa_message_uq ON delivery_logs (wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE INDEX delivery_logs_reminder_idx  ON delivery_logs (reminder_id);
CREATE INDEX delivery_logs_recipient_idx ON delivery_logs (recipient_id);
CREATE INDEX delivery_logs_status_idx    ON delivery_logs (status, created_at DESC);
CREATE TRIGGER delivery_logs_updated_at BEFORE UPDATE ON delivery_logs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- activity logs (audit) ----------
CREATE TABLE activity_logs (
  id           bigserial PRIMARY KEY,
  admin_id     uuid REFERENCES admins(id) ON DELETE SET NULL,
  action       text NOT NULL,                     -- e.g. auth.login, admin.create
  entity_type  text,
  entity_id    text,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip           text,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_logs_created_idx ON activity_logs (created_at DESC);
CREATE INDEX activity_logs_admin_idx   ON activity_logs (admin_id, created_at DESC);
CREATE INDEX activity_logs_action_idx  ON activity_logs (action);

-- ---------- application settings ----------
CREATE TABLE app_settings (
  key         text PRIMARY KEY CHECK (key ~ '^[a-z_.]+$'),
  value       jsonb NOT NULL,
  description text NOT NULL DEFAULT '',
  updated_by  uuid REFERENCES admins(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER app_settings_updated_at BEFORE UPDATE ON app_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
