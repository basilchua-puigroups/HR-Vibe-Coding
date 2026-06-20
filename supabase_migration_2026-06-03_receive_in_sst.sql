-- Store SST percentage for Receive In item rows.
--
-- Total price is calculated in the app as:
--   (quantity * unit_price) + SST amount
--
-- Idempotent — safe to re-run.

ALTER TABLE receive_in_items
  ADD COLUMN IF NOT EXISTS sst_percent numeric NOT NULL DEFAULT 0;
