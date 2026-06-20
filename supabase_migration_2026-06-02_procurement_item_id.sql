-- Link procurement item snapshots back to Item File rows where possible.
--
-- IRF/RFQ items historically stored only description/unit. The app now saves
-- `item_id` when an Item File row is selected, and carries it IRF → RFQ → PO.
-- PO items already had `item_id`; this also backfills old PO rows by exact item
-- name where possible.
--
-- Idempotent — safe to re-run.

ALTER TABLE item_request_items
  ADD COLUMN IF NOT EXISTS item_id bigint;

ALTER TABLE rfq_items
  ADD COLUMN IF NOT EXISTS item_id bigint;
♦a[[[[[[[[[[[[[[[cvx yn5c=g c 
UPDATE item_request_items iri
SET item_id = inv.id
FROM inventory_items inv
WHERE iri.item_id IS NULL
  AND lower(trim(iri.description)) = lower(trim(inv.item));

UPDATE rfq_items ri
SET item_id = inv.id
FROM inventory_items inv
WHERE ri.item_id IS NULL
  AND lower(trim(ri.description)) = lower(trim(inv.item));

UPDATE purchase_order_items poi
SET item_id = inv.id
FROM inventory_items inv
WHERE poi.item_id IS NULL
  AND lower(trim(poi.description)) = lower(trim(inv.item));
