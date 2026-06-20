import type { ProductionRecord } from '../../types';
import { PRODUCTION_LEAVES } from './productionColumns';

type Values = Record<string, string>;

const leafByKey = new Map(PRODUCTION_LEAVES.map((leaf) => [leaf.key, leaf]));

function n(value: string | undefined): number {
  if (value == null || value === '') return 0;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmt(value: number, dp = 2): string {
  if (!Number.isFinite(value)) return '';
  if (Math.abs(value) < 0.000001) return '';
  return Number(value.toFixed(dp)).toString();
}

// Full-precision format (keeps up to `dp` decimals, trims trailing zeros, shows 0).
// Used for the FFB stock chain (avg weight, processed, FFB in cages, ramp, closing)
// so closing = received + opening − processed tallies exactly.
function fmtP(value: number, dp = 6): string {
  if (!Number.isFinite(value)) return '';
  return Number(value.toFixed(dp)).toString();
}

// Production format: like fmt but always shows 0.00 instead of blank when result is zero.
// Used for derived production figures (closing − opening + despatch + adj) so the field
// never shows "Auto-calculated" when the math produces 0.
function fmtProd(value: number, dp = 2): string {
  if (!Number.isFinite(value)) return '';
  return value.toFixed(dp);
}

function pct(numerator: number, denominator: number): string {
  return denominator > 0 ? fmt((numerator / denominator) * 100, 2) : '';
}

function isSameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

function isSameYear(a: string, b: string): boolean {
  return a.slice(0, 4) === b.slice(0, 4);
}

/** Sum a key's value across computed records up to `date` within month/year scope. */
function sumUntil(records: ProductionRecord[], date: string, key: string, scope: 'month' | 'year'): number {
  return records
    .filter((r) => r.date <= date && (scope === 'month' ? isSameMonth(r.date, date) : isSameYear(r.date, date)))
    .reduce((sum, r) => sum + n(r.values[key]), 0);
}

function prevReadingDiff(current: string | undefined, prev: Values | undefined, key: string): string {
  if (!current || !prev?.[key]) return '';
  const diff = n(current) - n(prev[key]);
  return diff >= 0 ? fmt(diff) : '';
}

/** Fill every `_m`/`_y` leaf as the month/year-to-date sum of its `_t` sibling. */
function addTmyTotals(records: ProductionRecord[], date: string, out: Values) {
  for (const leaf of PRODUCTION_LEAVES) {
    if (!leaf.key.endsWith('_m') && !leaf.key.endsWith('_y')) continue;
    const todayKey = `${leaf.key.slice(0, -2)}_t`;
    if (!leafByKey.has(todayKey)) continue;
    out[leaf.key] = fmt(sumUntil(records, date, todayKey, leaf.key.endsWith('_m') ? 'month' : 'year'));
  }
}

function countRampZero(records: ProductionRecord[], date: string, scope: 'month' | 'year'): number {
  return records.filter((r) => {
    if (r.date > date) return false;
    if (scope === 'month' && !isSameMonth(r.date, date)) return false;
    if (scope === 'year' && !isSameYear(r.date, date)) return false;
    return r.values.ffb_ramp !== '' && n(r.values.ffb_ramp) === 0;
  }).length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Same-day derived values — mirrors the Excel daily tally sheet formulas.
// `prev` is the previous day's already-computed values (for carry-dependent and
// meter-difference figures). `out` already has carried `_o` openings resolved.
// ─────────────────────────────────────────────────────────────────────────────
function computeDaily(out: Values, prev: Values | undefined) {
  // FFB Reception Station — total cages = before + inside + after sterilizer + empty.
  out.recv_total_cages = fmt(
    n(out.recv_before_ster) + n(out.recv_in_ster) + n(out.recv_after_ster) + n(out.recv_empty),
    0,
  );
  // Cages filled = before + inside + after sterilizer + total cages tipped.
  out.recv_cages_filled = fmt(
    n(out.recv_before_ster) + n(out.recv_in_ster) + n(out.recv_after_ster) + n(out.recv_tipped),
    0,
  );

  // ── FFB stock chain ──────────────────────────────────────────────────────
  // The whole chain runs at full precision (fmtP) so the stock tallies exactly:
  //   closing = received + opening − processed = ramp + FFB-in-cages.
  const received = n(out.ffb_rec_t);
  const opening = n(out.ffb_bal_o);
  const tipped = n(out.recv_tipped);
  const beforeInAfter = n(out.recv_before_ster) + n(out.recv_in_ster) + n(out.recv_after_ster);
  const cagesFilled = n(out.recv_cages_filled);
  const actualBasis = out.cages_avg_mode === 'actual';

  // Average cage weight. Actual = auto (FFB received + opening) / cages filled, so the
  // ramp clears to 0. Assumed = the operator's keyed weight (left untouched here).
  if (actualBasis) {
    out.cages_avg = cagesFilled > 0 ? fmtP((received + opening) / cagesFilled) : '';
  }
  const avg = n(out.cages_avg);

  // Processed and FFB-in-cages derive from the full-precision average weight.
  out.ffb_proc_t = fmtP(tipped * avg);                 // total cages tipped × avg weight
  out.ffb_cages_mt = fmtP(beforeInAfter * avg);        // (before+inside+after cages) × avg weight

  // Total ramp balance: Actual → 0; Assumed → received + opening − processed − FFB-in-cages
  // (so the operator's assumed weight is reconciled into the ramp). The two per-ramp
  // figures (Ramp 1 / Ramp 2) are split at data-entry time.
  if (actualBasis) {
    out.ffb_ramp = '0';
    out.ffb_ramp_no1 = '0';
    out.ffb_ramp_no2 = '0';
  } else {
    out.ffb_ramp = fmtP(received + opening - n(out.ffb_proc_t) - n(out.ffb_cages_mt));
  }

  // FFB closing stock = received + opening − processed (= ramp + FFB-in-cages).
  out.ffb_bal_c = fmtP(received + opening - n(out.ffb_proc_t));

  // CPO per-tank production = closing stock − opening + despatch + adjustment.
  // (Closing Stock is keyed by the operator; production is derived from it.)
  for (const t of ['cpo_t1', 'cpo_t2', 'cpo_t3']) {
    out[`${t}_prod`] = fmtProd(n(out[`${t}_cs`]) - n(out[`${t}_o`]) + n(out[`${t}_desp`]) + n(out[`${t}_adj`]));
  }
  out.cpo_prod_t = fmtProd(n(out.cpo_t1_prod) + n(out.cpo_t2_prod) + n(out.cpo_t3_prod)); // Excel F33
  out.cpo_desp_t = fmtProd(n(out.cpo_t1_desp) + n(out.cpo_t2_desp) + n(out.cpo_t3_desp));
  // CPO totals (shown at the bottom of the Tank 3 entry column).
  out.cpo_total_open = fmt(n(out.cpo_t1_o) + n(out.cpo_t2_o) + n(out.cpo_t3_o));
  out.cpo_total_prod = out.cpo_prod_t;
  out.cpo_total_desp = out.cpo_desp_t;
  out.cpo_total_cs = fmt(n(out.cpo_t1_cs) + n(out.cpo_t2_cs) + n(out.cpo_t3_cs));

  // Separator Recovery Oil totals.
  out.sro_tot_t = fmt(n(out.sro1_t) + n(out.sro2_t));

  // PK per-storage production = closing stock − opening + despatch + adjustment.
  for (const p of ['pk_b1', 'pk_b2', 'pk_floor']) {
    out[`${p}_prod`] = fmtProd(n(out[`${p}_cs`]) - n(out[`${p}_o`]) + n(out[`${p}_desp`]) + n(out[`${p}_adj`]));
  }
  out.pk_prod_t  = fmtProd(n(out.pk_b1_prod) + n(out.pk_b2_prod) + n(out.pk_floor_prod));
  out.pk_desp_t  = fmtProd(n(out.pk_b1_desp) + n(out.pk_b2_desp) + n(out.pk_floor_desp));
  // PK totals (shown below the 3 storage columns in the entry form).
  out.pk_total_open = fmt(n(out.pk_b1_o)  + n(out.pk_b2_o)  + n(out.pk_floor_o));
  out.pk_total_prod = out.pk_prod_t;
  out.pk_total_desp = out.pk_desp_t;
  out.pk_total_cs   = fmt(n(out.pk_b1_cs) + n(out.pk_b2_cs) + n(out.pk_floor_cs));

  // PKS production = FFB processed × extract rate% (Excel N26).
  out.pks_prod_t = fmt(n(out.ffb_proc_t) * n(out.pks_rate) / 100);
  // PKS closing stock = opening + production − despatch + adjustment.
  out.pks_bal_c = fmt(n(out.pks_bal_o) + n(out.pks_prod_t) - n(out.pks_desp_t) + n(out.pks_adj));

  // Organic Matter: produced MT = ratio × trips (default ratio 3.5 if not keyed).
  // If operator has manually keyed om_prod_t, that value is already in `out`; only
  // fill it when blank so the manual override is preserved.
  const omRatio = n(out.om_ratio) || 3.5;
  if (!out.om_prod_t) out.om_prod_t = fmt(omRatio * n(out.om_prod_trips));
  // Closing stock = opening + produced − despatch.
  out.om_bal_c = fmt(n(out.om_bal_o) + n(out.om_prod_t) - n(out.om_desp_t));

  // Animal Feed: total despatch = AF-150 + AF-250; closing = opening + produced − despatch.
  out.af_tot_t = fmt(n(out.af150_t) + n(out.af250_t));
  out.af_bal_c = fmt(n(out.af_bal_o) + n(out.af_prod_t) - n(out.af150_t) - n(out.af250_t));

  // OER / KER (today) use the derived production over FFB processed  (Excel F35 / J35).
  out.oer_t = pct(n(out.cpo_prod_t), n(out.ffb_proc_t));
  out.ker_t = pct(n(out.pk_prod_t), n(out.ffb_proc_t));

  // Throughput / efficiency (same-day).
  const pressRunningHours = ['press1', 'press2', 'press3', 'press4', 'press5', 'press6', 'press7']
    .reduce((sum, key) => sum + n(out[key]), 0);
  out.press_throughput = n(out.press_hr_t) > 0 ? fmt(n(out.ffb_proc_t) / n(out.press_hr_t), 2) : '';
  out.press_eff = pressRunningHours > 0 ? fmt(n(out.ffb_proc_t) / pressRunningHours, 2) : '';
  out.turb_throughput = n(out.turb_t) > 0 ? fmt(n(out.ffb_proc_t) / n(out.turb_t), 2) : '';

  // Total tank / bunker stock.
  out.cpo_tot_o = fmt(n(out.cpo_t1_o) + n(out.cpo_t2_o) + n(out.cpo_t3_o));
  out.cpo_tot_c = fmt(n(out.cpo_t1_cs) + n(out.cpo_t2_cs) + n(out.cpo_t3_cs));
  out.pk_tot_o = out.pk_total_open;
  out.pk_tot_c = out.pk_total_cs;

  // Power meters — net daily consumption from the running meter reading.
  out.sesco_net = prevReadingDiff(out.sesco_reading, prev, 'sesco_reading');
  const sescoRate = n(out.sesco_rate) || 0.26;
  out.sesco_amount = n(out.sesco_net) > 0 ? fmt(n(out.sesco_net) * sescoRate, 2) : '';
  out.msb_net = prevReadingDiff(out.msb_reading, prev, 'msb_reading');
}

/**
 * Compute derived values for every production record, in date order, so that:
 *  - carried `_o` openings come from the *previous day's computed closing*, and
 *  - month/year-to-date totals sum the *computed* `_t` figures.
 * Returns a map of date → computed values (manual inputs + derived).
 */
export function computeAll(production: ProductionRecord[]): Map<string, Values> {
  const sorted = [...production].sort((a, b) => a.date.localeCompare(b.date));
  const result = new Map<string, Values>();
  const computed: ProductionRecord[] = [];
  let prev: Values | undefined;

  // Pass 1 — per-day values (carry + same-day derived), in chronological order.
  for (const rec of sorted) {
    const out: Values = { ...rec.values };
    for (const leaf of PRODUCTION_LEAVES) {
      if (leaf.kind !== 'carry') continue;
      if (out[leaf.key] !== '' && out[leaf.key] != null) continue;
      const closingKey = `${leaf.key.slice(0, -2)}_c`;
      if (prev?.[closingKey]) out[leaf.key] = prev[closingKey];
    }
    computeDaily(out, prev);
    result.set(rec.date, out);
    computed.push({ id: 0, date: rec.date, values: out });
    prev = out;
  }

  // Pass 2 — month/year-to-date aggregates from the computed `_t` values.
  for (const rec of computed) {
    const out = rec.values;
    addTmyTotals(computed, rec.date, out);
    out.oer_m = pct(n(out.cpo_prod_m), n(out.ffb_proc_m));
    out.oer_y = pct(n(out.cpo_prod_y), n(out.ffb_proc_y));
    out.ker_m = pct(n(out.pk_prod_m), n(out.ffb_proc_m));
    out.ker_y = pct(n(out.pk_prod_y), n(out.ffb_proc_y));
    out.press_hr_m = fmt(sumUntil(computed, rec.date, 'press_hr_t', 'month'));
    out.turb_m = fmt(sumUntil(computed, rec.date, 'turb_t', 'month'));
    out.ramp_mtd = fmt(countRampZero(computed, rec.date, 'month'), 0);
    out.ramp_ytd = fmt(countRampZero(computed, rec.date, 'year'), 0);
    out.efb_mtd = fmt(sumUntil(computed, rec.date, 'efb_today_mt', 'month'));
    out.efb_ytd = fmt(sumUntil(computed, rec.date, 'efb_today_mt', 'year'));
    out.rainfall_m = fmt(sumUntil(computed, rec.date, 'rainfall', 'month'));
    out.rainfall_y = fmt(sumUntil(computed, rec.date, 'rainfall', 'year'));
    out.pk_dvf = pct(n(out.pk_desp_m), n(out.ffb_proc_m));
    out.pk_dvf_ytd = pct(n(out.pk_desp_y), n(out.ffb_proc_y));
  }

  return result;
}

/**
 * Computed values for a single date, given the full history plus the (possibly
 * unsaved) raw values for that date. Same signature the report grid and entry
 * preview use; internally it runs the sequential month/year computation so
 * carries and to-date totals are based on derived figures.
 */
export function calculatedProductionValues(
  production: ProductionRecord[],
  date: string,
  rawValues: Values,
): Values {
  const merged: ProductionRecord[] = [
    ...production.filter((r) => r.date !== date),
    { id: 0, date, values: rawValues },
  ];
  return computeAll(merged).get(date) ?? { ...rawValues };
}
