-- Link Receive In records back to Purchase Orders.
--
-- Receive In previously stored PO/DO references as free text only. The app now
-- stores a nullable PO link on the receive parent, plus the source PO line index
-- on each receive item, so Item File purchase history can show ordered/received/
-- pending quantities.
--
-- Idempotent — safe to re-run.

ALTER TABLE receive_ins
  ADD COLUMN IF NOT EXISTS po_id bigint,
  ADD COLUMN IF NOT EXISTS po_no text NOT NULL DEFAULT '';

ALTER TABLE receive_in_items
  ADD COLUMN IF NOT EXISTS po_item_idx integer;

UPDATE receive_ins ri
SET po_id = po.id,
    po_no = po.po_no
FROM purchase_orders po
WHERE ri.po_id IS NULL
  AND lower(trim(ri.reference)) = lower(trim(po.po_no));
