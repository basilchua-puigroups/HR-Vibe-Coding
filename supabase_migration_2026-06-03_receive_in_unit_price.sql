-- Store unit price for Receive In rows that are not linked to a PO.
--
-- PO-linked Receive In prices still come from the PO. Direct/no-PO Stock In rows
-- need their own price so Item File history can show stock-in cost.
--
-- Idempotent — safe to re-run.

ALTER TABLE receive_in_items
  ADD COLUMN IF NOT EXISTS unit_price numeric NOT NULL DEFAULT 0;
