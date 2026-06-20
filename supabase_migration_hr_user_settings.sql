-- Migration: create HR-specific user tables
-- The HR app uses hr_user_settings / hr_user_permissions instead of the
-- shared user_settings / user_permissions tables, so that users created in
-- other apps on the same Supabase project cannot log into the HR app.

CREATE TABLE IF NOT EXISTS hr_user_settings (
  id                        bigint PRIMARY KEY,
  username                  text NOT NULL DEFAULT '',
  email                     text NOT NULL DEFAULT '',
  auth_user_id              text,
  is_admin                  boolean NOT NULL DEFAULT false,
  can_access_human_resources boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS hr_user_permissions (
  id         bigserial PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES hr_user_settings(id) ON DELETE CASCADE,
  permission text NOT NULL DEFAULT ''
);

-- RLS
ALTER TABLE hr_user_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON hr_user_settings    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON hr_user_permissions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Optional: copy existing HR users from the shared user_settings table.
-- Run this block manually if you want to migrate existing users rather than
-- re-creating them through the HR Administrator page.
--
-- INSERT INTO hr_user_settings (id, username, email, auth_user_id, is_admin, can_access_human_resources)
-- SELECT id, username, email, auth_user_id, is_admin, true
-- FROM user_settings
-- WHERE can_access_human_resources = true
-- ON CONFLICT (id) DO NOTHING;
--
-- INSERT INTO hr_user_permissions (user_id, permission)
-- SELECT p.user_id, p.permission
-- FROM user_permissions p
-- JOIN hr_user_settings h ON h.id = p.user_id
-- ON CONFLICT DO NOTHING;
