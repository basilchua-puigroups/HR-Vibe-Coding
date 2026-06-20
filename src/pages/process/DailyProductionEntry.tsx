import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { NoPermission } from '../../components/NoPermission';
import { nextId } from '../../utils/codes';
import { canAccessProcess, hasPerm } from '../../utils/permissions';
import { appendAudit } from '../../utils/audit';
import { PRODUCTION_MANUAL_KEYS, PRODUCTION_SECTIONS, PRODUCTION_LEAVES, ADJ_SUFFIX, lastDayOfMonth, isProductionDateLocked, baseDate, displayProductionValue, type ProdLeaf } from './productionColumns';
import { calculatedProductionValues, computeAll } from './productionCalculations';
import { pushProductionToSheet } from '../../utils/googleSheets';

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function today(): string {
  return ymd(new Date());
}
/** Latest date that production may be keyed in for: yesterday (the day must be over). */
function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return ymd(d);
}

// On the seed day (no earlier record to carry from) the carried `Opening` balances
// become editable so the starting stock can be entered once; otherwise they stay
// report-only (auto-carried from the previous day's closing).
function sectionFields(section: (typeof PRODUCTION_SECTIONS)[number], seedOpenings: boolean) {
  return section.groups
    .map((group) => ({
      ...group,
      inputCols: group.cols.filter((col) =>
        (col.kind !== 'calculated' || col.entryReadOnly)
        && (col.where !== 'report' || (seedOpenings && col.kind === 'carry'))),
    }))
    .filter((group) => group.inputCols.length > 0);
}

function fieldLabel(groupLabel: string, col: ProdLeaf): string {
  if (!groupLabel) return col.label;
  if (col.label === 'Today' || col.label === 'Opening' || col.label === 'Closing') return groupLabel;
  return `${groupLabel} - ${col.label}`;
}

export default function DailyProductionEntry() {
  const { state, setState } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [date, setDate] = useState(yesterday());
  const maxDate = yesterday();
  // On the month's last day the user must pick which of the two records they are
  // editing: 'before' = the plain month-end figures, 'adj' = the `…-adj`
  // adjustment record. 'none' = not chosen yet (blocks saving).
  const [lastDayKind, setLastDayKind] = useState<'none' | 'before' | 'adj'>('none');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [efbPhotos, setEfbPhotos] = useState<Array<{ name: string; data: string }>>([]);
  const [dirty, setDirty] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sheetStatus, setSheetStatus] = useState<'idle' | 'pushing' | 'ok' | 'error'>('idle');
  const [sheetError, setSheetError] = useState<string>('');
  const [monthPrintYM, setMonthPrintYM] = useState(yesterday().slice(0, 7));

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  // The month's last day can hold a second "adjustment" record dated `…-adj`.
  const isLastDay = validDate && Number(date.slice(8, 10)) === lastDayOfMonth(date);
  const effectiveDate = isLastDay && lastDayKind === 'adj' ? `${date}${ADJ_SUFFIX}` : date;
  // True when we still need the user to pick before/adjustment on the last day.
  const needsKind = isLastDay && lastDayKind === 'none';
  // Production can only be keyed in for days that are fully over (yesterday or
  // earlier) — today and future dates are not allowed.
  const isFutureDate = validDate && date > maxDate;

  const recordFor = (d: string) => state.production.find((record) => record.date === d);

  // Reset the form only when the calendar date changes (not after a save, so the
  // keyed-in values stay in the boxes for re-use). On the last day we clear and
  // wait for the user to choose which entry; on any other day we load that day's
  // record for editing.
  useEffect(() => {
    setLastDayKind('none');
    setDraft(isLastDay ? {} : { ...(recordFor(date)?.values ?? {}) });
    setEfbPhotos(recordFor(date)?.efbPhotos ?? []);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  if (!canAccessProcess(currentUser) || !hasPerm(currentUser, 'viewProductionEntry')) return <NoPermission backPath="/process" />;

  const editable = hasPerm(currentUser, 'editProductionEntry');
  // Past months lock on the 16th of the following month. Users with the bypass
  // permission can still edit them.
  const bypassLock = hasPerm(currentUser, 'bypassProductionLock');
  const monthLocked = validDate && !bypassLock && isProductionDateLocked(date);
  // Seed day = no earlier record exists to carry openings from, so the operator
  // enters the starting balances once. After this, openings auto-carry.
  const isSeedDay = validDate && !state.production.some((record) => baseDate(record.date) < date);

  // Pick (or un-pick) which last-day record to edit. If anything has been keyed
  // in already (e.g. the before-adjustment figures just saved), keep it in the
  // boxes and route it to the chosen record so only the changed cells need
  // editing. Only load the chosen record's saved values when the form is empty.
  const pickKind = (kind: 'before' | 'adj') => {
    const next = lastDayKind === kind ? 'none' : kind;
    setLastDayKind(next);
    if (next === 'none') return;
    const hasInput = Object.values(draft).some((value) => value.trim() !== '');
    if (hasInput) {
      setDirty(true); // carried-over values are unsaved against the chosen record
    } else {
      const target = next === 'adj' ? `${date}${ADJ_SUFFIX}` : date;
      setDraft({ ...(recordFor(target)?.values ?? {}) });
      setDirty(false);
    }
  };
  // ── Edit History ─────────────────────────────────────────────────────────────
  // Scans all saved production records for manually overridden values (opening
  // balances that differ from auto-carry, overridable/default fields that differ
  // from their computed/default value) and returns them newest-first.
  function buildEditHistory() {
    type HistoryRow = { date: string; section: string; field: string; expected: string; saved: string };
    const rows: HistoryRow[] = [];
    const n2 = (v?: string) => { const x = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(x) ? x : 0; };
    const dp2 = (v?: string) => v && v.trim() !== '' ? n2(v).toFixed(2) : '';

    // Full computed chain (with manual carries respected) — gives previous-day closings.
    const allComputed = computeAll(state.production);

    const sectionOf = (key: string) =>
      PRODUCTION_SECTIONS.find((s) => s.groups.some((g) => g.cols.some((c) => c.key === key)))?.label ?? '';

    const sorted = [...state.production].sort((a, b) => a.date.localeCompare(b.date));
    const carryLeaves = PRODUCTION_LEAVES.filter((l) => l.kind === 'carry' && l.where !== 'report');

    for (const rec of sorted) {
      const v = rec.values;

      // 1. Carry fields — compare saved opening to previous day's computed closing.
      for (const leaf of carryLeaves) {
        const saved = v[leaf.key];
        if (!saved || saved.trim() === '') continue;          // not saved = not edited
        const closingKey = `${leaf.key.slice(0, -2)}_c`;
        // Find the last prior record's computed closing.
        const priorList = sorted.filter((r) => baseDate(r.date) < baseDate(rec.date));
        const priorRecord = priorList[priorList.length - 1];
        if (!priorRecord) continue;                           // seed day — nothing to compare
        const expected = allComputed.get(priorRecord.date)?.[closingKey] ?? '';
        if (dp2(saved) !== dp2(expected) && dp2(expected) !== '') {
          rows.push({ date: rec.date, section: sectionOf(leaf.key), field: leaf.label, expected: dp2(expected), saved: dp2(saved) });
        }
      }

      // 2. Overridable fields with a fixed defaultVal (e.g. Sesco Rate 0.26).
      for (const leaf of PRODUCTION_LEAVES.filter((l) => l.overridable && l.defaultVal)) {
        const saved = v[leaf.key];
        if (!saved || saved.trim() === '') continue;
        if (dp2(saved) !== dp2(leaf.defaultVal)) {
          rows.push({ date: rec.date, section: sectionOf(leaf.key), field: leaf.label, expected: dp2(leaf.defaultVal), saved: dp2(saved) });
        }
      }

      // 3. om_prod_t: compare saved to ratio × trips.
      if (v.om_prod_t && v.om_prod_t.trim() !== '') {
        const autoVal = ((n2(v.om_ratio) || 3.5) * n2(v.om_prod_trips)).toFixed(2);
        if (dp2(v.om_prod_t) !== autoVal) {
          rows.push({ date: rec.date, section: 'Organic Matter', field: 'Produced (MT)', expected: autoVal, saved: dp2(v.om_prod_t) });
        }
      }

      // 4. om_ratio if saved and ≠ 3.5.
      if (v.om_ratio && v.om_ratio.trim() !== '' && dp2(v.om_ratio) !== (3.5).toFixed(2)) {
        rows.push({ date: rec.date, section: 'Organic Matter', field: 'Ratio (Trips to MT)', expected: '3.50', saved: dp2(v.om_ratio) });
      }
    }

    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }

  // EFB has no data columns — keep it in the list so it renders in position.
  const sections = PRODUCTION_SECTIONS
    .map((section) => ({ ...section, inputGroups: sectionFields(section, isSeedDay) }))
    .filter((section) => section.inputGroups.length > 0 || section.label === 'EFB (Empty Fruit Bunch)');
  // Live-computed values so read-only calculated fields (e.g. cages filled) show
  // their auto-count as the operator types the inputs they derive from.
  const computed = validDate ? calculatedProductionValues(state.production, effectiveDate, draft) : draft;

  const num = (v?: string) => { const x = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(x) ? x : 0; };
  // Valid 4-digit 24h time (HHMM): HH 00–23, MM 00–59. Used live + on save.
  const isValidTime = (v: string) => /^([01]\d|2[0-3])[0-5]\d$/.test(v);
  const hasInvalidTime = (['proc_start', 'proc_stop'] as const)
    .some((k) => (draft[k] ?? '').trim() !== '' && !isValidTime((draft[k] ?? '').trim()));

  // The opening balances that *would* be auto-carried (ignoring any manual overrides),
  // used to tell whether an edited opening still matches the actual carry.
  const carriedValues: Record<string, string> = validDate
    ? (() => {
        const rest = { ...draft };
        for (const leaf of PRODUCTION_LEAVES) if (leaf.kind === 'carry') delete rest[leaf.key];
        return calculatedProductionValues(state.production, effectiveDate, rest);
      })()
    : {};
  // Organic Matter: auto produced MT = ratio × trips (default ratio 3.5).
  const omAutoProdt = num(draft.om_prod_trips) > 0 ? ((num(draft.om_ratio) || 3.5) * num(draft.om_prod_trips)).toFixed(2) : '';

  // Average cage weight basis: 'actual' = auto-derived (ramp clears to 0); 'assumed'
  // (default) = operator keys the weight and the ramp balance is back-calculated.
  const avgActual = draft.cages_avg_mode === 'actual';

  // Total ramp balance for the Assumed basis = FFB received + opening − avg × cages filled.
  // (opening is the carried previous-day closing, taken from the computed values.)
  const totalRamp = (d: Record<string, string>): number => {
    const opening = num(computed.ffb_bal_o);
    const cagesFilled = num(d.recv_before_ster) + num(d.recv_in_ster) + num(d.recv_after_ster) + num(d.recv_tipped);
    return num(d.ffb_rec_t) + opening - num(d.cages_avg) * cagesFilled;
  };

  const handleChange = (key: string, value: string) => {
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      // Assumed basis: keying one ramp auto-fills the other (Total Ramp − keyed).
      if (next.cages_avg_mode !== 'actual' && (key === 'ffb_ramp_no1' || key === 'ffb_ramp_no2')) {
        const other = key === 'ffb_ramp_no1' ? 'ffb_ramp_no2' : 'ffb_ramp_no1';
        next[other] = (totalRamp(next) - num(value)).toFixed(2);
      }
      return next;
    });
    setDirty(true);
  };

  const handleEfbPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) { e.target.value = ''; return; }
    const oversized = files.filter((f) => f.size > 2 * 1024 * 1024);
    if (oversized.length) { alert(`Image too large: ${oversized.map((f) => f.name).join(', ')}. Max 2 MB.`); e.target.value = ''; return; }
    const notImages = files.filter((f) => !f.type.startsWith('image/'));
    if (notImages.length) { alert(`Only image files allowed: ${notImages.map((f) => f.name).join(', ')}.`); e.target.value = ''; return; }
    Promise.all(files.map((f) => new Promise<{ name: string; data: string }>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve({ name: f.name, data: r.result as string });
      r.onerror = reject;
      r.readAsDataURL(f);
    }))).then((newPhotos) => { setEfbPhotos((prev) => [...prev, ...newPhotos]); setDirty(true); });
    e.target.value = '';
  };

  // On blur, pad a manually-keyed MT figure to 2 dp if it was typed with fewer (e.g.
  // "5" → "5.00", "5.3" → "5.30"); values already at 2+ decimals are left as typed.
  const padToTwoDp = (key: string) => {
    setDraft((prev) => {
      const v = prev[key] ?? '';
      if (v === '') return prev;
      const x = Number(String(v).replace(/,/g, ''));
      if (!Number.isFinite(x)) return prev;
      if ((v.split('.')[1] || '').length >= 2) return prev;
      return { ...prev, [key]: x.toFixed(2) };
    });
  };

  const renderField = (groupLabel: string, col: ProdLeaf) => {
    const isAvg = col.key === 'cages_avg';
    const isRamp = col.key === 'ffb_ramp_no1' || col.key === 'ffb_ramp_no2';
    const isCarry = col.kind === 'carry';
    // Press running-hour field with a "Repair" checkbox; ticking it stores "R".
    const isRepair = !!col.repairToggle;
    const repaired = isRepair && (draft[col.key] ?? '') === 'R';
    // Live time-of-day check: flag a non-empty value that isn't a valid HHMM time.
    const timeInvalid = !!col.timeOfDay && (draft[col.key] ?? '').trim() !== '' && !isValidTime((draft[col.key] ?? '').trim());
    // A carried opening pre-fills with the auto-carried value but can be overwritten
    // on any day (the remark below flags whether it still matches the carry).
    const carryEditable = isCarry;
    // Auto (read-only, value from the live computation): calculated fields, the avg
    // weight + per-ramp figures when on the Actual basis, and carried openings when not editable.
    const auto = col.entryReadOnly || (isAvg && avgActual) || (isRamp && avgActual) || (isCarry && !carryEditable);
    // Overridable: a calculated field the operator may override (e.g. Organic Matter
    // produced MT). Auto-fills with the calculated value when blank; Actual/Edited remark.
    const isOverridable = !!col.overridable;
    const overridableAutoVal = isOverridable
      ? (col.key === 'om_prod_t' ? omAutoProdt : (col.defaultVal ?? ''))
      : '';
    const overridableValue = isOverridable
      ? ((draft[col.key] ?? '') !== '' ? draft[col.key]! : overridableAutoVal)
      : undefined;
    const overridableRemark = isOverridable
      ? (((draft[col.key] ?? '') === '' || num(draft[col.key]).toFixed(2) === num(overridableAutoVal).toFixed(2)) ? 'Actual' : 'Edited')
      : '';
    // Repair-flagged fields show "R" read-only until the box is unticked.
    const readOnly = (auto || repaired) ? true : (!editable || monthLocked);
    // Read-only/auto fields show the live computed value (MT figures rounded to 2 dp);
    // editable fields show what the operator typed — an editable carry pre-fills with
    // the carried value (shown until overwritten, then kept in the draft).
    const carried = displayProductionValue(col.key, computed[col.key]);
    const carriedDisplay = (carried === '0' || carried === '0.00') ? '' : carried;
    const value = auto ? carried
      : isOverridable ? overridableValue!
      : carryEditable ? ((draft[col.key] ?? '') !== '' ? draft[col.key]! : carriedDisplay)
      : (draft[col.key] ?? '');
    const label = isAvg ? `${fieldLabel(groupLabel, col)} ${avgActual ? '(Actual)' : '(Assumed)'}` : fieldLabel(groupLabel, col);
    const placeholder = isAvg ? (avgActual ? 'Auto (Actual)' : 'Enter assumed weight')
      : col.entryReadOnly ? 'Auto-calculated'
      : col.key === 'om_ratio' ? '3.5 (default)'
      : isOverridable ? 'Auto — overwrite if needed'
      : isCarry ? (isSeedDay ? 'Opening balance (initial setup)' : 'Auto-carried — overwrite if needed')
      : col.timeOfDay ? 'HHMM (24h)'
      : (isRamp && !avgActual) ? 'Key one — other auto-fills' : '';
    // Flag whether the opening is the auto-carried ("Actual") value or has been
    // overwritten ("Edited"). An override that still matches the carry to 2 dp is "Actual".
    const carryRemark = isCarry
      ? (((draft[col.key] ?? '') === '' || num(draft[col.key]).toFixed(2) === num(carriedValues[col.key]).toFixed(2)) ? 'Actual' : 'Edited')
      : '';
    // Tank columns use a tighter label+input so 3 columns fit without scrolling.
    // Any named column that isn't the simple left/right two-column layout gets
    // a tighter label+input so 3+ columns fit without horizontal scroll.
    const isTankCol = typeof col.entrySide === 'string' && col.entrySide !== 'left' && col.entrySide !== 'right';
    const gridCols = isTankCol
      ? (col.unit || col.timeOfDay ? '160px 110px auto' : '160px 110px')
      : (col.unit || col.timeOfDay ? '230px 150px auto' : undefined);
    return (
      <label key={col.key} className="prod-field" style={gridCols ? { gridTemplateColumns: gridCols } : undefined}>
        <span>{label}</span>
        <input
          value={value}
          onChange={(e) => handleChange(col.key, col.timeOfDay ? e.target.value.replace(/\D/g, '').slice(0, 4) : e.target.value)}
          onBlur={!auto && (col.unit === 'MT' || col.unit === 'mm') ? () => padToTwoDp(col.key) : undefined}
          readOnly={readOnly}
          placeholder={placeholder}
          style={timeInvalid ? { borderColor: '#dc2626', background: '#fef2f2' } : undefined}
          {...(col.timeOfDay ? { inputMode: 'numeric' as const, maxLength: 4 } : {})}
        />
        {col.timeOfDay ? (
          <span style={{ textAlign: 'left', fontSize: 12, color: timeInvalid ? '#dc2626' : 'var(--muted)' }}>
            {timeInvalid ? 'Invalid — use HHMM (0000–2359)' : '24h (HHMM)'}
          </span>
        ) : isRepair ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--muted)' }}>{col.unit}</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={repaired}
                disabled={!editable || monthLocked}
                onChange={(e) => handleChange(col.key, e.target.checked ? 'R' : '')}
              />
              Repair
            </label>
          </span>
        ) : isAvg ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--muted)' }}>{col.unit}</span>
            <select
              value={draft.cages_avg_mode || 'assumed'}
              disabled={!editable || monthLocked}
              onChange={(e) => handleChange('cages_avg_mode', e.target.value)}
            >
              <option value="assumed">Assumed</option>
              <option value="actual">Actual</option>
            </select>
          </span>
        ) : col.unit ? (
          <span style={{ textAlign: 'left', color: 'var(--muted)' }}>
            {col.unit}
            {carryRemark && (
              <strong style={{ marginLeft: 6, color: carryRemark === 'Edited' ? '#b45309' : '#15803d' }}>{carryRemark}</strong>
            )}
            {overridableRemark && (
              <strong style={{ marginLeft: 6, color: overridableRemark === 'Edited' ? '#b45309' : '#15803d' }}>{overridableRemark}</strong>
            )}
          </span>
        ) : null}
      </label>
    );
  };

  const handlePrint = () => {
    if (!validDate) return;
    const win = window.open('', '_blank');
    if (!win) return;

    const printSections = PRODUCTION_SECTIONS.map((section) => ({
      ...section,
      inputGroups: sectionFields(section, isSeedDay),
    })).filter((s) => s.inputGroups.length > 0 || s.label === 'EFB (Empty Fruit Bunch)');

    let rows = '';
    for (const section of printSections) {
      if (section.label === 'EFB (Empty Fruit Bunch)') {
        if (efbPhotos.length === 0) continue;
        rows += `<tr><td colspan="3" class="sec-hdr" style="background:${section.color}">${section.label}</td></tr>`;
        rows += `<tr><td colspan="3" style="padding:8px"><div style="display:flex;flex-wrap:wrap;gap:6px">`;
        for (const p of efbPhotos) {
          rows += `<img src="${p.data}" style="width:90px;height:90px;object-fit:cover;border-radius:4px;border:1px solid #ccc" />`;
        }
        rows += `</div></td></tr>`;
        continue;
      }
      rows += `<tr><td colspan="3" class="sec-hdr" style="background:${section.color}">${section.label}</td></tr>`;
      for (const group of section.inputGroups) {
        if (group.label) {
          rows += `<tr><td colspan="3" class="grp-hdr">${group.label}</td></tr>`;
        }
        for (const col of group.inputCols) {
          const label = fieldLabel(group.label, col);
          const val = displayProductionValue(col.key, computed[col.key]) || '—';
          const unit = col.unit ?? (col.timeOfDay ? '24h' : '');
          rows += `<tr><td class="lbl">${label}</td><td class="val">${val}</td><td class="unit">${unit}</td></tr>`;
        }
      }
    }

    const title = `Daily Production Entry — ${effectiveDate}`;
    const adjNote = lastDayKind === 'adj' ? ' &nbsp;<span style="color:#b45309">(Adjustment)</span>' : '';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:11px;margin:20px;color:#000}
  h2{font-size:15px;margin:0 0 2px}
  .sub{font-size:12px;margin:0 0 14px;color:#444}
  table{width:100%;border-collapse:collapse}
  td{padding:3px 7px;border:1px solid #d0d0d0;vertical-align:top}
  .sec-hdr{font-weight:700;font-size:12px;padding:5px 7px;border-top:2px solid #999}
  .grp-hdr{background:#f5f5f5;font-weight:600;color:#555;padding:3px 10px}
  .lbl{width:55%;color:#333}
  .val{width:20%;font-weight:700;text-align:right}
  .unit{width:25%;color:#777;padding-left:5px}
  .footer{margin-top:18px;font-size:9px;color:#999}
  @media print{body{margin:8px}button{display:none}}
</style></head><body>
<h2>Daily Production Report Data Entry</h2>
<p class="sub">Date: <strong>${effectiveDate}</strong>${adjNote}</p>
<table>${rows}</table>
<div class="footer">Printed on ${new Date().toLocaleString()}</div>
</body></html>`;

    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  };

  const handleMonthPrint = (ym: string) => {
    if (!/^\d{4}-\d{2}$/.test(ym)) return;
    const win = window.open('', '_blank');
    if (!win) return;

    const [yr, mo] = ym.split('-').map(Number);
    const daysInMonth = new Date(yr, mo, 0).getDate();
    const regularDays = Array.from({ length: daysInMonth }, (_, i) =>
      `${ym}-${String(i + 1).padStart(2, '0')}`,
    );
    const adjDays = state.production
      .filter((r) => r.date.startsWith(ym) && r.date.endsWith(ADJ_SUFFIX))
      .map((r) => r.date)
      .sort();
    const allDays = [...regularDays, ...adjDays];

    const dayValues = new Map<string, Record<string, string>>();
    for (const day of allDays) {
      const rec = state.production.find((r) => r.date === day);
      if (rec) dayValues.set(day, calculatedProductionValues(state.production, day, rec.values));
    }

    const printSections = PRODUCTION_SECTIONS
      .filter((s) => s.label !== 'EFB (Empty Fruit Bunch)')
      .map((section) => ({ ...section, inputGroups: sectionFields(section, true) }))
      .filter((s) => s.inputGroups.length > 0);

    const colCount = allDays.length + 1;
    let tableRows = `<tr class="hdr-row"><th class="lbl-col">Field</th>${allDays.map((d) => {
      const n = d.endsWith(ADJ_SUFFIX) ? `${Number(d.slice(8, 10))}<br><small>adj</small>` : String(Number(d.slice(8)));
      return `<th class="day-col">${n}</th>`;
    }).join('')}</tr>`;

    for (const section of printSections) {
      tableRows += `<tr><td colspan="${colCount}" class="sec-hdr" style="background:${section.color}">${section.label}</td></tr>`;
      for (const group of section.inputGroups) {
        for (const col of group.inputCols) {
          const label = fieldLabel(group.label, col);
          const unit = col.unit ? ` (${col.unit})` : col.timeOfDay ? ' (24h)' : '';
          tableRows += `<tr><td class="lbl-col">${label}${unit ? `<span class="unit">${unit}</span>` : ''}</td>${
            allDays.map((d) => {
              const vals = dayValues.get(d);
              const val = vals ? displayProductionValue(col.key, vals[col.key]) : '';
              return `<td class="day-col val-cell">${val || ''}</td>`;
            }).join('')
          }</tr>`;
        }
      }
    }

    const monthName = new Date(yr, mo - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Daily Production Entry — ${monthName}</title>
<style>
@page{size:A4 landscape;margin:7mm}
body{font-family:Arial,sans-serif;font-size:7.5px;margin:0;color:#000}
h2{font-size:12px;margin:0 0 5px}
table{width:100%;border-collapse:collapse;table-layout:fixed}
th,td{border:1px solid #ccc;padding:2px 3px;overflow:hidden;word-break:break-word}
.hdr-row th{background:#f0f0f0;font-weight:700;text-align:center}
.lbl-col{width:145px;text-align:left}
.day-col{text-align:center}
.val-cell{text-align:right}
.sec-hdr{font-weight:700;font-size:8.5px;padding:3px 5px;border-top:2px solid #aaa}
.unit{color:#888;font-size:6.5px}
.footer{margin-top:8px;font-size:7px;color:#999}
</style>
</head><body>
<h2>Daily Production Entry — ${monthName}</h2>
<table>${tableRows}</table>
<div class="footer">Printed on ${new Date().toLocaleString()}</div>
</body></html>`;

    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  const handleSave = () => {
    if (!validDate) return;
    if (isFutureDate) {
      window.alert(`Production can only be entered up to ${maxDate} (yesterday). Today and future dates are not allowed.`);
      return;
    }
    if (monthLocked) {
      window.alert('This month is locked for editing (past data locks on the 16th of the following month). Ask an administrator with bypass permission to make changes.');
      return;
    }
    if (needsKind) {
      window.alert('Please choose “Month End (before adjustment)” or “Month-end adjustment” first.');
      return;
    }
    // Process Start/Stop must be a valid 4-digit 24h time (HHMM), e.g. 0830, 2359.
    for (const [key, label] of [['proc_start', 'Process Starts'], ['proc_stop', 'Process Stop']] as const) {
      const v = (draft[key] ?? '').trim();
      if (v !== '' && !isValidTime(v)) {
        window.alert(`${label} must be a valid 24-hour time as 4 digits (HHMM), e.g. 0830 or 2359.`);
        return;
      }
    }
    // On the Assumed basis the un-keyed ramp is back-calculated; a negative split means
    // the figures don't reconcile, so block the save.
    if (!avgActual && (num(draft.ffb_ramp_no1) < 0 || num(draft.ffb_ramp_no2) < 0)) {
      window.alert('Ramp 1 / Ramp 2 balance cannot be negative. Adjust FFB received, opening balance, or average cage weight so the ramp split is valid.');
      return;
    }
    setState((prev) => {
      const current = prev.production.find((record) => record.date === effectiveDate);
      const values = Object.fromEntries(
        Object.entries(draft).filter(([key, value]) => PRODUCTION_MANUAL_KEYS.has(key) && value.trim() !== ''),
      );
      // Persist the avg-weight basis (not a numeric leaf, so saved explicitly).
      if (draft.cages_avg_mode) values.cages_avg_mode = draft.cages_avg_mode;
      const nextRecord = {
        id: current?.id ?? nextId(prev.production),
        date: effectiveDate,
        values,
        efbPhotos,
      };
      const valueCount = Object.keys(values).length + efbPhotos.length;

      const next = {
        ...prev,
        production: [
          ...prev.production.filter((record) => record.date !== effectiveDate),
          ...(valueCount ? [nextRecord] : []),
        ].sort((a, b) => a.date.localeCompare(b.date)),
      };

      if (!current && !valueCount) return next;

      return appendAudit(next, currentUser, 'Daily Production Report Data Entry', valueCount ? (current ? 'Edit' : 'Create') : 'Delete', {
        recordRef: effectiveDate,
        recordId: current?.id ?? nextRecord.id,
        details: valueCount ? `${valueCount} field(s)` : 'Cleared production entry',
      });
    });
    setDirty(false);
    setSheetStatus('pushing');
    setSheetError('');
    pushProductionToSheet(effectiveDate, computed)
      .then(() => setSheetStatus('ok'))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('Google Sheets push failed:', msg);
        setSheetStatus('error');
        setSheetError(msg);
      });
  };

  return (
    <article className="panel">
      <div className="panel-header">
        <h3>Daily Production Report Data Entry</h3>
      </div>

      <div className="listing-actions" style={{ padding: '12px 16px 0' }}>
        <button className="btn" type="button" onClick={() => navigate('/process')}>Back</button>
        <button className="btn primary" type="button" onClick={() => navigate('/process/production-report')}>Production Report</button>
        <button className="btn primary" type="button" onClick={() => setShowHistory(true)}>Edit History</button>
        <button className="btn" type="button" onClick={handlePrint} disabled={!validDate || needsKind}>Print Day</button>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="month" value={monthPrintYM} onChange={(e) => setMonthPrintYM(e.target.value)} style={{ padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 4, fontSize: 13 }} />
          <button className="btn" type="button" onClick={() => handleMonthPrint(monthPrintYM)} disabled={!monthPrintYM}>Print Month</button>
        </span>
      </div>

      {showHistory && (() => {
        const histRows = buildEditHistory();
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setShowHistory(false)}>
            <div style={{ background: '#fff', borderRadius: 10, width: '90%', maxWidth: 760, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
              onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>Edit History — manually overridden values</strong>
                <button className="btn" type="button" onClick={() => setShowHistory(false)}>Close</button>
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {histRows.length === 0 ? (
                  <p style={{ padding: '20px', color: 'var(--muted)', textAlign: 'center' }}>No manual overrides found. All saved values match their auto-carry or defaults.</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                        {['Date', 'Section', 'Field', 'Expected (Auto)', 'Saved (Edited)'].map((h) => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--line)', fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {histRows.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--line)', background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                          <td style={{ padding: '7px 12px', fontWeight: 600 }}>{r.date}</td>
                          <td style={{ padding: '7px 12px', color: 'var(--muted)' }}>{r.section}</td>
                          <td style={{ padding: '7px 12px' }}>{r.field}</td>
                          <td style={{ padding: '7px 12px', color: '#15803d' }}>{r.expected}</td>
                          <td style={{ padding: '7px 12px', color: '#b45309', fontWeight: 600 }}>{r.saved}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      <div className="listing-controls" style={{ padding: '12px 16px 0', alignItems: 'center' }}>
        <label className="entries-control">
          Date&nbsp;
          <input type="date" value={date} max={maxDate} onChange={(e) => setDate(e.target.value)} />
        </label>
        {isLastDay && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, color: lastDayKind === 'before' ? '#b45309' : undefined }}>
              <input type="checkbox" checked={lastDayKind === 'before'} onChange={() => pickKind('before')} style={{ width: 'auto', minHeight: 0 }} />
              Month End (before adjustment)
            </label>
            <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, color: lastDayKind === 'adj' ? '#b45309' : undefined }}>
              <input type="checkbox" checked={lastDayKind === 'adj'} onChange={() => pickKind('adj')} style={{ width: 'auto', minHeight: 0 }} />
              Month-end adjustment ({date.slice(8, 10)}-adj)
            </label>
          </div>
        )}
        <button className="btn primary" type="button" onClick={handleSave} disabled={!validDate || !editable || isFutureDate || monthLocked || hasInvalidTime} style={{ marginLeft: 'auto' }}>
          Save
        </button>
        {sheetStatus === 'pushing' && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Syncing to Google Sheets…</span>}
        {sheetStatus === 'ok'      && <span style={{ fontSize: 12, color: 'var(--green)' }}>Google Sheets updated</span>}
        {sheetStatus === 'error'   && <span style={{ fontSize: 12, color: 'var(--red)' }} title={sheetError}>Google Sheets failed — check console</span>}
        {isFutureDate && (
          <span style={{ color: '#b91c1c', fontWeight: 700 }}>
            Only dates up to {maxDate} (yesterday) can be keyed in.
          </span>
        )}
        {monthLocked && (
          <span style={{ color: '#b91c1c', fontWeight: 700 }}>
            Locked — this month can no longer be edited (past data locks on the 16th of the following month).
          </span>
        )}
        {needsKind && (
          <span style={{ color: dirty ? '#b91c1c' : '#b45309', fontWeight: 700 }}>
            {dirty
              ? 'Which entry is this? Tick “Month End (before adjustment)” or “Month-end adjustment” before saving.'
              : 'Select which month-end entry to edit.'}
          </span>
        )}
        {isLastDay && lastDayKind !== 'none' && (
          <span style={{ color: '#b45309', fontWeight: 600 }}>
            Editing {lastDayKind === 'adj' ? 'adjustment' : 'before-adjustment'} entry
          </span>
        )}

        {dirty && <span style={{ color: 'var(--muted)' }}>Unsaved changes</span>}
      </div>

      <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
        {sections.map((section) => (
          <section key={section.label} style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ background: section.color, padding: '8px 14px', fontWeight: 700 }}>
              {section.label}
            </div>

            {section.label === 'EFB (Empty Fruit Bunch)' ? (
              <div style={{ padding: '12px 16px' }}>
                {efbPhotos.length === 0 ? (
                  <p style={{ color: 'var(--muted)', margin: '0 0 10px' }}>No photos attached.</p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                    {efbPhotos.map((p, i) => (
                      <div key={i} style={{ position: 'relative', width: 90, height: 90 }}>
                        <img src={p.data} alt={p.name} style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line)' }} />
                        {editable && !monthLocked && (
                          <button type="button"
                            style={{ position: 'absolute', top: 2, right: 2, background: '#dc2626', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', fontSize: 12, lineHeight: '20px', padding: 0 }}
                            onClick={() => { setEfbPhotos((prev) => prev.filter((_, j) => j !== i)); setDirty(true); }}
                            title="Remove photo">×</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {editable && !monthLocked && (
                  <label style={{ cursor: 'pointer' }}>
                    <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleEfbPhotoUpload} />
                    <span className="btn" style={{ display: 'inline-block' }}>+ Upload Photos</span>
                  </label>
                )}
              </div>
            ) : section.inputGroups.some((g) => g.inputCols.some((c) => c.entrySide)) ? (
              // Multi-column layout: one column per distinct `entrySide`, in first-seen order.
              (() => {
                // Columns: one per distinct `entrySide` (in first-seen order).
                const order: string[] = [];
                section.inputGroups.forEach((g) => g.inputCols.forEach((c) => {
                  if (c.entrySide && !order.includes(c.entrySide)) order.push(c.entrySide);
                }));
                // Leaves without an `entrySide` render left-to-right in a row beneath.
                const flatCols = section.inputGroups.flatMap((group) =>
                  group.inputCols.filter((col) => !col.entrySide).map((col) => renderField(group.label, col)),
                );
                return (
                  <>
                    <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', padding: '12px 16px' }}>
                      {order.map((side) => {
                        const cols = section.inputGroups.flatMap((group) =>
                          group.inputCols
                            .filter((col) => col.entrySide === side)
                            .map((col) => renderField(group.label, col)),
                        );
                        return cols.length ? (
                          <div key={side} style={{ display: 'grid', gap: 6, alignContent: 'start' }}>{cols}</div>
                        ) : null;
                      })}
                    </div>
                    {flatCols.length > 0 && (
                      <div style={{ display: 'grid', gap: 6, padding: '12px 16px', borderTop: '1px solid var(--line)' }}>
                        {flatCols}
                      </div>
                    )}
                  </>
                );
              })()
            ) : (
              <div className="form-grid prod-grid" style={{ padding: '12px 16px' }}>
                {section.inputGroups.flatMap((group) =>
                  group.inputCols.map((col) => renderField(group.label, col)),
                )}
              </div>
            )}
          </section>
        ))}


      </div>
    </article>
  );
}
