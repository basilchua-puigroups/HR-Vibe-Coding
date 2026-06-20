export interface Supplier {
  id: number;
  name: string;
  contact: string;
  region: string;
  balance: number;
  supplierId?: string;
  category?: string;
  address?: string;
  phone?: string;
  fax?: string;
  email?: string;
}

export interface InventoryItem {
  id: number;
  stockId?: string;
  item: string;
  partNo: string;
  category: string;
  quantity: number;
  unit: string;
  reorder: number;
  location: string;
}

export interface OrderItem {
  itemId?: number;
  reqNo: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  sstPercent: number;
  purpose: string;
  quotations: string;
  remarks: string;
  fileName: string;
  fileData: string;
}

export interface Order {
  id: number;
  poNo: string;
  date: string;
  supplier: string;
  email: string;
  fax: string;
  section: string;
  remarks: string;
  status: string;
  total: number;
  items: OrderItem[];
  supplierId?: number;
  itemId?: number;
  quantity?: number;
  unitCost?: number;
  deliveryOrderNo: string;
  deliveryOrderDate: string;
  deliveryOrderFileName: string;
  deliveryOrderFileData: string;
  receivedQuantity: number;
  verifiedBy: string;
  verifiedDate: string;
  approvedBy: string;
  approvedDate: string;
  goodsDeliveredBy?: string;
  goodsDeliveredDate?: string;
  invoiceFileName?: string;
  invoiceFileData?: string;
  doFiles?: Array<{ name: string; data: string; refNo?: string }>;
  invoiceFiles?: Array<{ name: string; data: string; refNo?: string }>;
}

export interface RFQSupplier {
  supplierId?: number;
  name: string;
  email: string;
  fax: string;
  quotFiles?: Array<{ name: string; data: string; refNo?: string }>;
}

export interface RFQItem {
  itemId?: number;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  amount: string;
  remarks: string;
  fileName: string;
  fileData: string;
  srcIrf?: string;
  srcItemIdx?: number;
}

export interface CcrSupplierPrice {
  price: string;
  remark: string;
}

export interface CcrItem {
  supplierPrices: CcrSupplierPrice[];              // legacy single-price per supplier
  supplierOptions?: CcrSupplierPrice[][];           // [supplierIdx][optionIdx] — multi-option
  remarks: string;
  lastPrice: string;
  lastPriceDate: string;
  selectedSupplier: number | null;
  selectedOption?: number | null;                  // which option within selectedSupplier
  poRef?: string;
}

export interface CcrData {
  savedAt: string;
  items: CcrItem[];
}

export interface RFQ {
  id: number;
  rfqNo: string;
  date: string;
  type: string;
  supplier: string;
  suppliers: RFQSupplier[];
  remarks: string;
  total: number;
  items: RFQItem[];
  ccr?: CcrData | null;
  irfRef?: string;
}

export interface RequestItem {
  itemId?: number;
  description: string;
  quantity: string;
  unit: string;
  purpose: string;
  remarks: string;
  location: string;
  fileName: string;
  fileData: string;
}

export interface ItemRequest {
  id: number;
  refNo: string;
  requestTo: string;
  date: string;
  type: string;
  requestedBy: string;
  remarks: string;
  approvalStatus: string;
  approvedBy: string;
  approvedDate: string;
  items: RequestItem[];
}

export interface MaintenanceJobItem {
  itemId: number;
  description: string;   // snapshot of the inventory item name at the time it was added
  quantityUsed: number;
  unit: string;
  remarks?: string;
}

export interface MaintenanceJob {
  id: number;
  jobNo: string;
  date: string;
  equipment: string;
  technician: string;
  // NEW multi-item field. `legacyToItems()` in Maintenance.tsx falls back to itemId/quantityUsed for old records.
  items?: MaintenanceJobItem[];
  remarks: string;
  // Image attachments — JPG/PNG only, 2 MB limit each. Stripped from localStorage by stripFileData().
  photos?: Array<{ name: string; data: string }>;
  status?: string;        // 'Pending' | 'Approved' — undefined for legacy records (treated as 'Approved' on load)
  createdBy?: string;
  createdAt?: string;
  approvedBy?: string;
  approvedDate?: string;
  // Legacy single-item fields — preserved for backward compat with old records and the Supabase schema.
  itemId?: number;
  quantityUsed?: number;
}

export interface Movement {
  id: number;
  itemId: number;
  date: string;
  type: string;
  stockType?: string;
  reference: string;
  quantity: number;
  note: string;
  receiveNo?: string;
  pairedMovementId?: number;
  uploadedToTx?: boolean;
  status?: string;       // 'Pending' | 'Approved' — undefined means legacy (already applied to stock)
  approvedBy?: string;
  createdBy?: string;
}

export interface StockLayer {
  id: number;
  itemId: number;
  receivedDate: string;
  sourceType: string;       // 'Receive In' | 'Opening Balance' | 'Transaction'
  sourceRef: string;
  sourceId?: number;
  sourceLineIdx?: number;
  supplierId?: number;
  supplier?: string;
  quantityReceived: number;
  quantityRemaining: number;
  unit: string;
  unitPrice: number;
  sstPercent: number;
}

export interface StockLayerConsumption {
  id: number;
  layerId: number;
  itemId: number;
  issueDate: string;
  sourceType: string;       // 'Issue Out' | 'Maintenance Log' | 'Transaction'
  sourceRef: string;
  sourceId?: number;
  sourceLineIdx?: number;
  quantity: number;
  unitCost: number;
}

export interface Category {
  id: number;
  code: string;
  name: string;
  description: string;
}

export interface Location {
  id: number;
  code: string;
  name: string;
  description: string;
}

export interface Equipment {
  id: number;
  code: string;
  name: string;
  description: string;
}

export interface Station {
  id: number;
  code: string;
  name: string;
  locationId: number;
  description: string;
  equipment: Equipment[];
}

export interface IssueOutItem {
  itemId: number;
  description: string;
  quantity: number | string;
  unit: string;
  station: string;
  equipment?: string;
  purpose: string;
  workerName?: string;
}

export interface IssueOut {
  id: number;
  issueNo: string;
  issuedTo: string;
  remarks: string;
  items: IssueOutItem[];
  createdBy: string;
  status: string;
  verifiedBy: string;
  verifiedDate?: string;
  approvedBy: string;
  approvedDate?: string;
  createdAt?: string;
  uploadedToTx?: boolean;
  isDirectIssue?: boolean;
  preEditItems?: IssueOutItem[]; // snapshot of items before re-edit of an Approved record
}

export interface FixedAsset {
  id: number;
  assetNo: string;
  name: string;
  category: string;
  location: string;   // legacy — new records use station
  station?: string;
  equipment?: string;
  itemId?: number;    // linked inventory item
  purchaseDate: string;
  purchaseValue: number;
  currentValue: number;
  status: string;
  remarks: string;
}

export interface DieselEquipment {
  id: number;
  fixedAssetId?: number;
  assetNo: string;
  name: string;
  category: string;
  station: string;
  equipment: string;
  type: string;
  status: string;
  remarks: string;
}

export interface ApprovalItemLimit {
  itemId: number;
  itemName: string;
  limit: number;
}

export interface UserSetting {
  id: number;
  username: string;
  /** Legacy plaintext password — no longer used for auth once migrated to Supabase Auth. */
  password: string;
  /** Login email mirrored to auth.users. Synthetic `username@millparts.local` when no real email. */
  email: string;
  /** auth.users.id once the account is linked to Supabase Auth. */
  authUserId?: string;
  isAdmin: boolean;
  canAccessProcurement?: boolean;
  canAccessInventory?: boolean;
  canAccessMaintenance?: boolean;
  canAccessProcess?: boolean;
  canAccessHumanResources?: boolean;
  permissions: string[];
  approvalLimit?: number | null;
  approvalItemLimits?: ApprovalItemLimit[];
  verifyLimit?: number | null;
  verifyItemLimits?: ApprovalItemLimit[];
}

export interface ReceiveInItem {
  itemId: number;
  quantity: number;
  unit: string;
  supplierId?: number;
  supplier?: string;
  unitPrice?: number;
  sstPercent?: number;
  poItemIdx?: number;
}

export interface ReceiveInRecord {
  id: number;
  receiveNo: string;
  date: string;
  stockType: string;           // 'Stock In' | 'Direct Issue'
  issuedTo?: string;           // Direct Issue only
  reference: string;
  note: string;
  items: ReceiveInItem[];
  poId?: number;
  poNo?: string;
  supplierId?: number;
  supplier?: string;
  status?: string;             // 'Pending' | 'Approved'
  approvedBy?: string;
  approvedDate?: string;
  createdBy?: string;
  linkedIssueNo?: string;      // Direct Issue: the paired IssueOut's issueNo
}

export interface Mechanic {
  id: number;
  code: string;
  name: string;
  specialization: string;
  phone: string;
  status: string;   // 'Active' | 'Inactive'
  remarks: string;
}

export interface PMSchedule {
  id: number;
  scheduleNo: string;
  equipment: string;
  station: string;
  frequency: string;  // 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Annual'
  lastServiceDate: string;
  nextServiceDate: string;
  assignedMechanic: string;
  status: string;     // 'Scheduled' | 'Due' | 'Overdue' | 'Completed'
  remarks: string;
}

export interface AuditLog {
  id: number;
  timestamp: string;     // ISO datetime when the action occurred
  username: string;      // Logged-in user who performed the action
  userId: number;        // FK to UserSetting.id (0 if unknown)
  module: string;        // 'IRF' | 'RFQ' | 'PO' | 'Item File' | 'Receive In' | 'Issue Out' | 'Maintenance Log' | etc.
  action: string;        // 'Create' | 'Edit' | 'Delete' | 'Approve' | 'Verify' | 'Reject' | 'CCR Save' | 'CCR Select Supplier' | 'CCR Create PO' | etc.
  recordType?: string;   // Sub-category — e.g. 'CCR' inside RFQ module
  recordRef?: string;    // External reference code (e.g. 'PO-1001', 'IRF-000123')
  recordId?: number;     // Internal record id
  details?: string;      // Human-readable summary of what changed
}

// One day's palm oil mill production figures. The report has ~120 columns
// (FFB, Press, CPO, PK, PKS, EFB, etc.), so values are keyed by column id
// (see productionColumns.ts) rather than fixed fields.
export interface ProductionRecord {
  id: number;
  date: string;                    // YYYY-MM-DD
  values: Record<string, string>;  // columnKey -> raw value
  efbPhotos?: Array<{ name: string; data: string }>; // EFB overflow photos; data is base64 or storage: ref
}

export interface Worker {
  id: number;
  workerId: string;     // login username (shown as "Username" in UI)
  staffId?: string;     // optional internal worker/staff ID (e.g. EMP-001)
  name: string;
  shift: string;        // 'A' | 'B'
  role: string;         // 'Station Head' | 'Assistant Station Head' | 'Operator'
  department: string;
  email: string;        // Supabase Auth email (auto: workerId@millparts.worker)
  authUserId?: string;  // set once Supabase Auth account is created
  status: string;       // 'Active' | 'Inactive' | 'Resigned'
}

export interface WorkerAttendance {
  id: number;
  workerId: number;     // FK to workers.id
  date: string;         // YYYY-MM-DD (shift date)
  slotHour: number;     // 0-23
  photoName: string;
  photoData: string;    // base64 or storage:{path}
  capturedAt: string;   // ISO from file.lastModified
  task?: string;        // 'cagesTipped' | 'clarificationStation' | 'kernelStation' | 'boilerStation' | 'waterTreatmentStation'
}

export interface CagesTippedPhoto {
  id: number;
  shift: string;       // 'A' | 'B'
  date: string;        // YYYY-MM-DD  (shift date — hours 0000-0659 belong to the previous calendar day)
  slotHour: number;    // 0-23 — starting hour of the 1-hour time slot the photo is filed under
  photoName: string;
  photoData: string;   // base64 or storage:{path}
  capturedAt: string;  // ISO datetime from file.lastModified
}

export interface PieceRateRoles {
  stationHead: number;
  assistantStationHead: number;
  operator: number;
}

export interface PieceRateCagesTipped {
  lte4: PieceRateRoles;  // <= 4 cages
  gte5: PieceRateRoles;  // >= 5 cages
}

export interface PieceRateSettings {
  cagesTipped: PieceRateCagesTipped;
  clarificationStation: PieceRateRoles;
  kernelStation: PieceRateRoles;
  boilerStation: PieceRateRoles;
  waterTreatmentStation: PieceRateRoles;
}

export interface AppState {
  suppliers: Supplier[];
  inventory: InventoryItem[];
  orders: Order[];
  rfqs: RFQ[];
  requests: ItemRequest[];
  maintenance: MaintenanceJob[];
  movements: Movement[];
  stockLayers: StockLayer[];
  stockLayerConsumptions: StockLayerConsumption[];
  categories: Category[];
  locations: Location[];
  stations: Station[];
  issueOuts: IssueOut[];
  fixedAssets: FixedAsset[];
  dieselEquipment: DieselEquipment[];
  userSettings: UserSetting[];
  receiveIns: ReceiveInRecord[];
  mechanics: Mechanic[];
  pmSchedules: PMSchedule[];
  auditLogs: AuditLog[];
  production: ProductionRecord[];
  cagesTippedPhotos: CagesTippedPhoto[];
  workers: Worker[];
  workerAttendance: WorkerAttendance[];
  pieceRateSettings: PieceRateSettings;
}
