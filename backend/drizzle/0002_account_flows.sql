-- Add email to users (nullable first so existing rows survive, then backfill and constrain)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
UPDATE users SET email = name || '@placeholder.local' WHERE email IS NULL;
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email);
--> statement-breakpoint
-- Password reset tokens (mirrors invite_tokens pattern)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  token      TEXT NOT NULL UNIQUE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS prt_user_id_idx ON password_reset_tokens(user_id);
