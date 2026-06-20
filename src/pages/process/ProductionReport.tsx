import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { canAccessProcess, hasPerm } from '../../utils/permissions';
import { NoPermission } from '../../components/NoPermission';
import { REPORT_SECTIONS, sectionLeafCount, ADJ_SUFFIX, baseDate, displayProductionValue } from './productionColumns';
import { calculatedProductionValues } from './productionCalculations';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Today as YYYY-MM-DD. Production may only be keyed in for days that are over,
// so any cell whose date is today or later is locked (read-only).
function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Mix a hex color toward white by `ratio` (0 = original, 1 = white). */
function tint(hex: string, ratio: number): string {
  const h = hex.replace('#', '');
  const c = (i: number) => parseInt(h.slice(i, i + 2), 16);
  const mix = (v: number) => Math.round(v + (255 - v) * ratio);
  return `rgb(${mix(c(0))}, ${mix(c(2))}, ${mix(c(4))})`;
}

const HROW1 = 28;           // Tier 1 height (section banner — short names)
const HROW2 = 56;           // Tier 2 height (group headers — allow 2-3 line wrap)
const HROW3 = 84;           // Tier 3 height (leaf headers — longest text, wraps most)
const HROW  = HROW1;        // kept for Day rowSpan compat
const HEAD_BG = '#f8fafc';  // header background (must be opaque to cover scrolled cells)

export default function ProductionReport() {
  const { state } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [month, setMonth] = useState<string>(currentMonth());
  const boxRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [boxH, setBoxH] = useState<number>();
  const [exporting, setExporting] = useState(false);
  const todayStr = todayYmd();

  // This month's records keyed by full date string (so the last-day `-adj`
  // record sits alongside its plain day without colliding on day-of-month).
  const byDate = useMemo(() => {
    const map = new Map<string, Record<string, string>>();
    for (const r of state.production) {
      if (r.date.slice(0, 7) === month) map.set(r.date, r.values);
    }
    return map;
  }, [state.production, month]);

  // Flat list of body cells, each carrying its section's tint + a divider flag
  // on the first column of each section (mirrors the header dividers).
  const leafCells = useMemo(
    () => REPORT_SECTIONS.flatMap((s) =>
      s.groups.flatMap((g, gi) =>
        g.cols.map((c, ci) => ({
          key: c.key,
          kind: c.kind ?? 'manual',
          bg: tint(s.color, 0.55),
          first: gi === 0 && ci === 0,   // section boundary → thick border
          groupFirst: ci === 0,           // group boundary → medium border
        })),
      ),
    ),
    [],
  );

  // Size the scroll box so its bottom sits exactly at the viewport bottom. Then
  // vertical scrolling happens *inside* the box and the horizontal scrollbar
  // stays pinned to the bottom of the screen no matter how the page scrolls.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const top = el.getBoundingClientRect().top;
      setBoxH(Math.max(220, window.innerHeight - top - 12));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  async function exportPDF() {
    if (!tableRef.current || !boxRef.current) return;
    setExporting(true);

    const box = boxRef.current;
    const table = tableRef.current;

    // Save the styles we temporarily override, plus the original inline styles of
    // every sticky cell, so we can restore the live DOM afterwards.
    const prevBox = { height: box.style.height, maxHeight: box.style.maxHeight, overflow: box.style.overflow };
    const stuck: { el: HTMLElement; position: string; top: string; left: string; zIndex: string }[] = [];

    try {
      const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ]);

      // Capture the REAL table in place rather than an off-screen clone.
      // html2canvas renders from each element's *computed* style; the on-screen
      // table is already laid out correctly (colgroup widths applied, 110px
      // columns), whereas a detached clone's colgroup widths don't reliably
      // apply, so its columns collapse, text wraps, row heights explode and the
      // capture becomes a tall thin ribbon. So: expand the scroll box to its full
      // natural size and neutralise sticky cells, capture, then restore.
      box.style.height = 'auto';
      box.style.maxHeight = 'none';
      box.style.overflow = 'visible';

      // Un-sticky every sticky cell so it sits at its natural position instead of
      // following the (now irrelevant) scroll offset during capture.
      table.querySelectorAll<HTMLElement>('[style*="sticky"]').forEach(el => {
        stuck.push({ el, position: el.style.position, top: el.style.top, left: el.style.left, zIndex: el.style.zIndex });
        el.style.position = 'static';
        el.style.top = 'auto';
        el.style.left = 'auto';
        el.style.zIndex = 'auto';
      });

      await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

      const fullW = table.scrollWidth;
      const fullH = table.scrollHeight;
      const SCALE = 2; // render at 2x for crisp text

      const canvas = await html2canvas(table, {
        scale: SCALE,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: fullW,
        height: fullH,
        windowWidth: fullW,
        windowHeight: fullH,
        scrollX: 0,
        scrollY: 0,
      });

      // ── Tile the (correct, very wide) capture across A4 landscape pages ──
      // The table is ~109 columns wide, far too wide for one readable page. So
      // we slice the canvas into page-sized tiles and, like a spreadsheet print,
      // REPEAT the frozen "Day" column on every horizontal page and REPEAT the
      // 3-row header band on every vertical page.
      //
      // Measure the frozen-column width and header-band height from the live
      // (still-expanded) table, then derive per-column / per-row canvas sizes by
      // dividing the remaining canvas evenly — this tiles the canvas exactly with
      // no cumulative rounding drift or seams.
      const headEl = table.querySelector('thead') as HTMLElement;
      const dayThEl = table.querySelector('thead th') as HTMLElement; // Day cell (rowSpan 3)
      const headRows = table.querySelectorAll('thead tr');
      const leafRow = headRows[headRows.length - 1];          // tier-3 = one th per data column
      const bodyRows = table.querySelectorAll('tbody tr');
      const totalCols = leafRow.children.length;
      const totalRows = bodyRows.length;

      const dayCW = dayThEl.getBoundingClientRect().width * SCALE;
      const headCH = headEl.getBoundingClientRect().height * SCALE;
      const colCW = (canvas.width - dayCW) / totalCols;       // even per-column width
      const rowCH = (canvas.height - headCH) / totalRows;     // even per-row height

      // canvas px → PDF pt: natural size is 1 CSS px ≈ 0.75pt and the canvas is
      // SCALE× the CSS size.
      const PTPC = 0.75 / SCALE;
      const MARGIN = 18;
      const TITLE_H = 26;

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageWpt = pdf.internal.pageSize.getWidth();
      const pageHpt = pdf.internal.pageSize.getHeight();

      // Usable content area in canvas px (what fits on one page after margins +
      // the per-page title), with the repeated Day column / header band removed.
      const availWcanvas = (pageWpt - MARGIN * 2) / PTPC;
      const availHcanvas = (pageHpt - MARGIN * 2 - TITLE_H) / PTPC;
      const colsPerPage = Math.max(1, Math.floor((availWcanvas - dayCW) / colCW));
      const rowsPerBand = Math.max(1, Math.floor((availHcanvas - headCH) / rowCH));

      const hPages = Math.ceil(totalCols / colsPerPage);
      const vBands = Math.ceil(totalRows / rowsPerBand);
      const totalPages = hPages * vBands;

      const tile = document.createElement('canvas');
      const tctx = tile.getContext('2d')!;
      let pageNo = 0;

      for (let b = 0; b < vBands; b++) {
        const rowStart = b * rowsPerBand;
        const rowCount = Math.min(rowsPerBand, totalRows - rowStart);
        const srcRowY = headCH + rowStart * rowCH;
        const bodyCH = rowCount * rowCH;

        for (let h = 0; h < hPages; h++) {
          const colStart = h * colsPerPage;
          const colCount = Math.min(colsPerPage, totalCols - colStart);
          const srcColX = dayCW + colStart * colCW;
          const dataCW = colCount * colCW;

          const contentW = dayCW + dataCW;
          const contentH = headCH + bodyCH;

          // Compose the page tile: [Day-header corner | column headers]
          //                        [Day column body   | body slice    ]
          tile.width = Math.ceil(contentW);
          tile.height = Math.ceil(contentH);
          tctx.fillStyle = '#ffffff';
          tctx.fillRect(0, 0, tile.width, tile.height);
          // 1. frozen Day header corner
          tctx.drawImage(canvas, 0, 0, dayCW, headCH, 0, 0, dayCW, headCH);
          // 2. repeated column headers for this page's columns
          tctx.drawImage(canvas, srcColX, 0, dataCW, headCH, dayCW, 0, dataCW, headCH);
          // 3. repeated frozen Day column for this band's rows
          tctx.drawImage(canvas, 0, srcRowY, dayCW, bodyCH, 0, headCH, dayCW, bodyCH);
          // 4. the body slice
          tctx.drawImage(canvas, srcColX, srcRowY, dataCW, bodyCH, dayCW, headCH, dataCW, bodyCH);

          if (pageNo > 0) pdf.addPage('a4', 'landscape');
          pageNo++;

          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(11);
          pdf.setTextColor('#000000');
          pdf.text(`Daily Production Report — ${monthLabel}`, MARGIN, MARGIN + 8);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(7.5);
          pdf.setTextColor('#666666');
          pdf.text(
            `Cols ${colStart + 1}–${colStart + colCount} of ${totalCols}   ·   ` +
            `Rows ${rowStart + 1}–${rowStart + rowCount} of ${totalRows}   ·   ` +
            `Page ${pageNo} / ${totalPages}   ·   Generated ${new Date().toLocaleString()}`,
            MARGIN, MARGIN + 18,
          );
          pdf.setTextColor('#000000');

          pdf.addImage(
            tile.toDataURL('image/jpeg', 0.9), 'JPEG',
            MARGIN, MARGIN + TITLE_H, contentW * PTPC, contentH * PTPC,
          );
        }
      }

      pdf.save(`Production_Report_${month}.pdf`);
    } finally {
      // Restore the live DOM: re-stick the sticky cells and put the scroll box
      // back to its clipped/fixed-height on-screen form.
      stuck.forEach(s => {
        s.el.style.position = s.position;
        s.el.style.top = s.top;
        s.el.style.left = s.left;
        s.el.style.zIndex = s.zIndex;
      });
      box.style.height = prevBox.height;
      box.style.maxHeight = prevBox.maxHeight;
      box.style.overflow = prevBox.overflow;
      setExporting(false);
    }
  }

  if (!canAccessProcess(currentUser) || !hasPerm(currentUser, 'viewProductionReport')) return <NoPermission backPath="/process" />;

  const validMonth = /^\d{4}-\d{2}$/.test(month);
  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = validMonth ? new Date(year, mon, 0).getDate() : 0;
  const monthLabel = validMonth
    ? new Date(year, mon - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : 'Select a month';

  // Report rows: one per calendar day, plus a trailing `-adj` adjustment row on
  // the last day of the month (keyed in like any other day, shown as the very
  // last row e.g. "30-adj").
  const lastDay = String(daysInMonth).padStart(2, '0');
  const rows = [
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const dd = String(i + 1).padStart(2, '0');
      return { date: `${month}-${dd}`, label: dd, adj: false };
    }),
    ...(daysInMonth > 0
      ? [{ date: `${month}-${lastDay}${ADJ_SUFFIX}`, label: `${lastDay}-adj`, adj: true }]
      : []),
  ];

  return (
    <article className="panel">
      <div className="panel-header">
        <h3>Daily Production Report</h3>
      </div>

      <div className="listing-actions" style={{ padding: '12px 16px 0' }}>
        <button className="btn" onClick={() => navigate('/process')}>Back</button>
        <button className="btn primary" type="button" onClick={() => navigate('/process/production-entry')}>Daily Entry</button>
        <button className="btn" type="button" onClick={exportPDF} disabled={exporting}>
          {exporting ? 'Exporting…' : 'Save as PDF'}
        </button>
      </div>

      <div className="listing-controls" style={{ padding: '12px 16px 0', alignItems: 'center' }}>
        <label className="entries-control">
          Month&nbsp;
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <span style={{ color: 'var(--muted)' }}>View only</span>
        <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{monthLabel}</span>
      </div>

      {/* Scroll box sized to fill down to the viewport bottom: the horizontal
          scrollbar stays on-screen at the bottom and the sticky header/Day column
          stay frozen, so there's never a need to scroll the page to reach them. */}
      <div
        className="table-wrap"
        ref={boxRef}
        style={{ marginTop: 12, height: boxH, overflow: 'auto' }}
      >
        <table ref={tableRef} className="listing-table" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 40 }} />
            {leafCells.map((c) => <col key={c.key} style={{ width: 110 }} />)}
          </colgroup>
          <thead>
            {/* Tier 1 — section banners */}
            <tr>
              <th rowSpan={3} style={{ position: 'sticky', top: 0, left: 0, zIndex: 5, background: HEAD_BG }}>Day</th>
              {REPORT_SECTIONS.map((s) => (
                <th key={s.label} colSpan={sectionLeafCount(s)}
                    style={{ position: 'sticky', top: 0, zIndex: 3, background: s.color, height: HROW1, padding: '2px 8px', textAlign: 'center', borderLeft: '2px solid #94a3b8', fontWeight: 700 }}>
                  {s.label}
                </th>
              ))}
            </tr>
            {/* Tier 2 — group headers */}
            <tr>
              {REPORT_SECTIONS.flatMap((s) =>
                s.groups.map((g, gi) => (
                  <th key={`${s.label}-${g.label}-${gi}`} colSpan={g.cols.length}
                      style={{ position: 'sticky', top: HROW1, zIndex: 3, background: s.color, height: HROW2, padding: '2px 4px', textAlign: 'center', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3, borderLeft: gi === 0 ? '2px solid #94a3b8' : '1px solid #94a3b8' }}>
                    {g.label}
                  </th>
                )),
              )}
            </tr>
            {/* Tier 3 — daily leaf columns */}
            <tr>
              {REPORT_SECTIONS.flatMap((s) =>
                s.groups.flatMap((g, gi) =>
                  g.cols.map((c, ci) => (
                    <th key={c.key}
                        style={{ position: 'sticky', top: HROW1 + HROW2, zIndex: 3, background: s.color, width: 110, minWidth: 110, maxWidth: 110, height: HROW3, padding: '2px 4px', textAlign: 'center', fontSize: 11, fontWeight: 500, whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3, borderLeft: gi === 0 && ci === 0 ? '2px solid #94a3b8' : '1px solid #94a3b8' }}>
                      {c.label}
                    </th>
                  )),
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const raw = byDate.get(row.date) ?? {};
              // Only show figures (including month/year-to-date and carried-forward
              // readings) once a day has actual keyed-in data. Days not yet entered
              // — e.g. dates still to come — stay entirely blank.
              const hasData = Object.values(raw).some((v) => v != null && String(v).trim() !== '');
              const displayValues = hasData ? calculatedProductionValues(state.production, row.date, raw) : {};
              // Report is view-only; today/future days are simply blank (not yet keyed in),
              // shown greyed for clarity. No editing happens here — entry is on the Daily
              // Production Entry page.
              const future = baseDate(row.date) >= todayStr;
              const dayBg = row.adj ? '#fff7ed' : '#fff';
              return (
                <tr key={row.date}>
                  <td style={{ position: 'sticky', left: 0, zIndex: 1, background: dayBg, fontWeight: 600, fontStyle: row.adj ? 'italic' : undefined, color: future ? '#94a3b8' : undefined }}>
                    {row.label}
                  </td>
                  {leafCells.map((cell) => (
                    <td key={cell.key}
                        style={{ textAlign: 'right', fontSize: 12, background: cell.bg, borderLeft: cell.first ? '2px solid #94a3b8' : '1px solid #94a3b8', padding: 2 }}>
                      <span style={{ display: 'inline-block', width: '100%', padding: '3px 4px', color: '#334155' }}>
                        {displayProductionValue(cell.key, displayValues[cell.key]) || '-'}
                      </span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </article>
  );
}
