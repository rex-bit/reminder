-- Public (no login) notification subscriptions for the read-only class page.
CREATE TABLE public_push_subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint        text NOT NULL UNIQUE,
  p256dh          text NOT NULL,
  auth            text NOT NULL,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  last_error      text
);
