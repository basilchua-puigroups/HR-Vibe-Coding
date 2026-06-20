-- ── Supabase Auth migration: link user_settings to auth.users ────────────────
-- Adds `email` (the login email mirrored from auth.users) and `auth_user_id`
-- (FK-ish reference to auth.users.id) to user_settings. Sign-in still happens by
-- username in the app, which resolves the username → email before calling
-- supabase.auth.signInWithPassword(). The legacy plaintext `password` column is
-- kept for now (still mapped by the sync layer); a later cleanup migration can
-- blank/drop it once the auth backfill is verified. Idempotent — safe to re-run.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS auth_user_id uuid;

-- One auth account per email. Partial so the many ''-default rows don't collide
-- before backfill assigns each user a real or synthetic (username@millparts.local) email.
CREATE UNIQUE INDEX IF NOT EXISTS user_settings_email_key
  ON user_settings (lower(email))
  WHERE email <> '';
