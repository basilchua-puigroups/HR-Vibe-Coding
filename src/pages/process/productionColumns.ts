// Column structure of the Daily Production Report (palm oil mill), reconstructed
// from the Google Sheets export. The sheet is one very wide table; here it is
// modelled as a 3-tier header: Section -> Group -> daily column (leaf).
// Leaf `key` is the stable id used to store/retrieve a day's value.

export type ProdLeafKind = 'manual' | 'calculated' | 'carry';
// `where` restricts a leaf to a single surface: 'entry' = daily entry form only,
// 'report' = monthly report grid only. Undefined means it shows in both.
// `entryReadOnly` shows a calculated leaf in the entry form too, as a read-only
// box displaying the live auto-computed value (it still appears in the report).
// `entrySide` groups a leaf into a named column of the entry form (e.g. 'left'/'right'
// or 'tank1'/'tank2'/'tank3'); the form renders one column per distinct value.
// `unit` is a short suffix shown after the entry-form input box (e.g. "cages").
// `timeOfDay` validates the entry as a 4-digit 24h time (HHMM, e.g. 0830, 2359).
// `repairToggle` adds a "Repair" checkbox beside the box that fills the value with "R".
// `overridable` marks a field with a computed/default value the operator may override;
// the entry form shows Actual/Edited based on whether the typed value matches.
// `defaultVal` is the built-in default for an overridable field (e.g. "0.26" for Sesco Rate).
export interface ProdLeaf { key: string; label: string; kind?: ProdLeafKind; where?: 'entry' | 'report'; entryReadOnly?: boolean; entrySide?: string; unit?: string; timeOfDay?: boolean; repairToggle?: boolean; overridable?: boolean; defaultVal?: string; }
export interface ProdGroup { label: string; cols: ProdLeaf[]; }
export interface ProdSection { label: string; color: string; groups: ProdGroup[]; }

// Common sub-column sets
const TMY = (p: string): ProdLeaf[] => [
  { key: `${p}_t`, label: 'Today', kind: 'manual' },
  { key: `${p}_m`, label: 'Month Todate', kind: 'calculated' },
  { key: `${p}_y`, label: 'Year Todate', kind: 'calculated' },
];
const TMY_CALC = (p: string): ProdLeaf[] => [
  { key: `${p}_t`, label: 'Today', kind: 'calculated' },
  { key: `${p}_m`, label: 'Month Todate', kind: 'calculated' },
  { key: `${p}_y`, label: 'Year Todate', kind: 'calculated' },
];
const OC = (p: string): ProdLeaf[] => [
  // Opening is formula-derived (carried from the previous day's closing) — hidden
  // from the entry form, shown only in the report.
  { key: `${p}_o`, label: 'Opening', kind: 'carry', where: 'report' },
  { key: `${p}_c`, label: 'Closing', kind: 'manual' },
];
// One CPO tank as a vertical entry column (entrySide `tank{n}`). Opening is the
// auto-carried previous closing (editable, like the FFB opening). Reading/Despatch/
// Adjustment are keyed; Production and Closing Stock are derived.
const CPO_TANK = (no: 1 | 2 | 3): ProdLeaf[] => {
  const p = `cpo_t${no}`;
  const side = `tank${no}`;
  return [
    { key: `${p}_o`,     label: `Tank No.${no} Opening Balance`, kind: 'carry', entrySide: side, unit: 'MT' },
    { key: `${p}_ullage`, label: `Tank No.${no} Ullage`, entrySide: side, unit: 'm' },
    { key: `${p}_temp`,  label: `Tank No.${no} Temperature`, entrySide: side, unit: '°C' },
    { key: `${p}_cs`,    label: `Tank No.${no} Closing Stock`, entrySide: side, unit: 'MT' },
    { key: `${p}_desp`,  label: `Tank No.${no} Despatch`, entrySide: side, unit: 'MT' },
    { key: `${p}_adj`,   label: `Tank No.${no} Adjustment`, entrySide: side, unit: 'MT' },
    // Production = closing stock − opening + despatch + adjustment.
    { key: `${p}_prod`,  label: `Tank No.${no} Production`, kind: 'calculated', entryReadOnly: true, entrySide: side, unit: 'MT' },
  ];
};
// One PK storage unit as a vertical entry column (entrySide `pk{col}`).
// `hasUllage` is true for bunkers (not On Floor).
const PK_STORE = (label: string, p: string, col: string, hasUllage: boolean): ProdLeaf[] => {
  const side = `pk_${col}`;
  return [
    { key: `${p}_o`,    label: `${label} Opening Balance`, kind: 'carry', entrySide: side, unit: 'MT' },
    ...(hasUllage ? [{ key: `${p}_ullage`, label: `${label} Ullage`, entrySide: side, unit: 'm' } as ProdLeaf] : []),
    { key: `${p}_cs`,   label: `${label} Closing Stock`, entrySide: side, unit: 'MT' },
    { key: `${p}_desp`, label: `${label} Despatch`, entrySide: side, unit: 'MT' },
    { key: `${p}_adj`,  label: `${label} Adjustment`, entrySide: side, unit: 'MT' },
    // Production = closing stock − opening + despatch + adjustment.
    { key: `${p}_prod`, label: `${label} Production`, kind: 'calculated', entryReadOnly: true, entrySide: side, unit: 'MT' },
  ];
};

export const PRODUCTION_SECTIONS: ProdSection[] = [
  {
    label: 'FFB Reception Station',
    color: '#fde68a',
    groups: [
      { label: '', cols: [
        { key: 'recv_before_ster', label: 'Before Sterilizer Cages Count', entrySide: 'left', unit: 'cages' },
        { key: 'recv_in_ster',     label: 'Inside Sterilizer Cages Count', entrySide: 'left', unit: 'cages' },
        { key: 'recv_after_ster',  label: 'After Sterilizer Cages Count', entrySide: 'left', unit: 'cages' },
        { key: 'recv_empty',       label: 'Empty Cages Count', entrySide: 'left', unit: 'cages' },
        // Auto = before + inside + after sterilizer + empty cages.
        { key: 'recv_total_cages', label: 'Total No. of Cages', kind: 'calculated', entryReadOnly: true, entrySide: 'left', unit: 'cages' },
        { key: 'recv_tipped',      label: 'Total Cages Tipped', entrySide: 'left', unit: 'cages' },
        // Auto = before + inside + after sterilizer + total cages tipped.
        { key: 'recv_cages_filled', label: 'Cages Filled With FFB', kind: 'calculated', entryReadOnly: true, entrySide: 'left', unit: 'cages' },

        // Right column — FFB tonnage figures (MT). Manual figures are keyed to 2 dp;
        // derived/carried figures keep full precision so the stock tally holds.
        { key: 'ffb_rec_t',     label: 'FFB Received', entrySide: 'right', unit: 'MT' },
        // Auto-carried from the previous day's closing balance (editable on the seed day).
        { key: 'ffb_bal_o',     label: 'FFB Opening Balance', kind: 'carry', entrySide: 'right', unit: 'MT' },
        // Basis chosen per day: Assumed = operator keys it; Actual = auto-derived
        // (FFB received + opening) / cages filled.
        { key: 'cages_avg',     label: 'Average Cage Weight', entrySide: 'right', unit: 'MT' },
        // Key one of Ramp 1 / Ramp 2; the other auto-fills (Total Ramp − keyed).
        { key: 'ffb_ramp_no1',  label: 'Ramp 1 Balance', entrySide: 'right', unit: 'MT' },
        { key: 'ffb_ramp_no2',  label: 'Ramp 2 Balance', entrySide: 'right', unit: 'MT' },
        // Auto: Assumed → FFB received + opening − processed − FFB in cages; Actual → 0.
        { key: 'ffb_ramp',      label: 'Total Ramp Balance', kind: 'calculated', entryReadOnly: true, entrySide: 'right', unit: 'MT' },
        // Auto = (before + inside + after sterilizer cages) × avg cage weight.
        { key: 'ffb_cages_mt',  label: 'Total FFB in Cages', kind: 'calculated', entryReadOnly: true, entrySide: 'right', unit: 'MT' },
        // Auto = total cages tipped × avg cage weight.
        { key: 'ffb_proc_t',    label: 'FFB Processed', kind: 'calculated', entryReadOnly: true, entrySide: 'right', unit: 'MT' },
        // Auto = FFB received + opening − processed (= Total Ramp Balance + Total FFB in Cages).
        { key: 'ffb_bal_c',     label: 'FFB Closing Balance', kind: 'calculated', entryReadOnly: true, entrySide: 'right', unit: 'MT' },
      ] },
      // Report-only month/year-to-date aggregates (FFB Received/Processed Today are
      // keyed/derived above; these totals only appear in the monthly report).
      { label: 'FFB Received (MT)', cols: [
        { key: 'ffb_rec_m', label: 'Month Todate', kind: 'calculated' },
        { key: 'ffb_rec_y', label: 'Year Todate', kind: 'calculated' },
      ] },
      { label: 'FFB Processed (MT)', cols: [
        { key: 'ffb_proc_m', label: 'Month Todate', kind: 'calculated' },
        { key: 'ffb_proc_y', label: 'Year Todate', kind: 'calculated' },
      ] },
      { label: 'Ramp Bal = 0 (No. of Days)', cols: [
        { key: 'ramp_mtd', label: 'MTD', kind: 'calculated' },
        { key: 'ramp_ytd', label: 'YTD', kind: 'calculated' },
      ] },
    ],
  },
  {
    label: 'Process Hour/Throughput',
    color: '#fef08a',
    groups: [
      { label: 'Process Time', cols: [
        { key: 'proc_start', label: 'Process Starts', timeOfDay: true },
        { key: 'proc_stop',  label: 'Process Stop', timeOfDay: true },
      ] },
      // Blank group label so each box reads "Press No.X Running Hour"; tick Repair → "R".
      { label: '', cols: [
        { key: 'press1', label: 'Press No.1 Running Hour', unit: 'hrs', repairToggle: true },
        { key: 'press2', label: 'Press No.2 Running Hour', unit: 'hrs', repairToggle: true },
        { key: 'press3', label: 'Press No.3 Running Hour', unit: 'hrs', repairToggle: true },
        { key: 'press4', label: 'Press No.4 Running Hour', unit: 'hrs', repairToggle: true },
        { key: 'press5', label: 'Press No.5 Running Hour', unit: 'hrs', repairToggle: true },
        { key: 'press6', label: 'Press No.6 Running Hour', unit: 'hrs', repairToggle: true },
        { key: 'press7', label: 'Press No.7 Running Hour', unit: 'hrs', repairToggle: true },
      ] },
      { label: 'Average Press Process Hour', cols: [
        { key: 'press_hr_t', label: 'Today', unit: 'hrs' },
        { key: 'press_hr_m', label: 'Month Todate', kind: 'calculated' },
      ] },
      { label: 'Press Throughput', cols: [{ key: 'press_throughput', label: 'MT / Press Hour', kind: 'calculated' }] },
      { label: 'Press Efficiency', cols: [{ key: 'press_eff', label: 'FFB MT / Running Hr', kind: 'calculated' }] },
      { label: 'Turbine Running Hour', cols: [
        { key: 'turb_t', label: 'Today', unit: 'hrs' },
        { key: 'turb_m', label: 'Month Todate', kind: 'calculated' },
      ] },
      { label: 'Turbine Throughput', cols: [{ key: 'turb_throughput', label: 'MT / Turbine Hour', kind: 'calculated' }] },
    ],
  },
  {
    label: 'Rainfall',
    color: '#bae6fd',
    groups: [
      { label: 'Rainfall Data', cols: [{ key: 'rainfall', label: 'Rainfall', unit: 'mm' }] },
    ],
  },
  {
    label: 'CPO',
    color: '#fed7aa',
    groups: [
      // Today's production & despatch are derived from the per-tank movements below.
      { label: 'Produced (MT)', cols: TMY_CALC('cpo_prod') },
      { label: 'Despatch (MT)', cols: [
        { key: 'cpo_desp_t', label: 'Today', kind: 'calculated' },
        { key: 'cpo_desp_m', label: 'Month Todate', kind: 'calculated' },
        { key: 'cpo_desp_y', label: 'Year Todate', kind: 'calculated' },
      ] },
      { label: 'OER (%)',       cols: TMY_CALC('oer') },
      // Per-tank columns: Tank 1 / Tank 2 / Tank 3 each as a vertical column in entry.
      { label: '', cols: [...CPO_TANK(1), ...CPO_TANK(2), ...CPO_TANK(3)] },
      // CPO totals shown in their own row below the tank columns (entry only — the
      // report keeps its own Produced/Despatch/Total Stock groups). No `entrySide`
      // so they render left-to-right beneath the columns.
      { label: '', cols: [
        { key: 'cpo_total_open', label: 'TOTAL CPO OPENING STOCK', kind: 'calculated', entryReadOnly: true, unit: 'MT', where: 'entry' },
        { key: 'cpo_total_prod', label: 'TOTAL CPO PRODUCTION', kind: 'calculated', entryReadOnly: true, unit: 'MT', where: 'entry' },
        { key: 'cpo_total_desp', label: 'TOTAL CPO DESPATCH', kind: 'calculated', entryReadOnly: true, unit: 'MT', where: 'entry' },
        { key: 'cpo_total_cs',   label: 'TOTAL CPO CLOSING STOCK', kind: 'calculated', entryReadOnly: true, unit: 'MT', where: 'entry' },
      ] },
      { label: 'Total CPO Tank Stock (MT)', cols: [
        { key: 'cpo_tot_o', label: 'Opening Stock', kind: 'calculated' },
        { key: 'cpo_tot_c', label: 'Closing Stock', kind: 'calculated' },
      ] },
    ],
  },
  {
    label: 'Separator Recovery Oil',
    color: '#f1e3c0',
    groups: [
      { label: 'Separator 1 - Alfa Lava (MT)', cols: [
        { key: 'sro1_t', label: 'Today', unit: 'MT' },
        { key: 'sro1_m', label: 'MTD', kind: 'calculated' },
      ] },
      { label: 'Separator 2 - Prime (MT)', cols: [
        { key: 'sro2_t', label: 'Today', unit: 'MT' },
        { key: 'sro2_m', label: 'MTD', kind: 'calculated' },
      ] },
      { label: 'Total (MT)', cols: [
        { key: 'sro_tot_t', label: 'Today', kind: 'calculated' },
        { key: 'sro_tot_m', label: 'MTD', kind: 'calculated' },
      ] },
    ],
  },
  {
    label: 'PK (Palm Kernel)',
    color: '#bfdbfe',
    groups: [
      { label: 'KER (%)', cols: TMY_CALC('ker') },
      // Per-storage columns: Bunker 1, Bunker 2, On Floor.
      { label: '', cols: [
        ...PK_STORE('Bunker 1', 'pk_b1', 'b1', true),
        ...PK_STORE('Bunker 2', 'pk_b2', 'b2', true),
        ...PK_STORE('On Floor', 'pk_floor', 'floor', false),
      ] },
      // PK totals below the 3 columns (entry-only).
      { label: '', cols: [
        { key: 'pk_total_open', label: 'TOTAL PK OPENING STOCK', kind: 'calculated', entryReadOnly: true, unit: 'MT', where: 'entry' },
        { key: 'pk_total_prod', label: 'TOTAL PK PRODUCTION',    kind: 'calculated', entryReadOnly: true, unit: 'MT', where: 'entry' },
        { key: 'pk_total_desp', label: 'TOTAL PK DESPATCH',      kind: 'calculated', entryReadOnly: true, unit: 'MT', where: 'entry' },
        { key: 'pk_total_cs',   label: 'TOTAL PK CLOSING STOCK', kind: 'calculated', entryReadOnly: true, unit: 'MT', where: 'entry' },
      ] },
      // Report-only aggregates.
      { label: 'Produced (MT)', cols: TMY_CALC('pk_prod') },
      { label: 'Despatch (MT)', cols: [
        { key: 'pk_desp_t', label: 'Today', kind: 'calculated' },
        { key: 'pk_desp_m', label: 'Month Todate', kind: 'calculated' },
        { key: 'pk_desp_y', label: 'Year Todate', kind: 'calculated' },
      ] },
      { label: 'Total PK Stock (MT)', cols: [
        { key: 'pk_tot_o', label: 'Opening Stock', kind: 'calculated' },
        { key: 'pk_tot_c', label: 'Closing Stock', kind: 'calculated' },
      ] },
      { label: 'Despatch vs FFB Processed (%)', cols: [
        { key: 'pk_dvf',     label: 'MTD', kind: 'calculated' },
        { key: 'pk_dvf_ytd', label: 'YTD (PKS)', kind: 'calculated' },
      ] },
    ],
  },
  {
    label: 'PKS (Palm Kernel Shell)',
    color: '#fca5a5',
    groups: [
      { label: '', cols: [
        // Opening auto-carried; editable with Actual/Edited remark.
        { key: 'pks_bal_o',        label: 'PKS Opening Stock',             kind: 'carry', unit: 'MT' },
        { key: 'pks_rate',         label: 'PKS Extract Rate',              unit: '%' },
        // Production = FFB processed × extract rate% (Excel N26).
        { key: 'pks_prod_t',       label: 'PKS Production',                kind: 'calculated', entryReadOnly: true, unit: 'MT' },
        { key: 'pks_desp_t',       label: 'PKS Despatch',                  unit: 'MT' },
        { key: 'pks_boiler_kecil', label: 'PKS Used by Boiler - Small Shovel', unit: 'bucket' },
        { key: 'pks_boiler_besar', label: 'PKS Used by Boiler - Big Shovel',   unit: 'bucket' },
        { key: 'pks_adj',          label: 'PKS Adjustment',                unit: 'MT' },
        // Closing = opening + production − despatch − adjustment.
        { key: 'pks_bal_c',        label: 'PKS Closing Stock',             kind: 'calculated', entryReadOnly: true, unit: 'MT' },
      ] },
      // Report-only MTD/YTD aggregates (Today lives in the entry group above).
      { label: 'Produced (MT)', cols: [
        { key: 'pks_prod_m', label: 'Month Todate', kind: 'calculated' },
        { key: 'pks_prod_y', label: 'Year Todate', kind: 'calculated' },
      ] },
      { label: 'Despatch (MT)', cols: [
        { key: 'pks_desp_m', label: 'Month Todate', kind: 'calculated' },
        { key: 'pks_desp_y', label: 'Year Todate', kind: 'calculated' },
      ] },
    ],
  },
  // EFB (Empty Fruit Bunch) — no numeric fields; photos are uploaded via the entry
  // form and stored in Supabase Storage on `ProductionRecord.efbPhotos`.
  { label: 'EFB (Empty Fruit Bunch)', color: '#bbf7d0', groups: [] },
  {
    label: 'Organic Matter',
    color: '#d9f99d',
    groups: [
      { label: '', cols: [
        { key: 'om_bal_o',     label: 'Opening Stock',      kind: 'carry', unit: 'MT' },
        { key: 'om_ratio',     label: 'Ratio (Trips to MT)', unit: 'MT/trip' },
        { key: 'om_prod_trips', label: 'Produced (Trips)',   unit: 'trips' },
        // Auto = ratio × trips; operator may override (shows Actual/Edited).
        { key: 'om_prod_t',    label: 'Produced (MT)',       overridable: true, unit: 'MT' },
        { key: 'om_desp_t',    label: 'Despatch',            unit: 'MT' },
        // Auto = opening + produced − despatch.
        { key: 'om_bal_c',     label: 'Closing Stock',       kind: 'calculated', entryReadOnly: true, unit: 'MT' },
      ] },
      // Report-only MTD/YTD.
      { label: 'Produced (MT)', cols: [
        { key: 'om_prod_m', label: 'Month Todate', kind: 'calculated' },
        { key: 'om_prod_y', label: 'Year Todate', kind: 'calculated' },
      ] },
      { label: 'Despatch (MT)', cols: [
        { key: 'om_desp_m', label: 'Month Todate', kind: 'calculated' },
        { key: 'om_desp_y', label: 'Year Todate', kind: 'calculated' },
      ] },
    ],
  },
  {
    label: 'Animal Feed',
    color: '#ddd6fe',
    groups: [
      { label: '', cols: [
        { key: 'af_bal_o',  label: 'Opening Stock',          kind: 'carry', unit: 'MT' },
        { key: 'af150_t',   label: 'AF-150 Despatch (Estate)', unit: 'MT' },
        { key: 'af250_t',   label: 'AF-250 Despatch (Cash)',   unit: 'MT' },
        { key: 'af_prod_t', label: 'Produced',               unit: 'MT' },
        // Closing = opening + produced − AF-150 despatch − AF-250 despatch.
        { key: 'af_bal_c',  label: 'Closing Stock',          kind: 'calculated', entryReadOnly: true, unit: 'MT' },
      ] },
      // Report-only MTD/YTD.
      { label: 'AF-150 Despatch (MT)', cols: [
        { key: 'af150_m', label: 'Month Todate', kind: 'calculated' },
        { key: 'af150_y', label: 'Year Todate',  kind: 'calculated' },
      ] },
      { label: 'AF-250 Despatch (MT)', cols: [
        { key: 'af250_m', label: 'Month Todate', kind: 'calculated' },
        { key: 'af250_y', label: 'Year Todate',  kind: 'calculated' },
      ] },
      { label: 'Total Despatch (MT)', cols: [
        { key: 'af_tot_t', label: 'Today',       kind: 'calculated' },
        { key: 'af_tot_m', label: 'Month Todate', kind: 'calculated' },
        { key: 'af_tot_y', label: 'Year Todate',  kind: 'calculated' },
      ] },
    ],
  },
  {
    label: 'Power / Electricity',
    color: '#cbd5e1',
    groups: [
      { label: '', cols: [
        { key: 'sesco_reading', label: 'Sesco Meter',  unit: 'KWHr' },
        { key: 'msb_reading',   label: 'MSB Reading',  unit: 'MWHr' },
        // Default rate 0.26 RM/KWHr; overridable — shows Actual/Edited.
        { key: 'sesco_rate',    label: 'Sesco Rate',   overridable: true, defaultVal: '0.26', unit: 'RM/KWHr' },
        { key: 'boiler_running', label: 'Boiler No.',  unit: 'Running' },
      ] },
      // Report-only derived figures.
      { label: 'Sesco', cols: [
        { key: 'sesco_net',    label: 'Net Daily Consumption (KWHr)', kind: 'calculated', where: 'report' },
        { key: 'sesco_amount', label: 'Amount (RM)',                  kind: 'calculated', where: 'report' },
      ] },
      { label: 'MSB', cols: [
        { key: 'msb_net', label: 'Net Daily Consumption (MWHr)', kind: 'calculated', where: 'report' },
      ] },
    ],
  },
];

// Shorthand for report-only leaf rows (no entry/carry flags needed in the grid).
const R = (key: string, label: string): ProdLeaf => ({ key, label });

/**
 * Sections as shown in the monthly report grid.
 * Defined explicitly (not derived from PRODUCTION_SECTIONS) so it matches the
 * reference report layout exactly — internal reception/calculation fields are
 * excluded and sections are merged/reordered to match the PDF column order.
 */
export const REPORT_SECTIONS: ProdSection[] = [
  // ── FFB (yellow) — received, processed, balance, ramp, average cages weight ─
  {
    label: 'Fresh Fruit Bunches (FFB)',
    color: '#fef08a',
    groups: [
      { label: 'Received (MT)', cols: [R('ffb_rec_t','Today'), R('ffb_rec_m','Month Todate'), R('ffb_rec_y','Year Todate')] },
      { label: 'Processed (MT)', cols: [R('ffb_proc_t','Today'), R('ffb_proc_m','Month Todate'), R('ffb_proc_y','Year Todate')] },
      { label: 'Balance (MT)', cols: [R('ffb_bal_o','Opening'), R('ffb_bal_c','Closing'), R('ffb_ramp','Today Ramp Balance')] },
      { label: 'Ramp Bal = 0 (No. of Days)', cols: [R('ramp_mtd','MTD'), R('ramp_ytd','YTD')] },
      { label: 'Average Cages Weight (MT)', cols: [R('cages_avg','MT')] },
    ],
  },
  // ── Throughput (orange) — process time, press, actual throughput ───────────
  {
    label: 'Throughput',
    color: '#fdba74',
    groups: [
      { label: 'Process Time', cols: [R('proc_start','Process Starts'), R('proc_stop','Process Stop')] },
      { label: 'Press Machine (R = Repair)', cols: [
        R('press1','No.1'), R('press2','No.2'), R('press3','No.3'), R('press4','No.4'),
        R('press5','No.5'), R('press6','No.6'), R('press7','No.7'),
      ] },
      { label: 'Average Press Process Hour (Hr)', cols: [R('press_hr_t','Today'), R('press_hr_m','Month Todate')] },
      { label: 'Press Throughput (MT/Hr)',   cols: [R('press_throughput','FFB Processed / Average Press Hour')] },
      { label: 'Press Efficiency (MT/Hr)',   cols: [R('press_eff',        'FFB Processed / Total Press Hour')] },
      { label: 'Turbine Running Hour (Hr)',  cols: [R('turb_t','Today'), R('turb_m','Month Todate')] },
      { label: 'Actual Throughput (MT/Hr)', cols: [R('turb_throughput',  'FFB Processed / Turbine Running Hour')] },
    ],
  },
  // ── Rainfall ──────────────────────────────────────────────────────────────
  {
    label: 'Rainfall',
    color: '#bae6fd',
    groups: [
      { label: 'Rainfall Data (mm)', cols: [R('rainfall','Today'), R('rainfall_m','MTD'), R('rainfall_y','YTD')] },
    ],
  },
  // ── CPO ───────────────────────────────────────────────────────────────────
  {
    label: 'Crude Palm Oil (CPO)',
    color: '#fed7aa',
    groups: [
      { label: 'Produced (MT)', cols: [R('cpo_prod_t','Today'), R('cpo_prod_m','Month Todate'), R('cpo_prod_y','Year Todate')] },
      { label: 'Despatch (MT)', cols: [R('cpo_desp_t','Today'), R('cpo_desp_m','Month Todate'), R('cpo_desp_y','Year Todate')] },
      { label: 'OER (%)',       cols: [R('oer_t','Today'),      R('oer_m','Month Todate'),      R('oer_y','Year Todate')] },
      { label: 'Tank No.1 Balance (MT)', cols: [R('cpo_t1_o','Opening'), R('cpo_t1_cs','Closing')] },
      { label: 'Tank No.2 Balance (MT)', cols: [R('cpo_t2_o','Opening'), R('cpo_t2_cs','Closing')] },
      { label: 'Tank No.3 Balance (MT)', cols: [R('cpo_t3_o','Opening'), R('cpo_t3_cs','Closing')] },
      { label: 'Total CPO Tank Stock (MT)', cols: [R('cpo_tot_o','Opening Stock'), R('cpo_tot_c','Closing Stock')] },
    ],
  },
  // ── Separator Recovery Oil ────────────────────────────────────────────────
  {
    label: 'Separator Recovery Oil',
    color: '#f1e3c0',
    groups: [
      { label: 'Separator 1 - Alfa Lava (MT)', cols: [R('sro1_t','Today'), R('sro1_m','MTD')] },
      { label: 'Separator 2 - Prime (MT)',    cols: [R('sro2_t','Today'), R('sro2_m','MTD')] },
      { label: 'Total (MT)',                  cols: [R('sro_tot_t','Today'), R('sro_tot_m','MTD')] },
    ],
  },
  // ── PK (Palm Kernel) ──────────────────────────────────────────────────────
  {
    label: 'Palm Kernel (PK)',
    color: '#bfdbfe',
    groups: [
      { label: 'Produced (MT)', cols: [R('pk_prod_t','Today'), R('pk_prod_m','Month Todate'), R('pk_prod_y','Year Todate')] },
      { label: 'Despatch (MT)', cols: [R('pk_desp_t','Today'), R('pk_desp_m','Month Todate'), R('pk_desp_y','Year Todate')] },
      { label: 'KER (%)',       cols: [R('ker_t','Today'),     R('ker_m','Month Todate'),     R('ker_y','Year Todate')] },
      { label: 'Bunker 1 Balance (MT)', cols: [R('pk_b1_o','Opening'), R('pk_b1_cs','Closing')] },
      { label: 'Bunker 2 Balance (MT)', cols: [R('pk_b2_o','Opening'), R('pk_b2_cs','Closing')] },
      { label: 'On Floor Balance (MT)', cols: [R('pk_floor_o','Opening'), R('pk_floor_cs','Closing')] },
      { label: 'Total PK Stock (MT)', cols: [R('pk_tot_o','Opening Stock'), R('pk_tot_c','Closing Stock')] },
    ],
  },
  // ── PKS (Palm Kernel Shell) ───────────────────────────────────────────────
  {
    label: 'Palm Kernel Shell (PKS)',
    color: '#fca5a5',
    groups: [
      { label: 'Produced (MT)', cols: [R('pks_prod_t','Today'), R('pks_prod_m','Month Todate'), R('pks_prod_y','Year Todate')] },
      { label: 'Despatch (MT)', cols: [R('pks_desp_t','Today'), R('pks_desp_m','Month Todate'), R('pks_desp_y','Year Todate')] },
      { label: 'Used by Boiler (Bucket)', cols: [R('pks_boiler_besar','Big Shovel'), R('pks_boiler_kecil','Small Shovel')] },
      { label: 'Balance (MT)', cols: [R('pks_bal_o','Opening'), R('pks_bal_c','Closing')] },
      { label: 'Despatch vs FFB Processed (%)', cols: [R('pk_dvf','MTD'), R('pk_dvf_ytd','YTD')] },
    ],
  },
  // ── Organic Matter ────────────────────────────────────────────────────────
  {
    label: 'Organic Matter',
    color: '#d9f99d',
    groups: [
      { label: 'Produced (MT)', cols: [R('om_prod_t','Today'), R('om_prod_m','Month Todate'), R('om_prod_y','Year Todate')] },
      { label: 'Despatch (MT)', cols: [R('om_desp_t','Today'), R('om_desp_m','Month Todate'), R('om_desp_y','Year Todate')] },
      { label: 'Balance (MT)',  cols: [R('om_bal_o','Opening'), R('om_bal_c','Closing')] },
    ],
  },
  // ── Animal Feed ───────────────────────────────────────────────────────────
  {
    label: 'Animal Feed',
    color: '#ddd6fe',
    groups: [
      { label: 'AF-150 Despatch (MT) — Estate', cols: [R('af150_t','Today'), R('af150_m','Month Todate'), R('af150_y','Year Todate')] },
      { label: 'AF-250 Despatch (MT) — Cash',   cols: [R('af250_t','Today'), R('af250_m','Month Todate'), R('af250_y','Year Todate')] },
      { label: 'AF Total Despatch (MT)',         cols: [R('af_tot_t','Today'), R('af_tot_m','Month Todate'), R('af_tot_y','Year Todate')] },
      { label: 'Balance (MT)',                   cols: [R('af_bal_o','Opening'), R('af_bal_c','Closing')] },
    ],
  },
  // ── Power / Electricity ───────────────────────────────────────────────────
  {
    label: 'Power / Electricity',
    color: '#cbd5e1',
    groups: [
      { label: 'Sesco (KWHr)', cols: [
        R('sesco_reading','Meter (KWHr)'), R('sesco_net','Net Daily Consumption'),
        R('sesco_rate','Rate'),            R('sesco_amount','Amount'),
      ] },
      { label: 'MSB (MWHr)', cols: [R('msb_reading','Meter (MWHr)'), R('msb_net','Net Daily Consumption')] },
      { label: 'Boiler',     cols: [R('boiler_running','Boiler Running')] },
    ],
  },
];

/** Flat list of every leaf column key, in display order. */
export const PRODUCTION_LEAF_KEYS: string[] = PRODUCTION_SECTIONS
  .flatMap((s) => s.groups.flatMap((g) => g.cols.map((c) => c.key)));

export const PRODUCTION_LEAVES: ProdLeaf[] = PRODUCTION_SECTIONS
  .flatMap((s) => s.groups.flatMap((g) => g.cols));

export const PRODUCTION_MANUAL_KEYS = new Set(
  PRODUCTION_LEAVES
    .filter((leaf) => leaf.kind !== 'calculated')
    .map((leaf) => leaf.key),
);

// MT figures: stored/computed at full precision (so the FFB stock tally holds) but
// displayed to 2 dp. Keys are the MT-unit leaves.
const MT_DISPLAY_KEYS = new Set(PRODUCTION_LEAVES.filter((leaf) => leaf.unit === 'MT').map((leaf) => leaf.key));

/** Format a stored/computed value for display: MT figures round to 2 dp, others pass through. */
export function displayProductionValue(key: string, value: string | undefined): string {
  const v = value ?? '';
  if (v === '' || !MT_DISPLAY_KEYS.has(key)) return v;
  const x = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(x) ? x.toFixed(2) : v;
}

/** Total number of leaf columns in a section (for header colSpan). */
export const sectionLeafCount = (s: ProdSection): number =>
  s.groups.reduce((sum, g) => sum + g.cols.length, 0);

// ── Month-end adjustment record ──────────────────────────────────────────────
// The last day of a month can carry a second "adjustment" record. It is stored
// with the date suffixed by `-adj` (e.g. `2026-05-30-adj`). Because that string
// sorts immediately after the plain day, every date-ordered calculation (MTD/YTD
// sums, opening-balance carry) treats it as the final entry of the month with no
// special-casing. At the Supabase boundary it is split back into a real date plus
// an `adj` boolean column (the DB date column can't hold the suffix).
export const ADJ_SUFFIX = '-adj';
export const isAdjDate = (date: string): boolean => date.endsWith(ADJ_SUFFIX);
/** Strip the `-adj` suffix to get the underlying YYYY-MM-DD date. */
export const baseDate = (date: string): string =>
  isAdjDate(date) ? date.slice(0, -ADJ_SUFFIX.length) : date;
/** Last calendar day number of the month for a YYYY-MM (or longer) string. */
export const lastDayOfMonth = (ym: string): number => {
  const [y, m] = ym.slice(0, 7).split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

/**
 * A production month locks for editing on the 16th of the following month.
 * So a given production date is editable only when it falls in the current month,
 * or in the previous month and today is on/before the 15th. Older months are
 * always locked. Example: on 16 Jun 2026, May 2026 (and earlier) is locked.
 * The `-adj` suffix doesn't change the month, so we read year/month from YYYY-MM.
 * Users with the `bypassProductionLock` permission ignore this (checked by callers).
 */
export const isProductionDateLocked = (date: string, now: Date = new Date()): boolean => {
  const ym = date.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ym)) return false;
  const [entryYear, entryMonth] = ym.split('-').map(Number); // entryMonth: 1-12
  const entryIdx = entryYear * 12 + (entryMonth - 1);
  const nowIdx = now.getFullYear() * 12 + now.getMonth();
  const diff = nowIdx - entryIdx;
  if (diff <= 0) return false;               // current or future month — not month-locked
  if (diff === 1) return now.getDate() > 15; // previous month — locked from the 16th
  return true;                               // two or more months old — always locked
};
