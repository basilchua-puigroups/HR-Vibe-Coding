-- Add a delivery checkpoint to Purchase Orders.
--
-- Approved PO means the order is authorized. Goods Delivered means the supplier
-- has delivered the goods and the PO can be imported into Receive In.
--
-- Idempotent — safe to re-run.

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS goods_delivered_by text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS goods_delivered_date date;
