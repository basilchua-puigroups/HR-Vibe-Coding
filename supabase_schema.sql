-- ============================================================
-- COMPLETE SCHEMA – Proper relational tables
-- Replaces the old single-JSON-blob (mp_app_state) approach.
-- Run in Supabase SQL Editor to set up or reset the database.
-- ============================================================

-- ── Drop old tables (cascade handles FK dependencies) ─────
DROP TABLE IF EXISTS mp_app_state CASCADE;
DROP TABLE IF EXISTS purchases CASCADE;
DROP TABLE IF EXISTS production_batches CASCADE;

-- ── Drop new tables if re-running (idempotent) ────────────
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS production_records CASCADE;
DROP TABLE IF EXISTS user_verify_item_limits CASCADE;
DROP TABLE IF EXISTS user_approval_item_limits CASCADE;
DROP TABLE IF EXISTS user_permissions CASCADE;
DROP TABLE IF EXISTS user_settings CASCADE;
DROP TABLE IF EXISTS receive_in_items CASCADE;
DROP TABLE IF EXISTS receive_ins CASCADE;
DROP TABLE IF EXISTS issue_out_items CASCADE;
DROP TABLE IF EXISTS issue_outs CASCADE;
DROP TABLE IF EXISTS fixed_assets CASCADE;
DROP TABLE IF EXISTS diesel_equipment CASCADE;
DROP TABLE IF EXISTS maintenance_jobs CASCADE;
DROP TABLE IF EXISTS stock_layer_consumptions CASCADE;
DROP TABLE IF EXISTS stock_layers CASCADE;
DROP TABLE IF EXISTS stock_movements CASCADE;
DROP TABLE IF EXISTS rfq_ccr_item_prices CASCADE;
DROP TABLE IF EXISTS rfq_ccr_items CASCADE;
DROP TABLE IF EXISTS rfq_ccr CASCADE;
DROP TABLE IF EXISTS rfq_supplier_quot_files CASCADE;
DROP TABLE IF EXISTS rfq_suppliers CASCADE;
DROP TABLE IF EXISTS rfq_items CASCADE;
DROP TABLE IF EXISTS request_quotations CASCADE;
DROP TABLE IF EXISTS item_request_items CASCADE;
DROP TABLE IF EXISTS item_requests CASCADE;
DROP TABLE IF EXISTS po_invoice_files CASCADE;
DROP TABLE IF EXISTS po_do_files CASCADE;
DROP TABLE IF EXISTS purchase_order_items CASCADE;
DROP TABLE IF EXISTS purchase_orders CASCADE;
DROP TABLE IF EXISTS station_equipment CASCADE;
DROP TABLE IF EXISTS stations CASCADE;
DROP TABLE IF EXISTS locations CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS inventory_items CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS app_sync_log CASCADE;

-- ── Sync sentinel ─────────────────────────────────────────
-- One row (id=1) updated on every push; realtime subscription
-- watches this table so other tabs know to refetch.
CREATE TABLE app_sync_log (
  id integer PRIMARY KEY,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Master data ───────────────────────────────────────────
CREATE TABLE categories (
  id bigint PRIMARY KEY,
  code text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT ''
);

CREATE TABLE locations (
  id bigint PRIMARY KEY,
  code text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT ''
);

CREATE TABLE stations (
  id bigint PRIMARY KEY,
  code text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  location_id bigint,          -- nullable; no FK (location may be free-text)
  description text NOT NULL DEFAULT ''
);

-- Equipment belongs to one station; uses its own stable id (from TypeScript Date.now())
CREATE TABLE station_equipment (
  id bigserial PRIMARY KEY,
  equipment_id bigint NOT NULL,          -- original Equipment.id from TypeScript
  station_id bigint NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  code text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0
);

-- ── Suppliers & Inventory ─────────────────────────────────
CREATE TABLE suppliers (
  id bigint PRIMARY KEY,
  supplier_id text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'Parts',
  category text NOT NULL DEFAULT '',
  contact text NOT NULL DEFAULT '',
  region text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  fax text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  balance numeric NOT NULL DEFAULT 0
);

CREATE TABLE inventory_items (
  id bigint PRIMARY KEY,
  stock_id text NOT NULL DEFAULT '',
  item text NOT NULL DEFAULT '',
  part_no text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT '',
  reorder_level numeric NOT NULL DEFAULT 0,
  location text NOT NULL DEFAULT ''
);

-- ── Purchase Orders ───────────────────────────────────────
CREATE TABLE purchase_orders (
  id bigint PRIMARY KEY,
  po_no text NOT NULL DEFAULT '',
  po_date date,
  supplier text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  fax text NOT NULL DEFAULT '',
  section text NOT NULL DEFAULT '',
  remarks text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Ordered',
  total numeric NOT NULL DEFAULT 0,
  supplier_id bigint,            -- nullable FK (may not link to suppliers table)
  delivery_order_no text NOT NULL DEFAULT '',
  delivery_order_date date,
  delivery_order_file_name text NOT NULL DEFAULT '',
  delivery_order_file_data text NOT NULL DEFAULT '',
  received_quantity numeric NOT NULL DEFAULT 0,
  verified_by text NOT NULL DEFAULT '',
  verified_date date,
  approved_by text NOT NULL DEFAULT '',
  approved_date date,
  goods_delivered_by text NOT NULL DEFAULT '',
  goods_delivered_date date
);

CREATE TABLE purchase_order_items (
  id bigserial PRIMARY KEY,
  po_id bigint NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  item_id bigint,                -- nullable; cross-module ref to inventory_items
  req_no text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT '',
  unit_price numeric NOT NULL DEFAULT 0,
  sst_percent numeric NOT NULL DEFAULT 0,
  purpose text NOT NULL DEFAULT '',
  quotations text NOT NULL DEFAULT '',
  remarks text NOT NULL DEFAULT '',
  file_name text NOT NULL DEFAULT '',
  file_data text NOT NULL DEFAULT ''
);

CREATE TABLE po_do_files (
  id bigserial PRIMARY KEY,
  po_id bigint NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  name text NOT NULL DEFAULT '',
  data text NOT NULL DEFAULT '',
  ref_no text NOT NULL DEFAULT ''
);

CREATE TABLE po_invoice_files (
  id bigserial PRIMARY KEY,
  po_id bigint NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  name text NOT NULL DEFAULT '',
  data text NOT NULL DEFAULT '',
  ref_no text NOT NULL DEFAULT ''
);

-- ── Request For Quotations ────────────────────────────────
CREATE TABLE request_quotations (
  id bigint PRIMARY KEY,
  rfq_no text NOT NULL DEFAULT '',
  rfq_date date,
  rfq_type text NOT NULL DEFAULT '',
  supplier text NOT NULL DEFAULT '',
  remarks text NOT NULL DEFAULT '',
  total numeric NOT NULL DEFAULT 0,
  irf_ref text NOT NULL DEFAULT ''
);

CREATE TABLE rfq_suppliers (
  id bigserial PRIMARY KEY,
  rfq_id bigint NOT NULL REFERENCES request_quotations(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  supplier_id bigint,            -- nullable; cross-module ref to suppliers
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  fax text NOT NULL DEFAULT ''
);

CREATE TABLE rfq_supplier_quot_files (
  id bigserial PRIMARY KEY,
  rfq_supplier_id bigint NOT NULL REFERENCES rfq_suppliers(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  name text NOT NULL DEFAULT '',
  data text NOT NULL DEFAULT '',
  ref_no text NOT NULL DEFAULT ''
);

CREATE TABLE rfq_items (
  id bigserial PRIMARY KEY,
  rfq_id bigint NOT NULL REFERENCES request_quotations(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  item_id bigint,                -- nullable; cross-module ref to inventory_items
  description text NOT NULL DEFAULT '',
  quantity text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT '',
  unit_price text NOT NULL DEFAULT '',
  amount text NOT NULL DEFAULT '',
  remarks text NOT NULL DEFAULT '',
  file_name text NOT NULL DEFAULT '',
  file_data text NOT NULL DEFAULT '',
  src_irf text NOT NULL DEFAULT '',
  src_item_idx integer
);

-- One CCR per RFQ (enforced by UNIQUE)
CREATE TABLE rfq_ccr (
  id bigserial PRIMARY KEY,
  rfq_id bigint NOT NULL REFERENCES request_quotations(id) ON DELETE CASCADE,
  saved_at text NOT NULL DEFAULT '',
  UNIQUE (rfq_id)
);

CREATE TABLE rfq_ccr_items (
  id bigserial PRIMARY KEY,
  ccr_id bigint NOT NULL REFERENCES rfq_ccr(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,   -- corresponds to rfq_items sort_order
  remarks text NOT NULL DEFAULT '',
  last_price text NOT NULL DEFAULT '',
  last_price_date text NOT NULL DEFAULT '',
  selected_supplier integer,               -- NULL = no selection
  selected_option integer,                 -- NULL = no selection
  po_ref text NOT NULL DEFAULT ''
);

-- option_idx NULL  → supplierPrices[supplier_idx]  (legacy single price)
-- option_idx >= 0  → supplierOptions[supplier_idx][option_idx]
CREATE TABLE rfq_ccr_item_prices (
  id bigserial PRIMARY KEY,
  ccr_item_id bigint NOT NULL REFERENCES rfq_ccr_items(id) ON DELETE CASCADE,
  supplier_idx integer NOT NULL,
  option_idx integer,
  price text NOT NULL DEFAULT '',
  remark text NOT NULL DEFAULT ''
);

-- ── Item Requests (IRF) ───────────────────────────────────
CREATE TABLE item_requests (
  id bigint PRIMARY KEY,
  ref_no text NOT NULL DEFAULT '',
  request_to text NOT NULL DEFAULT 'Purchasing Manager',
  request_date date,
  request_type text NOT NULL DEFAULT '',
  requested_by text NOT NULL DEFAULT '',
  remarks text NOT NULL DEFAULT '',
  approval_status text NOT NULL DEFAULT 'Pending',
  approved_by text NOT NULL DEFAULT '',
  approved_date date
);

CREATE TABLE item_request_items (
  id bigserial PRIMARY KEY,
  request_id bigint NOT NULL REFERENCES item_requests(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  item_id bigint,                -- nullable; cross-module ref to inventory_items
  description text NOT NULL DEFAULT '',
  quantity text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT '',
  purpose text NOT NULL DEFAULT '',
  remarks text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  file_name text NOT NULL DEFAULT '',
  file_data text NOT NULL DEFAULT ''
);

-- ── Stock Movements ───────────────────────────────────────
-- item_id has no FK (cross-module; RESTRICT would block inventory deletes)
CREATE TABLE stock_movements (
  id bigint PRIMARY KEY,
  item_id bigint NOT NULL,
  movement_date date,
  movement_type text NOT NULL DEFAULT 'Adjust',
  stock_type text NOT NULL DEFAULT '',
  reference text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 0,
  note text NOT NULL DEFAULT '',
  receive_no text NOT NULL DEFAULT '',
  paired_movement_id bigint,
  uploaded_to_tx boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT '',
  approved_by text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT ''
);

-- ── Issue Outs ────────────────────────────────────────────
-- FIFO stock valuation layers. Each approved stock-in creates layers; issue
-- approvals consume the oldest remaining layers first.
CREATE TABLE stock_layers (
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

CREATE TABLE stock_layer_consumptions (
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

CREATE TABLE issue_outs (
  id bigint PRIMARY KEY,
  issue_no text NOT NULL DEFAULT '',
  issued_to text NOT NULL DEFAULT '',
  remarks text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Pending',
  verified_by text NOT NULL DEFAULT '',
  approved_by text NOT NULL DEFAULT '',
  uploaded_to_tx boolean NOT NULL DEFAULT false,
  is_direct_issue boolean NOT NULL DEFAULT false
);

-- is_pre_edit = false → IssueOut.items; true → IssueOut.preEditItems
-- item_id has no FK (cross-module)
CREATE TABLE issue_out_items (
  id bigserial PRIMARY KEY,
  issue_out_id bigint NOT NULL REFERENCES issue_outs(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  is_pre_edit boolean NOT NULL DEFAULT false,
  item_id bigint NOT NULL,
  description text NOT NULL DEFAULT '',
  quantity text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT '',
  station text NOT NULL DEFAULT '',
  equipment text NOT NULL DEFAULT '',
  purpose text NOT NULL DEFAULT '',
  worker_name text NOT NULL DEFAULT ''
);

-- ── Receive In Records ────────────────────────────────────
CREATE TABLE receive_ins (
  id bigint PRIMARY KEY,
  receive_no text NOT NULL DEFAULT '',
  receive_date date,
  stock_type text NOT NULL DEFAULT 'Stock In',
  issued_to text NOT NULL DEFAULT '',
  reference text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  po_id bigint,
  po_no text NOT NULL DEFAULT '',
  supplier_id bigint,
  supplier text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '',
  approved_by text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT '',
  linked_issue_no text NOT NULL DEFAULT ''
);

-- item_id has no FK (cross-module)
CREATE TABLE receive_in_items (
  id bigserial PRIMARY KEY,
  receive_in_id bigint NOT NULL REFERENCES receive_ins(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  item_id bigint NOT NULL,
  po_item_idx integer,
  quantity numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT '',
  supplier_id bigint,
  supplier text NOT NULL DEFAULT '',
  unit_price numeric NOT NULL DEFAULT 0,
  sst_percent numeric NOT NULL DEFAULT 0
);

-- ── Fixed Assets ──────────────────────────────────────────
-- item_id has no FK (cross-module, nullable)
CREATE TABLE fixed_assets (
  id bigint PRIMARY KEY,
  asset_no text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  station text NOT NULL DEFAULT '',
  equipment text NOT NULL DEFAULT '',
  item_id bigint,
  purchase_date date,
  purchase_value numeric NOT NULL DEFAULT 0,
  current_value numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT '',
  remarks text NOT NULL DEFAULT ''
);

CREATE TABLE diesel_equipment (
  id bigint PRIMARY KEY,
  fixed_asset_id bigint,
  asset_no text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  station text NOT NULL DEFAULT '',
  equipment text NOT NULL DEFAULT '',
  equipment_type text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '',
  remarks text NOT NULL DEFAULT ''
);

-- ── Maintenance Jobs ──────────────────────────────────────
-- item_id has no FK (cross-module)
CREATE TABLE maintenance_jobs (
  id bigint PRIMARY KEY,
  job_no text NOT NULL DEFAULT '',
  job_date date,
  equipment text NOT NULL DEFAULT '',
  technician text NOT NULL DEFAULT '',
  item_id bigint NOT NULL,
  quantity_used numeric NOT NULL DEFAULT 0,
  remarks text NOT NULL DEFAULT ''
);

-- ── User Settings ─────────────────────────────────────────
CREATE TABLE user_settings (
  id bigint PRIMARY KEY,
  username text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  auth_user_id uuid,
  is_admin boolean NOT NULL DEFAULT false,
  can_access_procurement boolean NOT NULL DEFAULT false,
  can_access_inventory boolean NOT NULL DEFAULT false,
  can_access_maintenance boolean NOT NULL DEFAULT false,
  can_access_process boolean NOT NULL DEFAULT false,
  can_access_human_resources boolean NOT NULL DEFAULT false,
  approval_limit numeric,
  verify_limit numeric
);

CREATE TABLE user_permissions (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES user_settings(id) ON DELETE CASCADE,
  permission text NOT NULL DEFAULT ''
);

CREATE TABLE user_approval_item_limits (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES user_settings(id) ON DELETE CASCADE,
  item_id bigint NOT NULL,
  item_name text NOT NULL DEFAULT '',
  limit_amount numeric NOT NULL DEFAULT 0
);

CREATE TABLE user_verify_item_limits (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES user_settings(id) ON DELETE CASCADE,
  item_id bigint NOT NULL,
  item_name text NOT NULL DEFAULT '',
  limit_amount numeric NOT NULL DEFAULT 0
);

-- ── Audit Trail ───────────────────────────────────────────
-- Permanent record of user actions across every module.
CREATE TABLE audit_logs (
  id bigint PRIMARY KEY,
  timestamp text NOT NULL DEFAULT '',
  username text NOT NULL DEFAULT '',
  user_id bigint NOT NULL DEFAULT 0,
  module text NOT NULL DEFAULT '',
  action text NOT NULL DEFAULT '',
  record_type text NOT NULL DEFAULT '',
  record_ref text NOT NULL DEFAULT '',
  record_id bigint,
  details text NOT NULL DEFAULT ''
);

-- â”€â”€ Production Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- One row per production date. Manual/carry values are stored as keyed JSON;
-- report-only calculated values are derived in the app.
-- `adj` flags the optional month-end adjustment row; a day may have one normal
-- row (adj=false) and one adjustment row (adj=true), so uniqueness is composite.
CREATE TABLE production_records (
  id bigint PRIMARY KEY,
  production_date date NOT NULL,
  adj boolean NOT NULL DEFAULT false,
  values jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (production_date, adj)
);

-- ── Row Level Security ────────────────────────────────────
ALTER TABLE app_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_do_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_invoice_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_supplier_quot_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_ccr ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_ccr_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_ccr_item_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_layer_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_outs ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_out_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE receive_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE receive_in_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE diesel_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_approval_item_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_verify_item_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_records ENABLE ROW LEVEL SECURITY;

-- ── Public access policies (anon + authenticated) ────────────────────────
CREATE POLICY "public_all" ON app_sync_log              FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON categories                FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON locations                 FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON stations                  FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON station_equipment         FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON suppliers                 FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON inventory_items           FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON purchase_orders           FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON purchase_order_items      FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON po_do_files               FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON po_invoice_files          FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON request_quotations        FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON rfq_suppliers             FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON rfq_supplier_quot_files   FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON rfq_items                 FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON rfq_ccr                   FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON rfq_ccr_items             FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON rfq_ccr_item_prices       FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON item_requests             FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON item_request_items        FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON stock_movements           FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON stock_layers              FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON stock_layer_consumptions  FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON issue_outs                FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON issue_out_items           FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON receive_ins               FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON receive_in_items          FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON fixed_assets              FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON diesel_equipment          FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON maintenance_jobs          FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON user_settings             FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON user_permissions          FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON user_approval_item_limits FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON user_verify_item_limits   FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON audit_logs                FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON production_records        FOR ALL TO public USING (true) WITH CHECK (true);
