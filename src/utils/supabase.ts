import { createClient } from '@supabase/supabase-js';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type {
  AppState, Supplier, InventoryItem, Order, OrderItem,
  RFQ, RFQSupplier, RFQItem, CcrData, CcrItem, CcrSupplierPrice,
  ItemRequest, RequestItem, Movement, Category, Location,
  Station, Equipment, IssueOut, IssueOutItem, ReceiveInRecord,
  ReceiveInItem, FixedAsset, DieselEquipment, MaintenanceJob, UserSetting, AuditLog, ProductionRecord,
  StockLayer, StockLayerConsumption, CagesTippedPhoto, Worker, WorkerAttendance,
} from '../types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase = url && key
  ? createClient(url, key, { auth: { storage: window.sessionStorage } })
  : null;
export const supabaseConfigured = !!supabase;

// ─────────────────────────────────────────────────────────────────────────────
// Generic helpers
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function str(v: unknown, fallback = ''): string {
  return v == null ? fallback : String(v);
}
function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}
function bool(v: unknown, fallback = false): boolean {
  return v == null ? fallback : Boolean(v);
}

/** Group an array of DB rows by a numeric column. */
function groupBy(arr: Row[], key: string): Map<number, Row[]> {
  const map = new Map<number, Row[]>();
  for (const item of arr) {
    const k = num(item[key]);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  }
  return map;
}

/** Throw on Supabase errors (skips null). */
function check(error: unknown, ctx: string) {
  if (!error) return;
  // Supabase errors are objects with a message property
  const msg = (error as { message?: string })?.message ?? JSON.stringify(error);
  const err = new Error(`[supabase:${ctx}] ${msg}`);
  console.error(err.message, error);
  throw err;
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase Storage helpers
// File attachments are stored as binary objects in the `attachments` bucket.
// Only a compact "storage:{path}" reference is written to DB text columns —
// eliminating the large base64 payload that caused statement timeouts.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_BUCKET = 'attachments';
const STORAGE_REF_PREFIX = 'storage:';

/** Return the file extension (with leading dot, lower-cased), or '' if none. */
function fileExt(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

const isBase64DataUrl = (s: string): boolean => s.startsWith('data:');
const isSignedUrl     = (s: string): boolean => s.startsWith('https://');
const isStorageRef    = (s: string): boolean => s.startsWith(STORAGE_REF_PREFIX);

/**
 * Extract the storage-object path from a Supabase Storage signed URL.
 * URL format: https://{project}.supabase.co/storage/v1/object/sign/{bucket}/{path}?token=…
 */
function storagePathFromSignedUrl(url: string): string | null {
  try {
    const { pathname } = new URL(url);
    const m = pathname.match(/\/storage\/v1\/object\/sign\/[^/]+\/(.+)$/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch { return null; }
}

/**
 * Upload a base64 data URL to the `attachments` bucket.
 * @param dataUrl  "data:…;base64,…" string from FileReader.readAsDataURL().
 * @param path     Destination path inside the bucket (e.g. "rfq-quot/745/0/0.pdf").
 */
async function uploadToStorage(dataUrl: string, path: string): Promise<void> {
  const [header, b64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'application/octet-stream';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  const { error } = await db().storage.from(STORAGE_BUCKET).upload(path, blob, { upsert: true });
  if (error) {
    const msg = (error as { message?: string }).message ?? String(error);
    throw new Error(`[supabase:storage:upload:${path}] ${msg}`);
  }
}

/**
 * Convert in-memory file data to a value safe for DB insertion.
 * • base64 data URL  → upload binary to Storage → return "storage:{path}"
 * • https signed URL → recover the existing path  → return "storage:{path}"
 * • already "storage:…" or empty                 → return as-is
 *
 * `storagePath` must be deterministic per file slot so that re-syncing the same
 * attachment upserts the Storage object rather than creating a duplicate.
 */
async function toDbData(data: string, storagePath: string): Promise<string> {
  if (!data) return '';
  if (isBase64DataUrl(data)) {
    await uploadToStorage(data, storagePath);
    return `${STORAGE_REF_PREFIX}${storagePath}`;
  }
  if (isSignedUrl(data)) {
    const path = storagePathFromSignedUrl(data);
    return path ? `${STORAGE_REF_PREFIX}${path}` : '';
  }
  return data; // already "storage:…" or unexpected value — pass through
}

/**
 * Walk the freshly-assembled AppState and replace every "storage:{path}"
 * value with a short-lived signed URL (1-hour TTL), so the UI can display
 * and download attachments directly.  All signing is batched in chunks of 100
 * to minimise Supabase round-trips.  Mutates `state` in place.
 */
async function resolveStorageRefs(state: AppState): Promise<void> {
  const paths: string[]                      = [];
  const setters: Array<(url: string) => void> = [];

  const reg = (data: string, set: (u: string) => void) => {
    if (isStorageRef(data)) {
      paths.push(data.slice(STORAGE_REF_PREFIX.length));
      setters.push(set);
    }
  };

  for (const o of state.orders) {
    for (const item of o.items)           reg(item.fileData,          (u) => { item.fileData          = u; });
    reg(o.deliveryOrderFileData,                                       (u) => { o.deliveryOrderFileData = u; });
    for (const f of o.doFiles      ?? []) reg(f.data,                 (u) => { f.data = u; });
    for (const f of o.invoiceFiles ?? []) reg(f.data,                 (u) => { f.data = u; });
  }
  for (const r of state.rfqs) {
    for (const item of r.items)           reg(item.fileData,          (u) => { item.fileData = u; });
    for (const s of r.suppliers)
      for (const f of s.quotFiles ?? [])  reg(f.data,                 (u) => { f.data = u; });
  }
  for (const r of state.requests)
    for (const item of r.items)           reg(item.fileData,          (u) => { item.fileData = u; });
  for (const r of state.production ?? [])
    for (const p of r.efbPhotos ?? [])    reg(p.data,                 (u) => { p.data = u; });
  for (const p of state.cagesTippedPhotos ?? [])
                                           reg(p.photoData,            (u) => { p.photoData = u; });
  for (const a of state.workerAttendance ?? [])
                                           reg(a.photoData,            (u) => { a.photoData = u; });

  if (paths.length === 0) return;

  const CHUNK = 100; // Supabase createSignedUrls limit
  for (let i = 0; i < paths.length; i += CHUNK) {
    const chunk = paths.slice(i, i + CHUNK);
    const { data: signed, error } =
      await db().storage.from(STORAGE_BUCKET).createSignedUrls(chunk, 3600);
    if (error) { console.warn('[supabase:storage:batch-sign]', error); continue; }
    (signed ?? []).forEach((entry: { signedUrl: string | null }, j: number) => {
      setters[i + j](entry.signedUrl ?? '');
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DB → TypeScript mappers
// ─────────────────────────────────────────────────────────────────────────────

function dbToSupplier(r: Row): Supplier {
  return {
    id: num(r.id),
    supplierId: str(r.supplier_id),
    name: str(r.name),
    category: str(r.category),
    contact: str(r.contact),
    region: str(r.region),
    address: str(r.address),
    phone: str(r.phone),
    fax: str(r.fax),
    email: str(r.email),
    balance: num(r.balance),
  };
}

function dbToInventoryItem(r: Row): InventoryItem {
  return {
    id: num(r.id),
    stockId: str(r.stock_id),
    item: str(r.item),
    partNo: str(r.part_no),
    category: str(r.category),
    quantity: num(r.quantity),
    unit: str(r.unit),
    reorder: num(r.reorder_level),
    location: str(r.location),
  };
}

function dbToStockLayer(r: Row): StockLayer {
  return {
    id: num(r.id),
    itemId: num(r.item_id),
    receivedDate: str(r.received_date),
    sourceType: str(r.source_type),
    sourceRef: str(r.source_ref),
    sourceId: r.source_id != null ? num(r.source_id) : undefined,
    sourceLineIdx: r.source_line_idx != null ? num(r.source_line_idx) : undefined,
    supplierId: r.supplier_id != null ? num(r.supplier_id) : undefined,
    supplier: r.supplier ? str(r.supplier) : undefined,
    quantityReceived: num(r.quantity_received),
    quantityRemaining: num(r.quantity_remaining),
    unit: str(r.unit),
    unitPrice: num(r.unit_price),
    sstPercent: num(r.sst_percent),
  };
}

function dbToStockLayerConsumption(r: Row): StockLayerConsumption {
  return {
    id: num(r.id),
    layerId: num(r.layer_id),
    itemId: num(r.item_id),
    issueDate: str(r.issue_date),
    sourceType: str(r.source_type),
    sourceRef: str(r.source_ref),
    sourceId: r.source_id != null ? num(r.source_id) : undefined,
    sourceLineIdx: r.source_line_idx != null ? num(r.source_line_idx) : undefined,
    quantity: num(r.quantity),
    unitCost: num(r.unit_cost),
  };
}

function dbToCategory(r: Row): Category {
  return { id: num(r.id), code: str(r.code), name: str(r.name), description: str(r.description) };
}

function dbToLocation(r: Row): Location {
  return { id: num(r.id), code: str(r.code), name: str(r.name), description: str(r.description) };
}

function dbToEquipment(r: Row): Equipment {
  return { id: num(r.equipment_id), code: str(r.code), name: str(r.name), description: str(r.description) };
}

function dbToStation(r: Row, equipment: Row[]): Station {
  return {
    id: num(r.id),
    code: str(r.code),
    name: str(r.name),
    locationId: num(r.location_id),
    description: str(r.description),
    equipment: [...equipment].sort((a, b) => num(a.sort_order) - num(b.sort_order)).map(dbToEquipment),
  };
}

function dbToOrderItem(r: Row): OrderItem {
  return {
    itemId: r.item_id != null ? num(r.item_id) : undefined,
    reqNo: str(r.req_no),
    description: str(r.description),
    quantity: num(r.quantity),
    unit: str(r.unit),
    unitPrice: num(r.unit_price),
    sstPercent: num(r.sst_percent),
    purpose: str(r.purpose),
    quotations: str(r.quotations),
    remarks: str(r.remarks),
    fileName: str(r.file_name),
    fileData: str(r.file_data),
  };
}

function dbToFileEntry(r: Row): { name: string; data: string; refNo?: string } {
  return { name: str(r.name), data: str(r.data), refNo: r.ref_no ? str(r.ref_no) : undefined };
}

function dbToOrder(r: Row, items: Row[], doFiles: Row[], invoiceFiles: Row[]): Order {
  const sortedItems = [...items].sort((a, b) => num(a.sort_order) - num(b.sort_order));
  const sortedDo    = [...doFiles].sort((a, b) => num(a.sort_order) - num(b.sort_order));
  const sortedInv   = [...invoiceFiles].sort((a, b) => num(a.sort_order) - num(b.sort_order));
  return {
    id: num(r.id),
    poNo: str(r.po_no),
    date: str(r.po_date),
    supplier: str(r.supplier),
    email: str(r.email),
    fax: str(r.fax),
    section: str(r.section),
    remarks: str(r.remarks),
    status: str(r.status, 'Ordered'),
    total: num(r.total),
    supplierId: r.supplier_id != null ? num(r.supplier_id) : undefined,
    items: sortedItems.map(dbToOrderItem),
    deliveryOrderNo: str(r.delivery_order_no),
    deliveryOrderDate: str(r.delivery_order_date),
    deliveryOrderFileName: str(r.delivery_order_file_name),
    deliveryOrderFileData: str(r.delivery_order_file_data),
    receivedQuantity: num(r.received_quantity),
    verifiedBy: str(r.verified_by),
    verifiedDate: str(r.verified_date),
    approvedBy: str(r.approved_by),
    approvedDate: str(r.approved_date),
    goodsDeliveredBy: str(r.goods_delivered_by),
    goodsDeliveredDate: str(r.goods_delivered_date),
    doFiles: sortedDo.length > 0 ? sortedDo.map(dbToFileEntry) : undefined,
    invoiceFiles: sortedInv.length > 0 ? sortedInv.map(dbToFileEntry) : undefined,
  };
}

function dbToRfqSupplier(r: Row, files: Row[]): RFQSupplier {
  const sorted = [...files].sort((a, b) => num(a.sort_order) - num(b.sort_order));
  return {
    supplierId: r.supplier_id != null ? num(r.supplier_id) : undefined,
    name: str(r.name),
    email: str(r.email),
    fax: str(r.fax),
    quotFiles: sorted.length > 0 ? sorted.map(dbToFileEntry) : undefined,
  };
}

function dbToRfqItem(r: Row): RFQItem {
  return {
    itemId: r.item_id != null ? num(r.item_id) : undefined,
    description: str(r.description),
    quantity: str(r.quantity),
    unit: str(r.unit),
    unitPrice: str(r.unit_price),
    amount: str(r.amount),
    remarks: str(r.remarks),
    fileName: str(r.file_name),
    fileData: str(r.file_data),
    srcIrf: r.src_irf ? str(r.src_irf) : undefined,
    srcItemIdx: r.src_item_idx != null ? num(r.src_item_idx) : undefined,
  };
}

function dbToCcrData(ccrRow: Row, ccrItems: Row[], allPrices: Row[]): CcrData {
  const pricesByItem = groupBy(allPrices, 'ccr_item_id');
  const sortedItems  = [...ccrItems].sort((a, b) => num(a.sort_order) - num(b.sort_order));

  const items: CcrItem[] = sortedItems.map((ci) => {
    const prices     = pricesByItem.get(num(ci.id)) ?? [];
    const legacyRows = prices.filter((p) => p.option_idx == null);
    const optionRows = prices.filter((p) => p.option_idx != null);

    const maxSupIdx = Math.max(-1, ...prices.map((p) => num(p.supplier_idx)));

    // supplierPrices – one entry per supplier, ordered by supplier_idx
    const supplierPrices: CcrSupplierPrice[] = [];
    for (let si = 0; si <= maxSupIdx; si++) {
      const p = legacyRows.find((p) => num(p.supplier_idx) === si);
      supplierPrices.push({ price: p ? str(p.price) : '', remark: p ? str(p.remark) : '' });
    }

    // supplierOptions – only if any option rows exist
    let supplierOptions: CcrSupplierPrice[][] | undefined;
    if (optionRows.length > 0) {
      const maxOptIdx = Math.max(...optionRows.map((p) => num(p.option_idx)));
      supplierOptions = [];
      for (let si = 0; si <= maxSupIdx; si++) {
        const opts: CcrSupplierPrice[] = [];
        for (let oi = 0; oi <= maxOptIdx; oi++) {
          const p = optionRows.find((p) => num(p.supplier_idx) === si && num(p.option_idx) === oi);
          opts.push({ price: p ? str(p.price) : '', remark: p ? str(p.remark) : '' });
        }
        supplierOptions.push(opts);
      }
    }

    return {
      supplierPrices,
      supplierOptions,
      remarks: str(ci.remarks),
      lastPrice: str(ci.last_price),
      lastPriceDate: str(ci.last_price_date),
      selectedSupplier: ci.selected_supplier != null ? num(ci.selected_supplier) : null,
      selectedOption: ci.selected_option != null ? num(ci.selected_option) : null,
      poRef: ci.po_ref ? str(ci.po_ref) : undefined,
    };
  });

  return { savedAt: str(ccrRow.saved_at), items };
}

function dbToRfq(
  r: Row,
  rfqSupplierRows: Row[],
  rfqSupplierFilesMap: Map<number, Row[]>,
  rfqItemRows: Row[],
  ccrRow: Row | undefined,
  ccrItemRows: Row[],
  ccrPriceRows: Row[],
): RFQ {
  const suppliers = [...rfqSupplierRows]
    .sort((a, b) => num(a.sort_order) - num(b.sort_order))
    .map((s) => dbToRfqSupplier(s, rfqSupplierFilesMap.get(num(s.id)) ?? []));

  const items = [...rfqItemRows]
    .sort((a, b) => num(a.sort_order) - num(b.sort_order))
    .map(dbToRfqItem);

  const ccr = ccrRow ? dbToCcrData(ccrRow, ccrItemRows, ccrPriceRows) : null;

  return {
    id: num(r.id),
    rfqNo: str(r.rfq_no),
    date: str(r.rfq_date),
    type: str(r.rfq_type),
    supplier: str(r.supplier),
    remarks: str(r.remarks),
    total: num(r.total),
    suppliers,
    items,
    ccr,
    irfRef: r.irf_ref ? str(r.irf_ref) : undefined,
  };
}

function dbToRequestItem(r: Row): RequestItem {
  return {
    itemId: r.item_id != null ? num(r.item_id) : undefined,
    description: str(r.description),
    quantity: str(r.quantity),
    unit: str(r.unit),
    purpose: str(r.purpose),
    remarks: str(r.remarks),
    location: str(r.location),
    fileName: str(r.file_name),
    fileData: str(r.file_data),
  };
}

function dbToItemRequest(r: Row, items: Row[]): ItemRequest {
  return {
    id: num(r.id),
    refNo: str(r.ref_no),
    requestTo: str(r.request_to, 'Purchasing Manager'),
    date: str(r.request_date),
    type: str(r.request_type),
    requestedBy: str(r.requested_by),
    remarks: str(r.remarks),
    approvalStatus: str(r.approval_status, 'Pending'),
    approvedBy: str(r.approved_by),
    approvedDate: str(r.approved_date),
    items: [...items].sort((a, b) => num(a.sort_order) - num(b.sort_order)).map(dbToRequestItem),
  };
}

function dbToMovement(r: Row): Movement {
  return {
    id: num(r.id),
    itemId: num(r.item_id),
    date: str(r.movement_date),
    type: str(r.movement_type),
    stockType: r.stock_type ? str(r.stock_type) : undefined,
    reference: str(r.reference),
    quantity: num(r.quantity),
    note: str(r.note),
    receiveNo: r.receive_no ? str(r.receive_no) : undefined,
    pairedMovementId: r.paired_movement_id != null ? num(r.paired_movement_id) : undefined,
    uploadedToTx: r.uploaded_to_tx != null ? bool(r.uploaded_to_tx) : undefined,
    status: r.status ? str(r.status) : undefined,
    approvedBy: r.approved_by ? str(r.approved_by) : undefined,
    createdBy: r.created_by ? str(r.created_by) : undefined,
  };
}

function dbToIssueOutItem(r: Row): IssueOutItem {
  return {
    itemId: num(r.item_id),
    description: str(r.description),
    quantity: str(r.quantity),
    unit: str(r.unit),
    station: str(r.station),
    equipment: r.equipment ? str(r.equipment) : undefined,
    purpose: str(r.purpose),
    workerName: r.worker_name ? str(r.worker_name) : undefined,
  };
}

function dbToIssueOut(r: Row, items: Row[], preEditItems: Row[]): IssueOut {
  return {
    id: num(r.id),
    issueNo: str(r.issue_no),
    issuedTo: str(r.issued_to),
    remarks: str(r.remarks),
    createdBy: str(r.created_by),
    status: str(r.status, 'Pending'),
    verifiedBy: str(r.verified_by),
    approvedBy: str(r.approved_by),
    uploadedToTx: r.uploaded_to_tx != null ? bool(r.uploaded_to_tx) : undefined,
    isDirectIssue: r.is_direct_issue != null ? bool(r.is_direct_issue) : undefined,
    items: [...items].sort((a, b) => num(a.sort_order) - num(b.sort_order)).map(dbToIssueOutItem),
    preEditItems: preEditItems.length > 0
      ? [...preEditItems].sort((a, b) => num(a.sort_order) - num(b.sort_order)).map(dbToIssueOutItem)
      : undefined,
  };
}

function dbToReceiveInItem(r: Row): ReceiveInItem {
  return {
    itemId: num(r.item_id),
    quantity: num(r.quantity),
    unit: str(r.unit),
    supplierId: r.supplier_id != null ? num(r.supplier_id) : undefined,
    supplier: r.supplier ? str(r.supplier) : undefined,
    unitPrice: r.unit_price != null ? num(r.unit_price) : undefined,
    sstPercent: r.sst_percent != null ? num(r.sst_percent) : undefined,
    poItemIdx: r.po_item_idx != null ? num(r.po_item_idx) : undefined,
  };
}

function dbToReceiveIn(r: Row, items: Row[]): ReceiveInRecord {
  return {
    id: num(r.id),
    receiveNo: str(r.receive_no),
    date: str(r.receive_date),
    stockType: str(r.stock_type, 'Stock In'),
    issuedTo: r.issued_to ? str(r.issued_to) : undefined,
    reference: str(r.reference),
    note: str(r.note),
    items: [...items].sort((a, b) => num(a.sort_order) - num(b.sort_order)).map(dbToReceiveInItem),
    poId: r.po_id != null ? num(r.po_id) : undefined,
    poNo: r.po_no ? str(r.po_no) : undefined,
    supplierId: r.supplier_id != null ? num(r.supplier_id) : undefined,
    supplier: r.supplier ? str(r.supplier) : undefined,
    status: r.status ? str(r.status) : undefined,
    approvedBy: r.approved_by ? str(r.approved_by) : undefined,
    createdBy: r.created_by ? str(r.created_by) : undefined,
    linkedIssueNo: r.linked_issue_no ? str(r.linked_issue_no) : undefined,
  };
}

function dbToFixedAsset(r: Row): FixedAsset {
  return {
    id: num(r.id),
    assetNo: str(r.asset_no),
    name: str(r.name),
    category: str(r.category),
    location: str(r.location),
    station: r.station ? str(r.station) : undefined,
    equipment: r.equipment ? str(r.equipment) : undefined,
    itemId: r.item_id != null ? num(r.item_id) : undefined,
    purchaseDate: str(r.purchase_date),
    purchaseValue: num(r.purchase_value),
    currentValue: num(r.current_value),
    status: str(r.status),
    remarks: str(r.remarks),
  };
}

function dbToDieselEquipment(r: Row): DieselEquipment {
  return {
    id: num(r.id),
    fixedAssetId: r.fixed_asset_id != null ? num(r.fixed_asset_id) : undefined,
    assetNo: str(r.asset_no),
    name: str(r.name),
    category: str(r.category),
    station: str(r.station),
    equipment: str(r.equipment),
    type: str(r.equipment_type),
    status: str(r.status),
    remarks: str(r.remarks),
  };
}

function dbToMaintenanceJob(r: Row): MaintenanceJob {
  return {
    id: num(r.id),
    jobNo: str(r.job_no),
    date: str(r.job_date),
    equipment: str(r.equipment),
    technician: str(r.technician),
    itemId: num(r.item_id),
    quantityUsed: num(r.quantity_used),
    remarks: str(r.remarks),
  };
}

function dbToAuditLog(r: Row): AuditLog {
  return {
    id: num(r.id),
    timestamp: str(r.timestamp),
    username: str(r.username),
    userId: num(r.user_id),
    module: str(r.module),
    action: str(r.action),
    recordType: r.record_type ? str(r.record_type) : undefined,
    recordRef: r.record_ref ? str(r.record_ref) : undefined,
    recordId: r.record_id != null ? num(r.record_id) : undefined,
    details: r.details ? str(r.details) : undefined,
  };
}

function dbToProductionRecord(r: Row): ProductionRecord {
  const values = r.values && typeof r.values === 'object' ? r.values as Record<string, unknown> : {};
  const base = str(r.production_date);
  const rawPhotos = Array.isArray(r.efb_photos) ? r.efb_photos : [];
  return {
    id: num(r.id),
    date: r.adj ? `${base}-adj` : base,
    values: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, str(value)])),
    efbPhotos: rawPhotos.map((p: unknown) => ({
      name: str((p as Record<string, unknown>).name),
      data: str((p as Record<string, unknown>).data),
    })),
  };
}

function dbToWorker(r: Row): Worker {
  return {
    id: num(r.id),
    workerId: str(r.worker_id),
    staffId: r.staff_id ? str(r.staff_id) : undefined,
    name: str(r.name),
    shift: str(r.shift),
    role: str(r.role, 'Operator'),
    department: str(r.department),
    email: str(r.email),
    authUserId: r.auth_user_id ? str(r.auth_user_id) : undefined,
    status: str(r.status, 'Active'),
  };
}

function dbToWorkerAttendance(r: Row): WorkerAttendance {
  return {
    id: num(r.id),
    workerId: num(r.worker_id),
    date: str(r.date),
    slotHour: num(r.slot_hour),
    photoName: str(r.photo_name),
    photoData: str(r.photo_data),
    capturedAt: str(r.captured_at),
    task: r.task ? str(r.task) : undefined,
  };
}

function dbToCagesTippedPhoto(r: Row): CagesTippedPhoto {
  return {
    id: num(r.id),
    shift: str(r.shift),
    date: str(r.date),
    slotHour: num(r.slot_hour),
    photoName: str(r.photo_name),
    photoData: str(r.photo_data),
    capturedAt: str(r.captured_at),
  };
}

function dbToUserSetting(r: Row, perms: Row[]): UserSetting {
  return {
    id: num(r.id),
    username: str(r.username),
    password: '',
    email: str(r.email),
    authUserId: r.auth_user_id ? str(r.auth_user_id) : undefined,
    isAdmin: bool(r.is_admin),
    canAccessProcurement: false,
    canAccessInventory: false,
    canAccessMaintenance: false,
    canAccessProcess: false,
    canAccessHumanResources: true,
    permissions: perms.map((p) => str(p.permission)),
    approvalLimit: null,
    approvalItemLimits: [],
    verifyLimit: null,
    verifyItemLimits: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TypeScript → DB mappers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sanitise a date value for PostgreSQL `date` columns.
 * - Falsy / empty string → null (column is nullable)
 * - Valid YYYY-MM-DD prefix → keep just the date part
 * - Anything else (e.g. "Invalid Date", "N/A") → null to avoid parse errors
 */
const d = (v: string | undefined | null): string | null => {
  if (!v) return null;
  return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
};

/** Coerce a value to a safe number for numeric DB columns (null/NaN/undefined → 0). */
const n = (v: unknown, fallback = 0): number => {
  if (v == null) return fallback;
  const num = Number(v);
  return isNaN(num) ? fallback : num;
};

/**
 * Coerce a value to a safe integer for bigint DB columns.
 * Truncates floats (e.g. 1779700107287.7893 → 1779700107287) so PostgreSQL's
 * bigint type never sees a decimal point. null/NaN/undefined → 0.
 */
const int = (v: unknown, fallback = 0): number => Math.trunc(n(v, fallback));

function supplierToDb(s: Supplier): Row {
  return {
    id: int(s.id), supplier_id: s.supplierId ?? '', name: s.name ?? '', type: 'Parts',
    category: s.category ?? '', contact: s.contact ?? '', region: s.region ?? '',
    address: s.address ?? '', phone: s.phone ?? '', fax: s.fax ?? '',
    email: s.email ?? '', balance: n(s.balance),
  };
}

function inventoryItemToDb(item: InventoryItem): Row {
  return {
    id: int(item.id), stock_id: item.stockId ?? '', item: item.item ?? '',
    part_no: item.partNo ?? '', category: item.category ?? '', quantity: n(item.quantity),
    unit: item.unit ?? '', reorder_level: n(item.reorder), location: item.location ?? '',
  };
}

function categoryToDb(c: Category): Row {
  return { id: int(c.id), code: c.code, name: c.name, description: c.description };
}

function locationToDb(l: Location): Row {
  return { id: int(l.id), code: l.code, name: l.name, description: l.description };
}

function orderParentToDb(o: Order): Row {
  return {
    id: int(o.id), po_no: o.poNo ?? '', po_date: d(o.date),
    supplier: o.supplier ?? '', email: o.email ?? '', fax: o.fax ?? '',
    section: o.section ?? '', remarks: o.remarks ?? '', status: o.status ?? 'Ordered', total: n(o.total),
    supplier_id: o.supplierId != null ? int(o.supplierId) : null,
    delivery_order_no: o.deliveryOrderNo ?? '', delivery_order_date: d(o.deliveryOrderDate),
    delivery_order_file_name: o.deliveryOrderFileName ?? '', delivery_order_file_data: o.deliveryOrderFileData ?? '',
    received_quantity: n(o.receivedQuantity), verified_by: o.verifiedBy ?? '',
    verified_date: d(o.verifiedDate), approved_by: o.approvedBy ?? '', approved_date: d(o.approvedDate),
    goods_delivered_by: o.goodsDeliveredBy ?? '', goods_delivered_date: d(o.goodsDeliveredDate),
  };
}

function orderItemToDb(item: OrderItem, poId: number, idx: number): Row {
  return {
    po_id: poId, sort_order: idx,
    item_id: item.itemId != null ? int(item.itemId) : null, req_no: item.reqNo ?? '', description: item.description ?? '',
    quantity: n(item.quantity), unit: item.unit ?? '', unit_price: n(item.unitPrice),
    sst_percent: n(item.sstPercent), purpose: item.purpose ?? '', quotations: item.quotations ?? '',
    remarks: item.remarks ?? '', file_name: item.fileName ?? '', file_data: item.fileData ?? '',
  };
}

function rfqParentToDb(r: RFQ): Row {
  return {
    id: int(r.id), rfq_no: r.rfqNo ?? '', rfq_date: d(r.date),
    rfq_type: r.type ?? '', supplier: r.supplier ?? '',
    remarks: r.remarks ?? '', total: n(r.total), irf_ref: r.irfRef ?? '',
  };
}

function itemRequestParentToDb(r: ItemRequest): Row {
  return {
    id: int(r.id), ref_no: r.refNo ?? '', request_to: r.requestTo ?? 'Purchasing Manager',
    request_date: d(r.date), request_type: r.type ?? '',
    requested_by: r.requestedBy ?? '', remarks: r.remarks ?? '',
    approval_status: r.approvalStatus ?? 'Pending', approved_by: r.approvedBy ?? '',
    approved_date: d(r.approvedDate),
  };
}

function movementToDb(m: Movement): Row {
  return {
    id: int(m.id), item_id: int(m.itemId), movement_date: d(m.date),
    movement_type: m.type ?? 'Adjust', stock_type: m.stockType ?? '',
    reference: m.reference ?? '', quantity: n(m.quantity), note: m.note ?? '',
    receive_no: m.receiveNo ?? '', paired_movement_id: m.pairedMovementId ?? null,
    uploaded_to_tx: m.uploadedToTx ?? false, status: m.status ?? '',
    approved_by: m.approvedBy ?? '', created_by: m.createdBy ?? '',
  };
}

function stockLayerToDb(layer: StockLayer): Row {
  return {
    id: int(layer.id),
    item_id: int(layer.itemId),
    received_date: d(layer.receivedDate),
    source_type: layer.sourceType ?? '',
    source_ref: layer.sourceRef ?? '',
    source_id: layer.sourceId != null ? int(layer.sourceId) : null,
    source_line_idx: layer.sourceLineIdx != null ? int(layer.sourceLineIdx) : null,
    supplier_id: layer.supplierId != null ? int(layer.supplierId) : null,
    supplier: layer.supplier ?? '',
    quantity_received: n(layer.quantityReceived),
    quantity_remaining: n(layer.quantityRemaining),
    unit: layer.unit ?? '',
    unit_price: n(layer.unitPrice),
    sst_percent: n(layer.sstPercent),
  };
}

function stockLayerConsumptionToDb(c: StockLayerConsumption): Row {
  return {
    id: int(c.id),
    layer_id: int(c.layerId),
    item_id: int(c.itemId),
    issue_date: d(c.issueDate),
    source_type: c.sourceType ?? '',
    source_ref: c.sourceRef ?? '',
    source_id: c.sourceId != null ? int(c.sourceId) : null,
    source_line_idx: c.sourceLineIdx != null ? int(c.sourceLineIdx) : null,
    quantity: n(c.quantity),
    unit_cost: n(c.unitCost),
  };
}

function issueOutParentToDb(io: IssueOut): Row {
  return {
    id: int(io.id), issue_no: io.issueNo ?? '', issued_to: io.issuedTo ?? '',
    remarks: io.remarks ?? '', created_by: io.createdBy ?? '',
    status: io.status ?? 'Pending', verified_by: io.verifiedBy ?? '', approved_by: io.approvedBy ?? '',
    uploaded_to_tx: io.uploadedToTx ?? false, is_direct_issue: io.isDirectIssue ?? false,
  };
}

function issueOutItemToDb(item: IssueOutItem, ioId: number, idx: number, isPreEdit: boolean): Row {
  return {
    issue_out_id: ioId, sort_order: idx, is_pre_edit: isPreEdit,
    item_id: int(item.itemId), description: item.description ?? '',
    quantity: String(item.quantity ?? 0), unit: item.unit ?? '',
    station: item.station ?? '', equipment: item.equipment ?? '',
    purpose: item.purpose ?? '', worker_name: item.workerName ?? '',
  };
}

function receiveInParentToDb(r: ReceiveInRecord): Row {
  return {
    id: int(r.id), receive_no: r.receiveNo ?? '', receive_date: d(r.date),
    stock_type: r.stockType ?? 'Stock In', issued_to: r.issuedTo ?? '',
    reference: r.reference ?? '', note: r.note ?? '',
    po_id: r.poId != null ? int(r.poId) : null, po_no: r.poNo ?? '',
    supplier_id: r.supplierId != null ? int(r.supplierId) : null, supplier: r.supplier ?? '',
    status: r.status ?? '', approved_by: r.approvedBy ?? '',
    created_by: r.createdBy ?? '', linked_issue_no: r.linkedIssueNo ?? '',
  };
}

function fixedAssetToDb(a: FixedAsset): Row {
  return {
    id: int(a.id), asset_no: a.assetNo ?? '', name: a.name ?? '', category: a.category ?? '',
    location: a.location ?? '', station: a.station ?? '', equipment: a.equipment ?? '',
    item_id: a.itemId != null ? int(a.itemId) : null, purchase_date: d(a.purchaseDate),
    purchase_value: n(a.purchaseValue), current_value: n(a.currentValue),
    status: a.status ?? '', remarks: a.remarks ?? '',
  };
}

function dieselEquipmentToDb(item: DieselEquipment): Row {
  return {
    id: int(item.id),
    fixed_asset_id: item.fixedAssetId != null ? int(item.fixedAssetId) : null,
    asset_no: item.assetNo ?? '',
    name: item.name ?? '',
    category: item.category ?? '',
    station: item.station ?? '',
    equipment: item.equipment ?? '',
    equipment_type: item.type ?? '',
    status: item.status ?? '',
    remarks: item.remarks ?? '',
  };
}

function auditLogToDb(a: AuditLog): Row {
  return {
    id: int(a.id), timestamp: a.timestamp ?? '', username: a.username ?? '',
    user_id: int(a.userId), module: a.module ?? '', action: a.action ?? '',
    record_type: a.recordType ?? '', record_ref: a.recordRef ?? '',
    record_id: a.recordId != null ? int(a.recordId) : null, details: a.details ?? '',
  };
}

function productionRecordToDb(record: ProductionRecord): Row {
  const isAdj = record.date.endsWith('-adj');
  return {
    id: int(record.id),
    production_date: d(isAdj ? record.date.slice(0, -4) : record.date),
    adj: isAdj,
    values: record.values ?? {},
    efb_photos: (record.efbPhotos ?? []).map((p) => ({ name: p.name, data: p.data })),
  };
}

async function syncProduction(records: ProductionRecord[]): Promise<void> {
  const processed = await Promise.all(records.map(async (record) => {
    const efbPhotos = await Promise.all((record.efbPhotos ?? []).map(async (p, i) => ({
      ...p,
      data: await toDbData(p.data ?? '', `efb-photos/${record.id}/${i}${fileExt(p.name ?? '')}`),
    })));
    return { ...record, efbPhotos };
  }));
  await syncParent('production_records', processed.map(productionRecordToDb), processed.map((r) => r.id));
}

async function syncWorkers(workers: Worker[]): Promise<void> {
  await syncParent('workers', workers.map(workerToDb), workers.map((w) => w.id));
}

async function syncWorkerAttendance(attendance: WorkerAttendance[]): Promise<void> {
  const processed = await Promise.all(attendance.map(async (a) => ({
    ...a,
    photoData: await toDbData(
      a.photoData ?? '',
      `worker-attendance/${a.workerId}/${a.date}/${a.slotHour}${fileExt(a.photoName ?? '')}`,
    ),
  })));
  await syncParent('worker_attendance', processed.map(workerAttendanceToDb), processed.map((a) => a.id));
}

async function syncCagesTippedPhotos(photos: CagesTippedPhoto[]): Promise<void> {
  const processed = await Promise.all(photos.map(async (p) => ({
    ...p,
    photoData: await toDbData(p.photoData ?? '', `cages-tipped/${p.shift}/${p.date}/${p.id}${fileExt(p.photoName ?? '')}`),
  })));
  await syncParent('cages_tipped_photos', processed.map(cagesTippedPhotoToDb), processed.map((p) => p.id));
}

function maintenanceJobToDb(m: MaintenanceJob): Row {
  // Multi-item maintenance jobs are local-only until a child table is added — fall back
  // to items[0] so at least the primary part survives the Supabase round-trip.
  const firstItem = m.items?.[0];
  return {
    id: int(m.id), job_no: m.jobNo ?? '', job_date: d(m.date),
    equipment: m.equipment ?? '', technician: m.technician ?? '',
    item_id: int(m.itemId ?? firstItem?.itemId ?? 0),
    quantity_used: n(m.quantityUsed ?? firstItem?.quantityUsed ?? 0),
    remarks: m.remarks ?? '',
  };
}

function workerToDb(w: Worker): Row {
  return {
    id: int(w.id),
    worker_id: w.workerId ?? '',
    staff_id: w.staffId ?? '',
    name: w.name ?? '',
    shift: w.shift ?? 'A',
    role: w.role ?? 'Operator',
    department: w.department ?? '',
    email: w.email ?? '',
    auth_user_id: w.authUserId ?? null,
    status: w.status ?? 'Active',
  };
}

function workerAttendanceToDb(a: WorkerAttendance): Row {
  return {
    id: int(a.id),
    worker_id: int(a.workerId),
    date: d(a.date),
    slot_hour: a.slotHour ?? 0,
    photo_name: a.photoName ?? '',
    photo_data: a.photoData ?? '',
    captured_at: a.capturedAt ?? '',
    task: a.task ?? null,
  };
}

function cagesTippedPhotoToDb(p: CagesTippedPhoto): Row {
  return {
    id: int(p.id),
    shift: p.shift ?? '',
    date: d(p.date),
    slot_hour: p.slotHour ?? 0,
    photo_name: p.photoName ?? '',
    photo_data: p.photoData ?? '',
    captured_at: p.capturedAt ?? '',
  };
}

function userSettingParentToDb(u: UserSetting): Row {
  return {
    id: int(u.id), username: u.username ?? '',
    email: u.email ?? '', auth_user_id: u.authUserId ?? null,
    is_admin: u.isAdmin ?? false,
    can_access_human_resources: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync helpers for push
// ─────────────────────────────────────────────────────────────────────────────

const db = () => supabase!; // caller guards supabaseConfigured

/** Upsert rows then delete any rows whose id is not in the current state. */
async function syncParent(table: string, rows: Row[], ids: number[]): Promise<void> {
  if (rows.length > 0) {
    const { error } = await db().from(table).upsert(rows);
    check(error, `upsert:${table}`);
  }
  // Delete orphans — truncate to integer so bigint columns never see a decimal point
  if (ids.length > 0) {
    const safeIds = ids.map((id) => Math.trunc(id));
    const { error } = await db().from(table).delete().not('id', 'in', `(${safeIds.join(',')})`);
    check(error, `delete-orphans:${table}`);
  } else {
    // Nothing left — wipe the table
    const { error } = await db().from(table).delete().gte('id', 0);
    check(error, `delete-all:${table}`);
  }
}

/** Delete all child rows for the given parent ids, then bulk-insert new ones. */
async function replaceChildren(
  table: string,
  parentCol: string,
  parentIds: number[],
  rows: Row[],
): Promise<void> {
  if (parentIds.length > 0) {
    const { error } = await db().from(table).delete().in(parentCol, parentIds);
    check(error, `delete-children:${table}`);
  }
  if (rows.length > 0) {
    const { error } = await db().from(table).insert(rows);
    check(error, `insert-children:${table}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-entity sync functions
// ─────────────────────────────────────────────────────────────────────────────

async function syncStations(stations: Station[]): Promise<void> {
  const ids = stations.map((s) => s.id);
  await syncParent('stations', stations.map((s) => ({
    id: int(s.id), code: s.code ?? '', name: s.name ?? '',
    location_id: s.locationId ? int(s.locationId) : null, description: s.description ?? '',
  })), ids);

  // Replace equipment for all current stations
  if (ids.length > 0) {
    const { error } = await db().from('station_equipment').delete().in('station_id', ids);
    check(error, 'delete-children:station_equipment');
  }
  const eqRows: Row[] = stations.flatMap((s) =>
    (s.equipment ?? []).map((eq, i) => ({
      equipment_id: int(eq.id), station_id: int(s.id),
      code: eq.code, name: eq.name, description: eq.description, sort_order: i,
    })),
  );
  if (eqRows.length > 0) {
    const { error } = await db().from('station_equipment').insert(eqRows);
    check(error, 'insert-children:station_equipment');
  }
}

async function syncOrders(orders: Order[]): Promise<void> {
  // ── Upload file attachments to Storage; replace in-memory data with "storage:{path}" refs ──
  const processedOrders = await Promise.all(orders.map(async (o) => {
    const deliveryOrderFileData = await toDbData(
      o.deliveryOrderFileData ?? '',
      `po-do-legacy/${o.id}${fileExt(o.deliveryOrderFileName ?? '')}`,
    );
    const items = await Promise.all(o.items.map(async (item, i) => ({
      ...item,
      fileData: await toDbData(item.fileData ?? '', `po-items/${o.id}/${i}${fileExt(item.fileName ?? '')}`),
    })));
    const doFiles = await Promise.all((o.doFiles ?? []).map(async (f, i) => ({
      ...f,
      data: await toDbData(f.data ?? '', `po-do/${o.id}/${i}${fileExt(f.name ?? '')}`),
    })));
    const invoiceFiles = await Promise.all((o.invoiceFiles ?? []).map(async (f, i) => ({
      ...f,
      data: await toDbData(f.data ?? '', `po-inv/${o.id}/${i}${fileExt(f.name ?? '')}`),
    })));
    return { ...o, deliveryOrderFileData, items, doFiles, invoiceFiles };
  }));

  const ids = processedOrders.map((o) => o.id);
  await syncParent('purchase_orders', processedOrders.map(orderParentToDb), ids);

  // Children — all three child tables are independent, run in parallel
  const itemRows = processedOrders.flatMap((o) => o.items.map((item, i) => orderItemToDb(item, o.id, i)));
  const doRows   = processedOrders.flatMap((o) => (o.doFiles ?? []).map((f, i) => ({ po_id: o.id, sort_order: i, name: f.name ?? '', data: f.data ?? '', ref_no: f.refNo ?? '' })));
  const invRows  = processedOrders.flatMap((o) => (o.invoiceFiles ?? []).map((f, i) => ({ po_id: o.id, sort_order: i, name: f.name ?? '', data: f.data ?? '', ref_no: f.refNo ?? '' })));

  await Promise.all([
    replaceChildren('purchase_order_items', 'po_id', ids, itemRows),
    replaceChildren('po_do_files',          'po_id', ids, doRows),
    replaceChildren('po_invoice_files',     'po_id', ids, invRows),
  ]);
}

async function syncRfqs(rfqs: RFQ[]): Promise<void> {
  const ids = rfqs.map((r) => r.id);
  await syncParent('request_quotations', rfqs.map(rfqParentToDb), ids);

  // Process RFQs one at a time — firing all in parallel causes lock contention and
  // statement timeouts on rfq_supplier_quot_files (large base64 payloads + high concurrency).
  // Within each RFQ the three independent chains (suppliers, items, CCR) still run concurrently.
  for (const rfq of rfqs) {
    await Promise.all([
      // ── Suppliers chain ──────────────────────────────────────────────────────
      (async () => {
        const { error: delSupErr } = await db().from('rfq_suppliers').delete().eq('rfq_id', rfq.id);
        check(delSupErr, 'delete-children:rfq_suppliers');

        if (rfq.suppliers.length > 0) {
          const supInsert = rfq.suppliers.map((s, i) => ({
            rfq_id: int(rfq.id),
            sort_order: i,
            supplier_id: s.supplierId != null ? int(s.supplierId) : null,
            name: s.name ?? '',
            email: s.email ?? '',
            fax: s.fax ?? '',
          }));
          const { error: supErr } = await db().from('rfq_suppliers').insert(supInsert);
          check(supErr, 'insert:rfq_suppliers');

          // Explicitly SELECT the just-inserted rows to get their authoritative IDs.
          const { data: savedSups, error: selErr } = await db()
            .from('rfq_suppliers').select('id, sort_order').eq('rfq_id', int(rfq.id)).order('sort_order');
          check(selErr, 'select:rfq_suppliers');

          if (savedSups && (savedSups as Row[]).length > 0) {
            const supIdByIdx = new Map((savedSups as Row[]).map((s) => [num(s.sort_order), num(s.id)]));
            // Upload each quot file to Storage first, then insert a tiny path ref — no large
            // base64 payload in the DB statement, so statement_timeout is never hit.
            for (const [si, s] of rfq.suppliers.entries()) {
              const supId = supIdByIdx.get(si);
              if (!supId || !s.quotFiles?.length) continue;
              for (const [fi, f] of s.quotFiles.entries()) {
                const data = await toDbData(
                  f.data ?? '',
                  `rfq-quot/${rfq.id}/${si}/${fi}${fileExt(f.name ?? '')}`,
                );
                const { error } = await db().from('rfq_supplier_quot_files').insert({
                  rfq_supplier_id: supId, sort_order: fi,
                  name: f.name ?? '', data, ref_no: f.refNo ?? '',
                });
                check(error, 'insert:rfq_supplier_quot_files');
              }
            }
          }
        }
      })(),
      // ── Items chain ──────────────────────────────────────────────────────────
      (async () => {
        const { error: delItemErr } = await db().from('rfq_items').delete().eq('rfq_id', rfq.id);
        check(delItemErr, 'delete-children:rfq_items');
        if (rfq.items.length > 0) {
          const itemRows = await Promise.all(rfq.items.map(async (item, i) => ({
            rfq_id: int(rfq.id), sort_order: i,
            item_id: item.itemId != null ? int(item.itemId) : null,
            description: item.description ?? '', quantity: item.quantity ?? '', unit: item.unit ?? '',
            unit_price: item.unitPrice ?? '', amount: item.amount ?? '', remarks: item.remarks ?? '',
            file_name: item.fileName ?? '',
            file_data: await toDbData(item.fileData ?? '', `rfq-items/${rfq.id}/${i}${fileExt(item.fileName ?? '')}`),
            src_irf: item.srcIrf ?? '', src_item_idx: item.srcItemIdx ?? null,
          })));
          const { error } = await db().from('rfq_items').insert(itemRows);
          check(error, 'insert:rfq_items');
        }
      })(),
      // ── CCR chain ────────────────────────────────────────────────────────────
      (async () => {
        const { error: delCcrErr } = await db().from('rfq_ccr').delete().eq('rfq_id', rfq.id);
        check(delCcrErr, 'delete:rfq_ccr');

        if (rfq.ccr) {
          const { data: ccrRows, error: ccrErr } = await db()
            .from('rfq_ccr').insert({ rfq_id: int(rfq.id), saved_at: rfq.ccr.savedAt ?? '' }).select('id');
          check(ccrErr, 'insert:rfq_ccr');

          const ccrId = (ccrRows as Row[])?.[0]?.id as number | undefined;
          if (ccrId && rfq.ccr.items.length > 0) {
            const ccrItemInsert = rfq.ccr.items.map((ci, i) => ({
              ccr_id: int(ccrId), sort_order: i,
              remarks: ci.remarks ?? '', last_price: ci.lastPrice ?? '', last_price_date: ci.lastPriceDate ?? '',
              selected_supplier: ci.selectedSupplier, selected_option: ci.selectedOption ?? null,
              po_ref: ci.poRef ?? '',
            }));
            const { data: insertedCcrItems, error: ccrItemErr } = await db()
              .from('rfq_ccr_items').insert(ccrItemInsert).select('id, sort_order');
            check(ccrItemErr, 'insert:rfq_ccr_items');

            if (insertedCcrItems && (insertedCcrItems as Row[]).length > 0) {
              const ccrItemIdByIdx = new Map((insertedCcrItems as Row[]).map((ci) => [num(ci.sort_order), num(ci.id)]));

              const priceRows = rfq.ccr.items.flatMap((ci, iIdx) => {
                const ccrItemId = ccrItemIdByIdx.get(iIdx);
                if (!ccrItemId) return [];
                const legacyRows = ci.supplierPrices.map((p, si) => ({
                  ccr_item_id: int(ccrItemId), supplier_idx: si, option_idx: null,
                  price: p.price ?? '', remark: p.remark ?? '',
                }));
                const optionRows = (ci.supplierOptions ?? []).flatMap((opts, si) =>
                  opts.map((opt, oi) => ({
                    ccr_item_id: int(ccrItemId), supplier_idx: si, option_idx: oi,
                    price: opt.price ?? '', remark: opt.remark ?? '',
                  })),
                );
                return [...legacyRows, ...optionRows];
              });

              if (priceRows.length > 0) {
                const { error } = await db().from('rfq_ccr_item_prices').insert(priceRows);
                check(error, 'insert:rfq_ccr_item_prices');
              }
            }
          }
        }
      })(),
    ]);
  }
}

async function syncItemRequests(requests: ItemRequest[]): Promise<void> {
  const ids = requests.map((r) => r.id);
  await syncParent('item_requests', requests.map(itemRequestParentToDb), ids);

  const itemRows = await Promise.all(requests.flatMap((r) =>
    r.items.map(async (item, i) => ({
      request_id: int(r.id), sort_order: i,
      item_id: item.itemId != null ? int(item.itemId) : null,
      description: item.description ?? '', quantity: item.quantity ?? '', unit: item.unit ?? '',
      purpose: item.purpose ?? '', remarks: item.remarks ?? '', location: item.location ?? '',
      file_name: item.fileName ?? '',
      file_data: await toDbData(item.fileData ?? '', `irf-items/${r.id}/${i}${fileExt(item.fileName ?? '')}`),
    })),
  ));
  await replaceChildren('item_request_items', 'request_id', ids, itemRows);
}

async function syncIssueOuts(issueOuts: IssueOut[]): Promise<void> {
  const ids = issueOuts.map((io) => io.id);
  await syncParent('issue_outs', issueOuts.map(issueOutParentToDb), ids);

  const itemRows = issueOuts.flatMap((io) => [
    ...io.items.map((item, i) => issueOutItemToDb(item, int(io.id), i, false)),
    ...(io.preEditItems ?? []).map((item, i) => issueOutItemToDb(item, int(io.id), i, true)),
  ]);
  await replaceChildren('issue_out_items', 'issue_out_id', ids, itemRows);
}

async function syncReceiveIns(receiveIns: ReceiveInRecord[]): Promise<void> {
  const ids = receiveIns.map((r) => r.id);
  await syncParent('receive_ins', receiveIns.map(receiveInParentToDb), ids);

  const itemRows = receiveIns.flatMap((r) =>
    r.items.map((item, i) => ({
      receive_in_id: int(r.id),
      sort_order: i,
      item_id: int(item.itemId),
      quantity: n(item.quantity),
      unit: item.unit ?? '',
      supplier_id: item.supplierId != null ? int(item.supplierId) : null,
      supplier: item.supplier ?? '',
      unit_price: n(item.unitPrice),
      sst_percent: n(item.sstPercent),
      po_item_idx: item.poItemIdx != null ? int(item.poItemIdx) : null,
    })),
  );
  await replaceChildren('receive_in_items', 'receive_in_id', ids, itemRows);
}

async function syncUserSettings(userSettings: UserSetting[]): Promise<void> {
  const ids = userSettings.map((u) => u.id);
  await syncParent('hr_user_settings', userSettings.map(userSettingParentToDb), ids);
  const permRows = userSettings.flatMap((u) => u.permissions.map((p) => ({ user_id: int(u.id), permission: p ?? '' })));
  await replaceChildren('hr_user_permissions', 'user_id', ids, permRows);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API (same signatures as before — AppContext.tsx unchanged)
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch all tables and reassemble AppState. Returns null on a fresh DB. */
export async function fetchRemoteState(): Promise<{ state: AppState; updatedAt: string } | null> {
  if (!supabase) return null;

  // Check if the DB has been initialised (app_sync_log row exists)
  const { data: logRow, error: logErr } = await supabase
    .from('app_sync_log').select('updated_at').eq('id', 1).maybeSingle();
  check(logErr, 'fetch:app_sync_log');
  if (!logRow) return null; // fresh DB → caller will push local state

  // Fetch every table in parallel
  const [
    { data: suppliers },
    { data: inventory },
    { data: categories },
    { data: locations },
    { data: stations },
    { data: stationEquipment },
    { data: orders },
    { data: poItems },
    { data: poDoFiles },
    { data: poInvFiles },
    { data: rfqs },
    { data: rfqSupplierRows },
    { data: rfqSupplierFiles },
    { data: rfqItemRows },
    { data: rfqCcrRows },
    { data: rfqCcrItemRows },
    { data: rfqCcrPriceRows },
    { data: requests },
    { data: requestItems },
    { data: movements },
    { data: stockLayers },
    { data: stockLayerConsumptions },
    { data: issueOuts },
    { data: issueOutItems },
    { data: receiveIns },
    { data: receiveInItems },
    { data: fixedAssets },
    { data: dieselEquipmentRows },
    { data: maintenanceJobs },
    { data: auditLogRows },
    { data: productionRows },
    { data: userSettings },
    { data: userPermissions },
    { data: cagesTippedPhotoRows },
    { data: workerRows },
    { data: workerAttendanceRows },
  ] = await Promise.all([
    supabase.from('suppliers').select('*').order('id'),
    supabase.from('inventory_items').select('*').order('id'),
    supabase.from('categories').select('*').order('id'),
    supabase.from('locations').select('*').order('id'),
    supabase.from('stations').select('*').order('id'),
    supabase.from('station_equipment').select('*').order('station_id').order('sort_order'),
    supabase.from('purchase_orders').select('*').order('id'),
    supabase.from('purchase_order_items').select('*').order('po_id').order('sort_order'),
    supabase.from('po_do_files').select('*').order('po_id').order('sort_order'),
    supabase.from('po_invoice_files').select('*').order('po_id').order('sort_order'),
    supabase.from('request_quotations').select('*').order('id'),
    supabase.from('rfq_suppliers').select('*').order('rfq_id').order('sort_order'),
    supabase.from('rfq_supplier_quot_files').select('*').order('rfq_supplier_id').order('sort_order'),
    supabase.from('rfq_items').select('*').order('rfq_id').order('sort_order'),
    supabase.from('rfq_ccr').select('*'),
    supabase.from('rfq_ccr_items').select('*').order('ccr_id').order('sort_order'),
    supabase.from('rfq_ccr_item_prices').select('*').order('ccr_item_id').order('supplier_idx'),
    supabase.from('item_requests').select('*').order('id'),
    supabase.from('item_request_items').select('*').order('request_id').order('sort_order'),
    supabase.from('stock_movements').select('*').order('id'),
    supabase.from('stock_layers').select('*').order('received_date').order('id'),
    supabase.from('stock_layer_consumptions').select('*').order('id'),
    supabase.from('issue_outs').select('*').order('id'),
    supabase.from('issue_out_items').select('*').order('issue_out_id').order('is_pre_edit').order('sort_order'),
    supabase.from('receive_ins').select('*').order('id'),
    supabase.from('receive_in_items').select('*').order('receive_in_id').order('sort_order'),
    supabase.from('fixed_assets').select('*').order('id'),
    supabase.from('diesel_equipment').select('*').order('id'),
    supabase.from('maintenance_jobs').select('*').order('id'),
    supabase.from('audit_logs').select('*').order('id', { ascending: false }),
    supabase.from('production_records').select('*').order('production_date'),
    supabase.from('hr_user_settings').select('*').order('id'),
    supabase.from('hr_user_permissions').select('*').order('user_id'),
    supabase.from('cages_tipped_photos').select('*').order('captured_at'),
    supabase.from('workers').select('*').order('id'),
    supabase.from('worker_attendance').select('*').order('date').order('slot_hour'),
  ]);

  // Build lookup maps for O(1) child resolution
  const eqByStation     = groupBy(stationEquipment ?? [], 'station_id');
  const poItemsByOrder  = groupBy(poItems ?? [], 'po_id');
  const doByOrder       = groupBy(poDoFiles ?? [], 'po_id');
  const invByOrder      = groupBy(poInvFiles ?? [], 'po_id');
  const rfqSupsByRfq    = groupBy(rfqSupplierRows ?? [], 'rfq_id');
  const rfqSupFilesMap  = groupBy(rfqSupplierFiles ?? [], 'rfq_supplier_id');
  const rfqItemsByRfq   = groupBy(rfqItemRows ?? [], 'rfq_id');
  const ccrByRfqId      = new Map((rfqCcrRows ?? []).map((c: Row) => [num(c.rfq_id), c as Row]));
  const ccrItemsByCcr   = groupBy(rfqCcrItemRows ?? [], 'ccr_id');
  const ccrPricesByCi   = groupBy(rfqCcrPriceRows ?? [], 'ccr_item_id');
  const riItemsByReq    = groupBy(requestItems ?? [], 'request_id');
  const ioItemsByIo     = groupBy(issueOutItems ?? [], 'issue_out_id');
  const riItemsByRi     = groupBy(receiveInItems ?? [], 'receive_in_id');
  const permsByUser     = groupBy(userPermissions ?? [], 'user_id');

  const state: AppState = {
    suppliers:    (suppliers ?? []).map(dbToSupplier),
    inventory:    (inventory ?? []).map(dbToInventoryItem),
    categories:   (categories ?? []).map(dbToCategory),
    locations:    (locations ?? []).map(dbToLocation),
    stations:     (stations ?? []).map((s: Row) => dbToStation(s, eqByStation.get(num(s.id)) ?? [])),
    orders:       (orders ?? []).map((o: Row) => dbToOrder(o, poItemsByOrder.get(num(o.id)) ?? [], doByOrder.get(num(o.id)) ?? [], invByOrder.get(num(o.id)) ?? [])),
    rfqs: (rfqs ?? []).map((r: Row) => {
      const rfqId    = num(r.id);
      const ccrRow   = ccrByRfqId.get(rfqId);
      const ccrItems = ccrRow ? ccrItemsByCcr.get(num(ccrRow.id)) ?? [] : [];
      const ccrPrices = ccrItems.flatMap((ci: Row) => ccrPricesByCi.get(num(ci.id)) ?? []);
      return dbToRfq(r, rfqSupsByRfq.get(rfqId) ?? [], rfqSupFilesMap, rfqItemsByRfq.get(rfqId) ?? [], ccrRow, ccrItems, ccrPrices);
    }),
    requests:     (requests ?? []).map((r: Row) => dbToItemRequest(r, riItemsByReq.get(num(r.id)) ?? [])),
    movements:    (movements ?? []).map(dbToMovement),
    stockLayers:  (stockLayers ?? []).map(dbToStockLayer),
    stockLayerConsumptions: (stockLayerConsumptions ?? []).map(dbToStockLayerConsumption),
    issueOuts:    (issueOuts ?? []).map((io: Row) => {
      const all = ioItemsByIo.get(num(io.id)) ?? [];
      return dbToIssueOut(io, all.filter((i: Row) => !i.is_pre_edit), all.filter((i: Row) => i.is_pre_edit));
    }),
    receiveIns:   (receiveIns ?? []).map((r: Row) => dbToReceiveIn(r, riItemsByRi.get(num(r.id)) ?? [])),
    fixedAssets:  (fixedAssets ?? []).map(dbToFixedAsset),
    dieselEquipment: (dieselEquipmentRows ?? []).map(dbToDieselEquipment),
    maintenance:  (maintenanceJobs ?? []).map(dbToMaintenanceJob),
    userSettings: (userSettings ?? []).map((u: Row) =>
      dbToUserSetting(u, permsByUser.get(num(u.id)) ?? []),
    ),
    auditLogs:   (auditLogRows ?? []).map(dbToAuditLog),
    production:  (productionRows ?? []).map(dbToProductionRecord),
    cagesTippedPhotos: (cagesTippedPhotoRows ?? []).map(dbToCagesTippedPhoto),
    workers:           (workerRows ?? []).map(dbToWorker),
    workerAttendance:  (workerAttendanceRows ?? []).map(dbToWorkerAttendance),
    // Not yet synced to Supabase — stored in localStorage only until DB tables are added
    mechanics:   [],
    pmSchedules: [],
    pieceRateSettings: {
      cagesTipped: {
        lte4: { stationHead: 0, assistantStationHead: 0, operator: 0 },
        gte5: { stationHead: 0, assistantStationHead: 0, operator: 0 },
      },
      clarificationStation: { stationHead: 0, assistantStationHead: 0, operator: 0 },
      kernelStation:         { stationHead: 0, assistantStationHead: 0, operator: 0 },
      boilerStation:         { stationHead: 0, assistantStationHead: 0, operator: 0 },
      waterTreatmentStation: { stationHead: 0, assistantStationHead: 0, operator: 0 },
    },
  };

  // Replace "storage:{path}" refs with short-lived signed URLs so the UI can
  // display and download attachments directly without embedding base64 in state.
  await resolveStorageRefs(state);

  return { state, updatedAt: str((logRow as Row).updated_at) };
}

/** Push full AppState into the relational tables. Returns the server timestamp. */
export async function pushRemoteState(state: AppState): Promise<string> {
  if (!supabase) return '';

  // Sync all entity types in parallel — no enforced FK constraints between top-level tables
  // (cross-module id refs like item_id, supplier_id are nullable columns without FK constraints).
  // Each sync function handles its own parent→child ordering internally.
  await Promise.all([
    syncParent('categories',      state.categories.map(categoryToDb),      state.categories.map((c) => c.id)),
    syncParent('locations',       state.locations.map(locationToDb),       state.locations.map((l) => l.id)),
    syncStations(state.stations),
    syncParent('suppliers',       state.suppliers.map(supplierToDb),       state.suppliers.map((s) => s.id)),
    syncParent('inventory_items', state.inventory.map(inventoryItemToDb),  state.inventory.map((i) => i.id)),
    syncOrders(state.orders),
    syncRfqs(state.rfqs),
    syncItemRequests(state.requests),
    syncParent('stock_movements', state.movements.map(movementToDb),      state.movements.map((m) => m.id)),
    syncParent('stock_layers', (state.stockLayers ?? []).map(stockLayerToDb), (state.stockLayers ?? []).map((l) => l.id)),
    syncParent('stock_layer_consumptions', (state.stockLayerConsumptions ?? []).map(stockLayerConsumptionToDb), (state.stockLayerConsumptions ?? []).map((c) => c.id)),
    syncIssueOuts(state.issueOuts),
    syncReceiveIns(state.receiveIns),
    syncParent('fixed_assets',    state.fixedAssets.map(fixedAssetToDb),  state.fixedAssets.map((a) => a.id)),
    syncParent('diesel_equipment', (state.dieselEquipment ?? []).map(dieselEquipmentToDb), (state.dieselEquipment ?? []).map((d) => d.id)),
    syncParent('maintenance_jobs', state.maintenance.map(maintenanceJobToDb), state.maintenance.map((m) => m.id)),
    syncParent('audit_logs',      (state.auditLogs ?? []).map(auditLogToDb), (state.auditLogs ?? []).map((a) => a.id)),
    syncProduction(state.production ?? []),
    syncCagesTippedPhotos(state.cagesTippedPhotos ?? []),
    syncWorkers(state.workers ?? []),
    syncWorkerAttendance(state.workerAttendance ?? []),
    syncUserSettings(state.userSettings),
  ]);

  // Update the sync sentinel (triggers realtime on other clients)
  const updated_at = new Date().toISOString();
  const { error } = await supabase.from('app_sync_log').upsert({ id: 1, updated_at });
  check(error, 'upsert:app_sync_log');
  return updated_at;
}

/**
 * Subscribe to row-level changes on app_sync_log.
 * When another client saves, we do a full refetch and call onUpdate.
 * The caller suppresses their own echo via the updatedAt timestamp.
 */
export function subscribeToChanges(
  onUpdate: (state: AppState, updatedAt: string) => void,
): RealtimeChannel | null {
  if (!supabase) return null;
  return supabase
    .channel('app_sync_log_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_sync_log', filter: 'id=eq.1' },
      async (payload) => {
        const row = payload.new as { updated_at: string } | undefined;
        if (!row?.updated_at) return;
        try {
          const result = await fetchRemoteState();
          if (result) onUpdate(result.state, row.updated_at);
        } catch (err) {
          console.error('[supabase] Realtime refetch error:', err);
        }
      },
    )
    .subscribe();
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase Auth helpers
// ─────────────────────────────────────────────────────────────────────────────

export type AdminUserAction = 'create' | 'setPassword' | 'updateEmail' | 'delete';

interface AdminUserPayload {
  uid?: string;
  email?: string;
  password?: string;
}

/**
 * Invoke the `admin-users` Edge Function for privileged account management
 * (create / set password / update email / delete). The function enforces that
 * the caller is a signed-in admin and runs with the service-role key server-side.
 * Returns `{ uid }` for `create`. Throws on any error so callers can `try/catch`.
 */
export async function adminUsers(
  action: AdminUserAction,
  payload: AdminUserPayload = {},
): Promise<{ uid?: string }> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action, ...payload },
  });
  if (error) {
    // On a non-2xx response supabase-js puts the function's body in error.context
    // (a Response), not in `data`. Dig out our { error } message so the UI can show
    // the real reason (e.g. "A user with this email address has already been registered").
    let msg = error.message ?? 'admin-users request failed';
    const resp = (error as { context?: Response }).context;
    if (resp && typeof resp.json === 'function') {
      try {
        const body = await resp.json();
        if (body?.error) msg = body.error;
      } catch { /* keep generic message */ }
    }
    throw new Error(msg);
  }
  if (data && (data as { error?: string }).error) {
    throw new Error((data as { error: string }).error);
  }
  return (data ?? {}) as { uid?: string };
}

/** Send a password-reset email. `redirectTo` should point at the app's /reset-password route. */
export async function requestPasswordReset(email: string, redirectTo: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw new Error(error.message);
}

/**
 * "Forgot username" — ask the `send-username` Edge Function to email the username(s)
 * linked to this address. The function responds neutrally regardless of whether the
 * email exists, so this never reveals account existence.
 */
export async function sendUsernameReminder(email: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.functions.invoke('send-username', { body: { email } });
  if (error) throw new Error(error.message);
}
