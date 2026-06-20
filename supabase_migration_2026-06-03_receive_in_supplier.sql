-- Store supplier on Receive In records that are not linked to a PO.
--
-- PO-linked Receive In records can infer supplier from the PO, but direct
-- Stock In needs its own supplier value so Item File purchase history is clear.
--
-- Idempotent — safe to re-run.

ALTER TABLE receive_ins
  ADD COLUMN IF NOT EXISTS supplier_id bigint,
  ADD COLUMN IF NOT EXISTS supplier text NOT NULL DEFAULT '';

SELECT pg_notify('pgrst', 'reload schema');
