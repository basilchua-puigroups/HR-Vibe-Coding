-- Link RFQ supplier snapshots back to Supplier File rows where possible.
--
-- RFQs historically stored only supplier name/email/fax. The app now also saves
-- `supplier_id` when a Supplier File row is selected, so supplier delete checks
-- can use a stable id instead of only name matching.
--
-- Idempotent — safe to re-run.

ALTER TABLE rfq_suppliers
  ADD COLUMN IF NOT EXISTS supplier_id bigint;

UPDATE rfq_suppliers rs
SET supplier_id = s.id
FROM suppliers s
WHERE rs.supplier_id IS NULL
  AND lower(trim(rs.name)) = lower(trim(s.name));
