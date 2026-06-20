import type { UserSetting } from '../types';

export interface ProcModulePerm {
  key: string;
  label: string;
}

export interface ProcModule {
  key: string;
  label: string;
  perms: ProcModulePerm[];
}

export const PROC_MODULES: ProcModule[] = [
  {
    key: 'irf', label: 'Item Request Form (IRF)',
    perms: [
      { key: 'viewIrf',    label: 'View IRF' },
      { key: 'createIrf',  label: 'Create IRF' },
      { key: 'editIrf',    label: 'Edit IRF' },
      { key: 'approveIrf', label: 'Approve IRF' },
      { key: 'rejectIrf',  label: 'Reject IRF' },
      { key: 'deleteIrf',  label: 'Delete IRF' },
      { key: 'printIrf',   label: 'Print IRF' },
    ],
  },
  {
    key: 'rfq', label: 'Request For Quotation (RFQ)',
    perms: [
      { key: 'viewRfq',            label: 'View RFQ' },
      { key: 'createRfq',          label: 'Create RFQ' },
      { key: 'editRfq',            label: 'Edit RFQ' },
      { key: 'deleteRfq',          label: 'Delete RFQ' },
      { key: 'printRfq',           label: 'Print RFQ' },
      { key: 'viewCcr',            label: 'View CCR' },
      { key: 'selectCcrSupplier',  label: 'CCR — Select Supplier' },
      { key: 'createPoFromCcr',    label: 'CCR — Create PO' },
    ],
  },
  {
    key: 'po', label: 'Purchase Order (PO)',
    perms: [
      { key: 'viewPo',                label: 'View PO' },
      { key: 'createPo',              label: 'Create PO' },
      { key: 'editPo',                label: 'Edit PO' },
      { key: 'verifyPo',              label: 'Verify PO' },
      { key: 'approvePo',             label: 'Approve PO' },
      { key: 'deletePo',              label: 'Delete PO' },
      { key: 'printPo',               label: 'Print PO' },
      { key: 'managePoVerifyLimits',  label: 'Manage PO Verify Limits' },
      { key: 'managePoApprovalLimits', label: 'Manage PO Approval Limits' },
    ],
  },
  {
    key: 'supplier', label: 'Supplier File',
    perms: [
      { key: 'viewSupplier',   label: 'View Supplier File' },
      { key: 'createSupplier', label: 'Add Supplier' },
      { key: 'editSupplier',   label: 'Edit Supplier' },
      { key: 'deleteSupplier', label: 'Delete Supplier' },
    ],
  },
  {
    key: 'procSettings', label: 'Settings',
    perms: [
      { key: 'manageProcurementUsers', label: 'User Settings' },
    ],
  },
];

export const INV_MODULES: ProcModule[] = [
  {
    key: 'item', label: 'Item File',
    perms: [
      { key: 'viewItem',   label: 'View Item File' },
      { key: 'createItem', label: 'Add Item' },
      { key: 'editItem',   label: 'Edit Item' },
      { key: 'deleteItem', label: 'Delete Item' },
    ],
  },
  {
    key: 'receive', label: 'Receive In',
    perms: [
      { key: 'viewReceive',    label: 'View Receive In' },
      { key: 'createReceive',  label: 'Create Receive In' },
      { key: 'editReceive',    label: 'Edit Receive In' },
      { key: 'deleteReceive',  label: 'Delete Receive In' },
      { key: 'approveReceive', label: 'Approve Receive In' },
    ],
  },
  {
    key: 'issueOut', label: 'Issue Out',
    perms: [
      { key: 'viewIssueOut',    label: 'View Issue Out' },
      { key: 'createIssueOut',  label: 'Create Issue Out' },
      { key: 'editIssueOut',    label: 'Edit Issue Out' },
      { key: 'deleteIssueOut',  label: 'Delete Issue Out' },
      { key: 'approveIssueOut', label: 'Approve Issue Out' },
    ],
  },
  {
    key: 'transaction', label: 'Transaction',
    perms: [
      { key: 'viewTransaction',   label: 'View Transaction' },
      { key: 'createTransaction', label: 'Create Transaction' },
      { key: 'deleteTransaction', label: 'Delete Transaction' },
    ],
  },
  {
    key: 'category', label: 'Category',
    perms: [
      { key: 'viewCategory',   label: 'View Category' },
      { key: 'createCategory', label: 'Add Category' },
      { key: 'editCategory',   label: 'Edit Category' },
      { key: 'deleteCategory', label: 'Delete Category' },
    ],
  },
  {
    key: 'station', label: 'Station',
    perms: [
      { key: 'viewStation',     label: 'View Station / Equipment' },
      { key: 'createStation',   label: 'Add Station' },
      { key: 'editStation',     label: 'Edit Station' },
      { key: 'deleteStation',   label: 'Delete Station' },
      { key: 'createEquipment', label: 'Add Equipment' },
      { key: 'editEquipment',   label: 'Edit Equipment' },
      { key: 'deleteEquipment', label: 'Delete Equipment' },
    ],
  },
  {
    key: 'location', label: 'Store Location',
    perms: [
      { key: 'viewLocation',   label: 'View Store Location' },
      { key: 'createLocation', label: 'Add Store Location' },
      { key: 'editLocation',   label: 'Edit Store Location' },
      { key: 'deleteLocation', label: 'Delete Store Location' },
    ],
  },
  {
    key: 'fixedAsset', label: 'Fixed Asset',
    perms: [
      { key: 'viewFixedAsset',   label: 'View Fixed Asset' },
      { key: 'createFixedAsset', label: 'Add Fixed Asset' },
      { key: 'editFixedAsset',   label: 'Edit Fixed Asset' },
      { key: 'deleteFixedAsset', label: 'Delete Fixed Asset' },
    ],
  },
  {
    key: 'diesel', label: 'Diesel',
    perms: [
      { key: 'viewDiesel',   label: 'View Diesel' },
    ],
  },
  {
    key: 'dieselConsumptionEntry', label: 'Diesel Consumption Entry',
    perms: [
      { key: 'viewDieselConsumptionEntry',   label: 'View Diesel Consumption Entry' },
      { key: 'createDieselConsumptionEntry', label: 'Create Diesel Consumption Entry' },
      { key: 'editDieselConsumptionEntry',   label: 'Edit Diesel Consumption Entry' },
      { key: 'deleteDieselConsumptionEntry', label: 'Delete Diesel Consumption Entry' },
    ],
  },
  {
    key: 'dieselVehicleList', label: 'Equipment List',
    perms: [
      { key: 'viewDieselVehicleList',   label: 'View Equipment List' },
      { key: 'createDieselVehicle',     label: 'Add Equipment' },
      { key: 'editDieselVehicle',       label: 'Edit Equipment' },
      { key: 'deleteDieselVehicle',     label: 'Delete Equipment' },
    ],
  },
  {
    key: 'dieselConsumptionRecord', label: 'Diesel Consumption Record',
    perms: [
      { key: 'viewDieselConsumptionRecord',   label: 'View Diesel Consumption Record' },
      { key: 'createDieselConsumptionRecord', label: 'Create Diesel Consumption Record' },
      { key: 'editDieselConsumptionRecord',   label: 'Edit Diesel Consumption Record' },
      { key: 'deleteDieselConsumptionRecord', label: 'Delete Diesel Consumption Record' },
    ],
  },
  {
    key: 'inventoryReports', label: 'Reports',
    perms: [
      { key: 'viewInventoryReports',      label: 'View Reports' },
      { key: 'viewStockListingReport',    label: 'View Stock Listing Report' },
      { key: 'viewIssueOutRecordReport',  label: 'View Issue Out Record Report' },
    ],
  },
  {
    key: 'invSettings', label: 'Settings',
    perms: [
      { key: 'manageInventoryUsers', label: 'User Settings' },
    ],
  },
];

export const MAINT_MODULES: ProcModule[] = [
  {
    key: 'maintLog', label: 'Maintenance Log',
    perms: [
      { key: 'viewMaintLog',    label: 'View Maintenance Log' },
      { key: 'createMaintLog',  label: 'Create Maintenance Record' },
      { key: 'editMaintLog',    label: 'Edit Maintenance Record' },
      { key: 'deleteMaintLog',  label: 'Delete Maintenance Record' },
      { key: 'approveMaintLog', label: 'Approve Maintenance Record' },
    ],
  },
  {
    key: 'mechanic', label: 'Mechanic List',
    perms: [
      { key: 'viewMechanic',   label: 'View Mechanic List' },
      { key: 'createMechanic', label: 'Add Mechanic' },
      { key: 'editMechanic',   label: 'Edit Mechanic' },
      { key: 'deleteMechanic', label: 'Delete Mechanic' },
    ],
  },
  {
    key: 'pmSchedule', label: 'PM Schedule',
    perms: [
      { key: 'viewPMSchedule',   label: 'View PM Schedule' },
      { key: 'createPMSchedule', label: 'Create PM Schedule' },
      { key: 'editPMSchedule',   label: 'Edit PM Schedule' },
      { key: 'deletePMSchedule', label: 'Delete PM Schedule' },
    ],
  },
  {
    key: 'maintSettings', label: 'Settings',
    perms: [
      { key: 'manageMaintenanceUsers', label: 'User Settings' },
    ],
  },
];

export const PROCESS_MODULES: ProcModule[] = [
  {
    key: 'productionEntry', label: 'Daily Production Entry',
    perms: [
      { key: 'viewProductionEntry', label: 'View Daily Production Entry' },
      { key: 'editProductionEntry', label: 'Key In Production Data' },
      { key: 'bypassProductionLock', label: 'Bypass month lock (edit past months anytime)' },
    ],
  },
  {
    key: 'productionReport', label: 'Production Report',
    perms: [
      { key: 'viewProductionReport', label: 'View Production Report' },
    ],
  },
  {
    key: 'processSettings', label: 'Settings',
    perms: [
      { key: 'manageProcessUsers', label: 'User Settings' },
    ],
  },
];

export const HR_MODULES: ProcModule[] = [
  {
    key: 'payroll', label: 'Payroll',
    perms: [
      { key: 'viewPayroll', label: 'View Payroll' },
    ],
  },
  {
    key: 'cagesTipped', label: 'Cages Tipped',
    perms: [
      { key: 'viewCagesTipped',   label: 'View Cages Tipped' },
      { key: 'createCagesTipped', label: 'Create Cages Tipped' },
      { key: 'editCagesTipped',   label: 'Edit Cages Tipped' },
      { key: 'deleteCagesTipped', label: 'Delete Cages Tipped' },
    ],
  },
  {
    key: 'cagesTippedShiftA', label: 'Cages Tipped – Shift A',
    perms: [
      { key: 'viewShiftA',   label: 'View Shift A' },
      { key: 'createShiftA', label: 'Create Shift A' },
      { key: 'editShiftA',   label: 'Edit Shift A' },
      { key: 'deleteShiftA', label: 'Delete Shift A' },
    ],
  },
  {
    key: 'cagesTippedShiftB', label: 'Cages Tipped – Shift B',
    perms: [
      { key: 'viewShiftB',   label: 'View Shift B' },
      { key: 'createShiftB', label: 'Create Shift B' },
      { key: 'editShiftB',   label: 'Edit Shift B' },
      { key: 'deleteShiftB', label: 'Delete Shift B' },
    ],
  },
  {
    key: 'workerList', label: 'Worker List',
    perms: [
      { key: 'viewWorkerList',      label: 'View Worker List' },
      { key: 'createWorker',        label: 'Add Worker' },
      { key: 'editWorker',          label: 'Edit Worker' },
      { key: 'deleteWorker',        label: 'Delete Worker' },
      { key: 'resignWorker',        label: 'Mark Worker as Resigned' },
      { key: 'manageWorkerLogins',  label: 'Create / Reset Worker Logins' },
    ],
  },
  {
    key: 'workerAttendanceReport', label: 'Worker Attendance Report',
    perms: [
      { key: 'viewWorkerAttendance', label: 'View Worker Attendance Report' },
    ],
  },
  {
    key: 'pieceRateSetting', label: 'Piece Rate Setting',
    perms: [
      { key: 'viewPieceRateSetting', label: 'View Piece Rate Setting' },
      { key: 'editPieceRateSetting', label: 'Edit Piece Rate Setting' },
    ],
  },
  {
    key: 'hrSettings', label: 'Settings',
    perms: [
      { key: 'manageHumanResourcesUsers', label: 'User Settings' },
    ],
  },
];

export type Section = 'procurement' | 'inventory' | 'maintenance' | 'process' | 'humanResources';

export const MODULES_BY_SECTION: Record<Section, ProcModule[]> = {
  procurement: PROC_MODULES,
  inventory: INV_MODULES,
  maintenance: MAINT_MODULES,
  process: PROCESS_MODULES,
  humanResources: HR_MODULES,
};

export const ALL_PERM_KEYS: string[] = [...PROC_MODULES, ...INV_MODULES, ...MAINT_MODULES, ...PROCESS_MODULES, ...HR_MODULES]
  .flatMap((m) => m.perms.map((p) => p.key));

const PROC_PERM_KEYS: Set<string> = new Set(PROC_MODULES.flatMap((m) => m.perms.map((p) => p.key)));
const INV_PERM_KEYS: Set<string> = new Set(INV_MODULES.flatMap((m) => m.perms.map((p) => p.key)));

// Admins bypass all checks. Users not in the userSettings table also bypass —
// matches the inventory.html behaviour where the bootstrap admin gets full access.
export function hasPerm(user: UserSetting | null, key: string): boolean {
  if (!user) return true;
  if (user.isAdmin) return true;
  const perms = user.permissions ?? [];
  return perms.includes(key);
}

export function canAccessProcurement(user: UserSetting | null): boolean {
  if (!user) return true;
  if (user.isAdmin) return true;
  return !!user.canAccessProcurement;
}

export function canAccessInventory(user: UserSetting | null): boolean {
  if (!user) return true;
  if (user.isAdmin) return true;
  return !!user.canAccessInventory;
}

export function canAccessMaintenance(user: UserSetting | null): boolean {
  if (!user) return true;
  if (user.isAdmin) return true;
  return !!user.canAccessMaintenance;
}

export function canAccessProcess(user: UserSetting | null): boolean {
  if (!user) return true;
  if (user.isAdmin) return true;
  return !!user.canAccessProcess;
}

export function canAccessHumanResources(user: UserSetting | null): boolean {
  if (!user) return true;
  if (user.isAdmin) return true;
  return !!user.canAccessHumanResources;
}
