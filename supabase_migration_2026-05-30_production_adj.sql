-- ── Production Report: month-end adjustment row ──────────────────────────────
-- Adds an `adj` flag so the last day of a month can carry a second "adjustment"
-- record (in-app it is dated `YYYY-MM-DD-adj`). Uniqueness moves from the bare
-- date to (production_date, adj) so a normal row and an adjustment row can share
-- the same date. Idempotent — safe to re-run.

ALTER TABLE production_records
  ADD COLUMN IF NOT EXISTS adj boolean NOT NULL DEFAULT false;

-- Drop the old single-column unique constraint (auto-named by Postgres) if present.
ALTER TABLE production_records
  DROP CONSTRAINT IF EXISTS production_records_production_date_key;

-- Add the composite unique constraint if it isn't already there.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'production_records_production_date_adj_key'
  ) THEN
    ALTER TABLE production_records
      ADD CONSTRAINT production_records_production_date_adj_key
      UNIQUE (production_date, adj);
  END IF;
END $$;
