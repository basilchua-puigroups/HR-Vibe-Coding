import type { AppState } from '../types';

const STORAGE_KEY = 'millPartsSystemV1';

export const seedData: AppState = {
  suppliers: [
    { id: 1, name: 'Maju Industrial Supply', contact: '03-7788 9012', region: 'Selangor', balance: 0 },
    { id: 2, name: 'PalmTech Engineering', contact: '07-555 2844', region: 'Johor', balance: 0 },
    { id: 3, name: 'Boiler & Mill Services', contact: '05-777 6610', region: 'Perak', balance: 0 },
  ],
  inventory: [
    { id: 1, stockId: 'STK-0001', item: 'Sterilizer Door Gasket', partNo: 'ST-GSK-220', category: 'Sterilizer', quantity: 8, unit: 'pcs', reorder: 4, location: 'Rack A1' },
    { id: 2, stockId: 'STK-0002', item: 'Press Cage Bearing', partNo: 'BRG-6318', category: 'Press', quantity: 6, unit: 'pcs', reorder: 3, location: 'Rack B2' },
    { id: 3, stockId: 'STK-0003', item: 'Conveyor Chain Link', partNo: 'CHN-CV-60', category: 'Conveyor', quantity: 42, unit: 'pcs', reorder: 20, location: 'Rack C4' },
    { id: 4, stockId: 'STK-0004', item: 'Boiler Chemical Pump Seal', partNo: 'PMP-SEAL-12', category: 'Boiler', quantity: 3, unit: 'set', reorder: 2, location: 'Rack D1' },
  ],
  orders: [
    { id: 1, poNo: 'PO-1001', date: '2026-05-06', supplier: 'Maju Industrial Supply', email: '', fax: '', section: '', remarks: 'Spare for sterilizer shutdown', status: 'Ordered', total: 900, items: [{ reqNo: '', description: 'Sterilizer Door Gasket', quantity: 5, unit: 'pcs', unitPrice: 180, sstPercent: 0, purpose: '', quotations: '', remarks: '', fileName: '', fileData: '' }], deliveryOrderNo: '', deliveryOrderDate: '', deliveryOrderFileName: '', deliveryOrderFileData: '', receivedQuantity: 0, verifiedBy: '', verifiedDate: '', approvedBy: '', approvedDate: '' },
    { id: 2, poNo: 'PO-1002', date: '2026-05-10', supplier: 'PalmTech Engineering', email: '', fax: '', section: '', remarks: 'Urgent press repair', status: 'Received', total: 1900, items: [{ reqNo: '', description: 'Press Cage Bearing', quantity: 2, unit: 'pcs', unitPrice: 950, sstPercent: 0, purpose: '', quotations: '', remarks: '', fileName: '', fileData: '' }], deliveryOrderNo: 'DO-8821', deliveryOrderDate: '2026-05-12', deliveryOrderFileName: '', deliveryOrderFileData: '', receivedQuantity: 2, verifiedBy: 'Ahmad', verifiedDate: '2026-05-10', approvedBy: 'Manager', approvedDate: '2026-05-11' },
  ],
  rfqs: [
    { id: 745, rfqNo: '000745', date: '2026-05-15', type: 'Parts', supplier: 'Apex Uniparts Sdn Bhd', suppliers: [{ name: 'Apex Uniparts Sdn Bhd', email: '', fax: '' }], remarks: '', total: 0, items: [] },
    { id: 744, rfqNo: '000744', date: '2026-05-14', type: 'Parts', supplier: 'Apex Uniparts Sdn Bhd', suppliers: [{ name: 'Apex Uniparts Sdn Bhd', email: '', fax: '' }], remarks: '', total: 0, items: [] },
  ],
  requests: [
    { id: 2707, refNo: '002707', requestTo: 'Purchasing Manager', date: '2026-05-15', type: 'Repeat Order', requestedBy: 'Martin Rambuh', remarks: 'Repeat order', approvalStatus: 'Pending', approvedBy: '', approvedDate: '', items: [{ description: 'Repeat order', quantity: '', unit: '', purpose: '', remarks: '', location: '', fileName: '', fileData: '' }] },
    { id: 2706, refNo: '002706', requestTo: 'Purchasing Manager', date: '2026-05-15', type: 'Normal', requestedBy: 'lim hui chang', remarks: 'spray mosquito', approvalStatus: 'Approved', approvedBy: 'Lim Hui Chang', approvedDate: '2026-05-15', items: [{ description: 'spray mosquito', quantity: '', unit: '', purpose: '', remarks: '', location: '', fileName: '', fileData: '' }] },
    { id: 2705, refNo: '002705', requestTo: 'Purchasing Manager', date: '2026-05-15', type: 'Normal', requestedBy: 'Devlin Luang', remarks: 'SCADA ROOM', approvalStatus: 'Pending', approvedBy: '', approvedDate: '', items: [{ description: 'SCADA ROOM', quantity: '', unit: '', purpose: '', remarks: '', location: '', fileName: '', fileData: '' }] },
  ],
  maintenance: [],
  movements: [],
  stockLayers: [],
  stockLayerConsumptions: [],
  categories: [],
  locations: [
    { id: 1, code: 'LOC-000001', name: 'Main Warehouse', description: 'Primary parts storage' },
    { id: 2, code: 'LOC-000002', name: 'Workshop Store', description: 'Workshop parts cabinet' },
  ],
  stations: [
    { id: 1, code: 'M001', name: 'Sterilizer Bay', locationId: 1, description: 'Sterilizer maintenance area', equipment: [] },
    { id: 2, code: 'M002', name: 'Press Room', locationId: 1, description: 'Press machine maintenance', equipment: [] },
  ],
  issueOuts: [],
  fixedAssets: [],
  dieselEquipment: [],
  receiveIns: [],
  mechanics: [],
  pmSchedules: [],
  auditLogs: [],
  production: [],
  cagesTippedPhotos: [],
  workers: [],
  workerAttendance: [],
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
  userSettings: [
    { id: 1, username: 'admin', email: 'admin@millparts.local', password: 'admin123', isAdmin: true, permissions: [] },
  ],
};

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppState>;
      if (parsed.requests) {
        parsed.requests = parsed.requests.map((r) => ({
          ...r,
          approvalStatus: r.approvalStatus ?? (r.approvedBy ? 'Approved' : 'Pending'),
        }));
      }
      if (parsed.inventory) {
        parsed.inventory = parsed.inventory.map((item) => ({
          ...item,
          stockId: item.stockId || `STK-${String(item.id).padStart(4, '0')}`,
        }));
      }
      // Legacy maintenance jobs (pre-PO-restructure) auto-deducted stock on save.
      // Mark them Approved so the new flow doesn't double-deduct on Approve.
      if (parsed.maintenance) {
        parsed.maintenance = parsed.maintenance.map((m) => ({
          ...m,
          status: m.status ?? (m.itemId ? 'Approved' : 'Pending'),
        }));
      }
      if (parsed.categories && parsed.categories.some((c) => /^CAT-/i.test(c.code || ''))) {
        parsed.categories = [];
      }
      return { ...structuredClone(seedData), ...parsed };
    }
  } catch {}
  return structuredClone(seedData);
}

/**
 * Strip all binary file content from the state before writing to localStorage.
 * File names are preserved so the UI still shows what is attached; the actual
 * base64 data lives in Supabase and is restored on the next remote fetch.
 * This keeps the localStorage payload well under the 5 MB browser limit.
 */
function stripFileData(state: AppState): AppState {
  return {
    ...state,
    orders: state.orders.map((o) => ({
      ...o,
      deliveryOrderFileData: '',
      doFiles:      (o.doFiles      ?? []).map((f) => ({ ...f, data: '' })),
      invoiceFiles: (o.invoiceFiles ?? []).map((f) => ({ ...f, data: '' })),
      items: o.items.map((item) => ({ ...item, fileData: '' })),
    })),
    rfqs: state.rfqs.map((r) => ({
      ...r,
      items: r.items.map((item) => ({ ...item, fileData: '' })),
      suppliers: r.suppliers.map((s) => ({
        ...s,
        quotFiles: (s.quotFiles ?? []).map((f) => ({ ...f, data: '' })),
      })),
    })),
    requests: state.requests.map((r) => ({
      ...r,
      items: r.items.map((item) => ({ ...item, fileData: '' })),
    })),
    maintenance: state.maintenance.map((m) => ({
      ...m,
      photos: (m.photos ?? []).map((p) => ({ ...p, data: '' })),
    })),
    production: (state.production ?? []).map((r) => ({
      ...r,
      efbPhotos: (r.efbPhotos ?? []).map((p) => ({ ...p, data: '' })),
    })),
    cagesTippedPhotos: (state.cagesTippedPhotos ?? []).map((p) => ({ ...p, photoData: '' })),
    workerAttendance: (state.workerAttendance ?? []).map((p) => ({ ...p, photoData: '' })),
  };
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stripFileData(state)));
  } catch (e) {
    // Still failed after stripping — state itself is unexpectedly large.
    console.warn('localStorage save failed (storage full even after stripping file data):', e);
  }
}
