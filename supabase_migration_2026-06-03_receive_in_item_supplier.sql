-- Store supplier per Receive In item row.
--
-- No-PO Stock In can contain items from different suppliers, so supplier needs
-- to live on each item row. PO-linked rows still copy the PO supplier.
--
-- Idempotent — safe to re-run.

ALTER TABLE receive_in_items
  ADD COLUMN IF NOT EXISTS supplier_id bigint,
  ADD COLUMN IF NOT EXISTS supplier text NOT NULL DEFAULT '';

UPDATE receive_in_items rii
SET supplier_id = ri.supplier_id,
    supplier = ri.supplier
FROM receive_ins ri
WHERE rii.receive_in_id = ri.id
  AND (rii.supplier IS NULL OR trim(rii.supplier) = '')
  AND trim(ri.supplier) <> '';

SELECT pg_notify('pgrst', 'reload schema');
