-- ── Drop the legacy plaintext password column ───────────────────────────────
-- After migrating login to Supabase Auth, the `user_settings.password` column is
-- unused and held passwords in plain text (readable by anyone with the anon key).
-- Auth now stores hashed passwords in auth.users, so this column is dead weight.
--
-- RUN THIS ONLY AFTER:
--   1. Every remaining user has a Supabase Auth account (others deleted/migrated), and
--   2. The updated app (which no longer writes the `password` column) is deployed.
-- Idempotent — safe to re-run.

ALTER TABLE user_settings
  DROP COLUMN IF EXISTS password;
