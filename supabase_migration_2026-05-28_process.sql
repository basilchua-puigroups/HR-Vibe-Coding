-- Incremental migration for Process / Production Report sync.
-- Run this in Supabase SQL Editor on an existing database.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS can_access_maintenance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_access_process boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_access_human_resources boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS production_records (
  id bigint PRIMARY KEY,
  production_date date NOT NULL UNIQUE,
  values jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS diesel_equipment (
  id bigint PRIMARY KEY,
  fixed_asset_id bigint,
  asset_no text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  station text NOT NULL DEFAULT '',
  equipment text NOT NULL DEFAULT '',
  equipment_type text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '',
  remarks text NOT NULL DEFAULT ''
);

ALTER TABLE production_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE diesel_equipment ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'production_records'
      AND policyname = 'public_all'
  ) THEN
    CREATE POLICY "public_all" ON production_records
      FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'diesel_equipment'
      AND policyname = 'public_all'
  ) THEN
    CREATE POLICY "public_all" ON diesel_equipment
      FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
