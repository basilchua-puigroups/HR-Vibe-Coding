-- Add EFB overflow photos column to production_records.
--
-- Photos are stored as a JSONB array of {name, data} objects where `data` is a
-- Supabase Storage reference ("storage:{path}") resolved to a signed URL at
-- read time. The app uploads base64 images to Storage on sync and replaces
-- the data field with the storage ref.
--
-- Idempotent — safe to re-run.

ALTER TABLE production_records
  ADD COLUMN IF NOT EXISTS efb_photos jsonb NOT NULL DEFAULT '[]'::jsonb;

SELECT pg_notify('pgrst', 'reload schema');
