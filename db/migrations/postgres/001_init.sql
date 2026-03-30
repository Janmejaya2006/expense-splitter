BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  notification_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS groups (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'INR',
  owner_user_id BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  id BIGINT PRIMARY KEY,
  group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS members_group_id_idx ON members(group_id);
CREATE INDEX IF NOT EXISTS members_user_id_idx ON members(user_id);

CREATE TABLE IF NOT EXISTS expenses (
  id BIGINT PRIMARY KEY,
  group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  payer_member_id BIGINT NOT NULL REFERENCES members(id),
  participants JSONB NOT NULL DEFAULT '[]'::jsonb,
  split_mode TEXT NOT NULL DEFAULT 'equal',
  split_config JSONB,
  category TEXT NOT NULL DEFAULT 'Misc',
  expense_date DATE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS expenses_group_id_idx ON expenses(group_id);
CREATE INDEX IF NOT EXISTS expenses_payer_member_id_idx ON expenses(payer_member_id);

CREATE TABLE IF NOT EXISTS settlement_payments (
  id BIGINT PRIMARY KEY,
  group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  from_member_id BIGINT NOT NULL REFERENCES members(id),
  from_name TEXT NOT NULL,
  to_member_id BIGINT NOT NULL REFERENCES members(id),
  to_name TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  note TEXT NOT NULL DEFAULT '',
  proof_name TEXT NOT NULL DEFAULT '',
  proof_mime_type TEXT NOT NULL DEFAULT '',
  proof_path TEXT NOT NULL DEFAULT '',
  proof_bytes BIGINT NOT NULL DEFAULT 0,
  proof_hash TEXT NOT NULL DEFAULT '',
  proof_storage TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  created_by_user_id BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS settlement_payments_group_id_idx ON settlement_payments(group_id);

CREATE TABLE IF NOT EXISTS notification_logs (
  id BIGINT PRIMARY KEY,
  group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  group_name TEXT NOT NULL,
  from_member_id BIGINT NOT NULL REFERENCES members(id),
  from_name TEXT NOT NULL,
  to_member_id BIGINT NOT NULL REFERENCES members(id),
  to_name TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  custom_message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_id TEXT,
  message TEXT NOT NULL DEFAULT '',
  target TEXT NOT NULL DEFAULT '',
  retry_count INTEGER NOT NULL DEFAULT 0,
  retry_of_log_id BIGINT,
  webhook_status TEXT,
  webhook_updated_at TIMESTAMPTZ,
  last_retried_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS notification_logs_group_id_idx ON notification_logs(group_id);
CREATE INDEX IF NOT EXISTS notification_logs_provider_idx ON notification_logs(provider, provider_id);

CREATE TABLE IF NOT EXISTS notification_queue (
  id BIGINT PRIMARY KEY,
  group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  log_id BIGINT NOT NULL REFERENCES notification_logs(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  from_member_id BIGINT NOT NULL REFERENCES members(id),
  to_member_id BIGINT NOT NULL REFERENCES members(id),
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  custom_message TEXT NOT NULL DEFAULT '',
  group_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 4,
  next_attempt_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  last_error TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS notification_queue_group_status_idx ON notification_queue(group_id, status, next_attempt_at);

CREATE TABLE IF NOT EXISTS group_invites (
  id BIGINT PRIMARY KEY,
  group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_by_user_id BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by_user_id BIGINT REFERENCES users(id),
  email_delivery JSONB,
  expired_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS group_invites_group_id_idx ON group_invites(group_id);
CREATE INDEX IF NOT EXISTS group_invites_token_hash_idx ON group_invites(token_hash);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGINT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS password_reset_tokens_token_hash_idx ON password_reset_tokens(token_hash);

COMMIT;
