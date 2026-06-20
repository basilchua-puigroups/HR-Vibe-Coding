-- Add FIFO stock layers and layer consumption records.
--
-- Approved Receive In creates stock_layers. Approved Issue Out / Maintenance
-- consumes the oldest remaining layers first and records stock_layer_consumptions
-- so edits/deletes can restore the exact consumed layers.
--
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS stock_layers (
  id bigint PRIMARY KEY,
  item_id bigint NOT NULL,
  received_date date,
  source_type text NOT NULL DEFAULT '',
  source_ref text NOT NULL DEFAULT '',
  source_id bigint,
  source_line_idx integer,
  supplier_id bigint,
  supplier text NOT NULL DEFAULT '',
  quantity_received numeric NOT NULL DEFAULT 0,
  quantity_remaining numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT '',
  unit_price numeric NOT NULL DEFAULT 0,
  sst_percent numeric NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stock_layer_consumptions (
  id bigint PRIMARY KEY,
  layer_id bigint NOT NULL,
  item_id bigint NOT NULL,
  issue_date date,
  source_type text NOT NULL DEFAULT '',
  source_ref text NOT NULL DEFAULT '',
  source_id bigint,
  source_line_idx integer,
  quantity numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0
);

ALTER TABLE stock_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_layer_consumptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stock_layers' AND policyname = 'public_all'
  ) THEN
    CREATE POLICY "public_all" ON stock_layers FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stock_layer_consumptions' AND policyname = 'public_all'
  ) THEN
    CREATE POLICY "public_all" ON stock_layer_consumptions FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;
END $$;

SELECT pg_notify('pgrst', 'reload schema');
