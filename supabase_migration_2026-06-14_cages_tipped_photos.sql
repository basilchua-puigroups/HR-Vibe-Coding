-- Migration: cages_tipped_photos
-- Stores per-shift, per-date photo uploads for the Cages Tipped payroll module.
-- Photo binaries are in Supabase Storage (attachments bucket) under cages-tipped/{shift}/{date}/{id}.{ext}
-- photo_data holds a "storage:{path}" reference resolved to a signed URL on fetch.

CREATE TABLE IF NOT EXISTS cages_tipped_photos (
  id         bigint      PRIMARY KEY,
  shift      text        NOT NULL DEFAULT '',
  date       date,
  photo_name text        NOT NULL DEFAULT '',
  photo_data text        NOT NULL DEFAULT '',
  captured_at text       NOT NULL DEFAULT ''
);

ALTER TABLE cages_tipped_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON cages_tipped_photos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
