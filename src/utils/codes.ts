import type { AppState, Equipment } from '../types';

/**
 * Return the next sequential integer ID for a collection.
 * Takes the current max (truncating any legacy float IDs) and adds 1.
 * Returns 1 for an empty collection.
 */
export function nextId(items: { id: number }[]): number {
  if (items.length === 0) return 1;
  return Math.max(0, ...items.map((i) => Math.trunc(i.id || 0))) + 1;
}

function maxNum(codes: string[]): number {
  const nums = codes.map((c) => Number(String(c || '').replace(/\D/g, ''))).filter((n) => n > 0);
  return nums.length ? Math.max(...nums) : 0;
}

export function nextCategoryCode(state: AppState): string {
  return 'C' + String(maxNum(state.categories.map((c) => c.code)) + 1).padStart(3, '0');
}

/**
 * Generate the next Stock ID for an inventory item, prefixed by its category code.
 * Format: `{categoryCode}-{NNNN}` (e.g. "C001-0001"). The running number is
 * scoped to the category, so each category gets its own 0001… sequence.
 */
export function nextStockId(state: AppState, categoryCode: string): string {
  const prefix = categoryCode + '-';
  const nums = state.inventory
    .map((i) => {
      const sid = i.stockId ?? '';
      return sid.startsWith(prefix) ? Number(sid.slice(prefix.length).replace(/\D/g, '')) : 0;
    })
    .filter((n) => n > 0);
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return prefix + String(next).padStart(4, '0');
}

export function nextLocationCode(state: AppState): string {
  return 'LOC-' + String(maxNum(state.locations.map((l) => l.code)) + 1).padStart(6, '0');
}

export function nextStationCode(state: AppState): string {
  return 'M' + String(maxNum(state.stations.map((s) => s.code)) + 1).padStart(3, '0');
}

export function nextEquipmentCode(stationCode: string, equipment: Equipment[]): string {
  const prefix = stationCode + ' - ';
  const nums = equipment
    .map((e) => (e.code.startsWith(prefix) ? Number(e.code.slice(prefix.length).replace(/\D/g, '')) : 0))
    .filter((n) => n > 0);
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return String(next).padStart(4, '0');
}

export function nextPoNo(state: AppState): string {
  return 'PO-' + String(maxNum(state.orders.map((o) => o.poNo)) + 1).padStart(4, '0');
}

export function nextRfqNo(state: AppState): string {
  return String(maxNum(state.rfqs.map((r) => r.rfqNo)) + 1).padStart(6, '0');
}

export function nextRefNo(state: AppState): string {
  return String(maxNum(state.requests.map((r) => r.refNo)) + 1).padStart(6, '0');
}

export function nextReceiveNo(state: AppState): string {
  const fromMovements = state.movements
    .map((m) => Number(String(m.receiveNo || '').replace(/\D/g, '')))
    .filter((n) => n > 0);
  const fromReceiveIns = (state.receiveIns ?? [])
    .map((r) => Number(String(r.receiveNo || '').replace(/\D/g, '')))
    .filter((n) => n > 0);
  const max = Math.max(0, ...fromMovements, ...fromReceiveIns);
  return 'RI-' + String(max + 1).padStart(6, '0');
}

export function nextIssueNo(state: AppState): string {
  return 'IO-' + String(maxNum(state.issueOuts.map((io) => io.issueNo)) + 1).padStart(6, '0');
}

export function nextJobNo(state: AppState): string {
  return 'MJ-' + String(maxNum(state.maintenance.map((m) => m.jobNo)) + 1).padStart(4, '0');
}

export function nextAssetNo(state: AppState): string {
  return 'FA-' + String(maxNum(state.fixedAssets.map((a) => a.assetNo)) + 1).padStart(5, '0');
}

export function nextMechanicCode(state: AppState): string {
  return 'MEC-' + String(maxNum(state.mechanics.map((m) => m.code)) + 1).padStart(3, '0');
}

export function nextPMScheduleNo(state: AppState): string {
  return 'PMS-' + String(maxNum(state.pmSchedules.map((s) => s.scheduleNo)) + 1).padStart(4, '0');
}
