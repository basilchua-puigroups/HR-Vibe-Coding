import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NoPermission } from '../../components/NoPermission';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { formatNumber, money, today } from '../../utils/format';
import { hasPerm } from '../../utils/permissions';

type ReportView = 'menu' | 'stock-listing' | 'issue-out-record';
type StockSort = 'stock-id' | 'cost-asc' | 'cost-desc' | 'activity-asc' | 'activity-desc';

type GeneratedRange = {
  from: string;
  to: string;
};

function layerUnitCost(unitPrice: number, sstPercent: number): number {
  return Number(unitPrice || 0) + Number(unitPrice || 0) * Number(sstPercent || 0) / 100;
}

function firstDayOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export default function InventoryReports() {
  const { state } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<ReportView>('menu');
  const [reportDate, setReportDate] = useState(today());
  const [hideZero, setHideZero] = useState(false);
  const [stockSort, setStockSort] = useState<StockSort>('stock-id');
  const [generatedDate, setGeneratedDate] = useState<string | null>(null);
  const [issueFromDate, setIssueFromDate] = useState(firstDayOfMonth(today()));
  const [issueToDate, setIssueToDate] = useState(today());
  const [issueStation, setIssueStation] = useState('all');
  const [generatedIssueRange, setGeneratedIssueRange] = useState<GeneratedRange | null>(null);
  const canViewReports = hasPerm(currentUser, 'viewInventoryReports');
  const canViewStockListing = hasPerm(currentUser, 'viewStockListingReport');
  const canViewIssueOutRecord = hasPerm(currentUser, 'viewIssueOutRecordReport');

  if (!canViewReports) return <NoPermission backPath="/inventory" />;
  if (view === 'stock-listing' && !canViewStockListing) {
    return <NoPermission backPath="/inventory" message="You don't have permission to view the Stock Listing report." />;
  }
  if (view === 'issue-out-record' && !canViewIssueOutRecord) {
    return <NoPermission backPath="/inventory" message="You don't have permission to view the Issue Out Record report." />;
  }

  function generateStockListing() {
    if (!reportDate) {
      alert('Please select a report date.');
      return;
    }
    setGeneratedDate(reportDate);
  }

  function generateIssueOutRecord() {
    if (!issueFromDate || !issueToDate) {
      alert('Please select From Date and To Date.');
      return;
    }
    if (issueFromDate > issueToDate) {
      alert('From Date cannot be later than To Date.');
      return;
    }
    setGeneratedIssueRange({ from: issueFromDate, to: issueToDate });
  }

  const partName = (id: number) => state.inventory.find((item) => item.id === id)?.item ?? '-';

  const stockRows = generatedDate
    ? state.inventory.map((item) => {
        const itemLayers = (state.stockLayers ?? []).filter((layer) => layer.itemId === item.id);
        const currentLayerQty = itemLayers.reduce((sum, layer) => sum + Number(layer.quantityRemaining || 0), 0);
        const openingFallbackQty = Math.max(0, Number(item.quantity || 0) - currentLayerQty);
        const openingFallbackValue = 0;

        const datedLayers = itemLayers.filter((layer) => (layer.receivedDate || '') <= generatedDate);
        const fifoQty = datedLayers.reduce((sum, layer) => {
          const consumedToDate = (state.stockLayerConsumptions ?? [])
            .filter((c) => c.layerId === layer.id && (c.issueDate || '') <= generatedDate)
            .reduce((s, c) => s + Number(c.quantity || 0), 0);
          return sum + Math.max(0, Number(layer.quantityReceived || 0) - consumedToDate);
        }, 0);
        const fifoValue = datedLayers.reduce((sum, layer) => {
          const consumedToDate = (state.stockLayerConsumptions ?? [])
            .filter((c) => c.layerId === layer.id && (c.issueDate || '') <= generatedDate)
            .reduce((s, c) => s + Number(c.quantity || 0), 0);
          const remaining = Math.max(0, Number(layer.quantityReceived || 0) - consumedToDate);
          return sum + remaining * layerUnitCost(Number(layer.unitPrice || 0), Number(layer.sstPercent || 0));
        }, 0);

        const quantity = openingFallbackQty + fifoQty;
        const value = openingFallbackValue + fifoValue;
        const lastActivity = (state.movements ?? [])
          .filter((movement) => movement.itemId === item.id && (movement.date || '') <= generatedDate)
          .map((movement) => movement.date || '')
          .sort((a, b) => b.localeCompare(a))[0] ?? '';
        return {
          id: item.id,
          stockId: item.stockId || String(item.id),
          item: item.item,
          category: item.category,
          location: item.location,
          quantity,
          unit: item.unit,
          reorder: Number(item.reorder || 0),
          value,
          avgCost: quantity > 0 ? value / quantity : 0,
          lastActivity,
          hasOpeningFallback: openingFallbackQty > 0,
        };
      })
      .filter((row) => !hideZero || row.value > 0)
      .sort((a, b) => {
        if (stockSort === 'cost-asc') return a.value - b.value || a.stockId.localeCompare(b.stockId, undefined, { numeric: true });
        if (stockSort === 'cost-desc') return b.value - a.value || a.stockId.localeCompare(b.stockId, undefined, { numeric: true });
        if (stockSort === 'activity-asc') return (a.lastActivity || '9999-12-31').localeCompare(b.lastActivity || '9999-12-31') || a.stockId.localeCompare(b.stockId, undefined, { numeric: true });
        if (stockSort === 'activity-desc') return (b.lastActivity || '').localeCompare(a.lastActivity || '') || a.stockId.localeCompare(b.stockId, undefined, { numeric: true });
        return a.stockId.localeCompare(b.stockId, undefined, { numeric: true });
      })
    : [];

  const totalQty = stockRows.reduce((sum, row) => sum + row.quantity, 0);
  const totalValue = stockRows.reduce((sum, row) => sum + row.value, 0);
  const lowStockCount = stockRows.filter((row) => row.reorder > 0 && row.quantity <= row.reorder).length;
  const openingFallbackCount = stockRows.filter((row) => row.hasOpeningFallback).length;

  const issueRows = generatedIssueRange
    ? state.issueOuts
        .filter((issue) => {
          const date = issue.createdAt || '';
          return date >= generatedIssueRange.from && date <= generatedIssueRange.to;
        })
        .flatMap((issue) =>
          (issue.items ?? []).map((item, idx) => ({
            key: `${issue.id}-${idx}`,
            issueNo: issue.issueNo,
            date: issue.createdAt || '',
            issuedTo: issue.issuedTo || '-',
            station: item.station || '-',
            equipment: item.equipment || '-',
            item: item.description || partName(item.itemId),
            quantity: Number(item.quantity || 0),
            unit: item.unit || '',
            purpose: item.purpose || '',
            status: issue.status || 'Pending',
            approvedBy: issue.approvedBy || '',
          })),
        )
        .filter((row) => issueStation === 'all' || row.station === issueStation)
        .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (a.issueNo || '').localeCompare(b.issueNo || '', undefined, { numeric: true }))
    : [];

  const issueRecordCount = new Set(issueRows.map((row) => row.issueNo)).size;
  const issueQtyTotal = issueRows.reduce((sum, row) => sum + row.quantity, 0);
  const issueStationCount = new Set(issueRows.map((row) => row.station).filter((station) => station && station !== '-')).size;

  if (view === 'menu') {
    return (
      <>
        <div className="listing-actions">
          <button className="btn" onClick={() => navigate('/inventory')}>Back</button>
        </div>
        {canViewStockListing || canViewIssueOutRecord ? (
          <div className="module-grid" aria-label="Inventory report modules" style={{ marginTop: 24 }}>
            {canViewStockListing && (
              <button className="module-card" type="button" onClick={() => { setGeneratedDate(null); setView('stock-listing'); }}>
                <span className="module-icon module-red">
                  <svg viewBox="0 0 64 64" aria-hidden="true">
                    <path d="M12 18h40v36H12z" />
                    <path d="M12 28h40M12 38h40M24 18v36M40 18v36" />
                    <path d="M20 10h24v8H20z" />
                  </svg>
                </span>
                <span className="module-label">Stock Listing</span>
              </button>
            )}
            {canViewIssueOutRecord && (
              <button className="module-card" type="button" onClick={() => { setGeneratedIssueRange(null); setView('issue-out-record'); }}>
                <span className="module-icon module-gold">
                  <svg viewBox="0 0 64 64" aria-hidden="true">
                    <path d="M12 14h30v38H12z" />
                    <path d="M20 24h14M20 32h14M20 40h10" />
                    <path d="M40 32h14M46 24l8 8-8 8" />
                  </svg>
                </span>
                <span className="module-label">Issue Out Record</span>
              </button>
            )}
          </div>
        ) : (
          <p className="empty" style={{ padding: 28, marginTop: 24 }}>
            You can open Inventory Reports, but no individual report has been assigned to your account yet.
          </p>
        )}
      </>
    );
  }

  if (view === 'issue-out-record') {
    return (
      <>
        <div className="listing-actions">
          <button className="btn" type="button" onClick={() => setView('menu')}>Back</button>
        </div>

        <article className="panel" style={{ marginTop: 16 }}>
          <div className="panel-header">
            <h3>Issue Out Record</h3>
          </div>
          <div className="form-grid" style={{ padding: 16 }}>
            <label>
              From Date
              <input type="date" value={issueFromDate} onChange={(e) => setIssueFromDate(e.target.value)} />
            </label>
            <label>
              To Date
              <input type="date" value={issueToDate} onChange={(e) => setIssueToDate(e.target.value)} />
            </label>
            <label>
              Station
              <select value={issueStation} onChange={(e) => setIssueStation(e.target.value)}>
                <option value="all">All</option>
                {state.stations.map((station) => (
                  <option key={station.id} value={station.name}>{station.code ? `${station.code} - ${station.name}` : station.name}</option>
                ))}
              </select>
            </label>
            <button
              className="btn primary"
              type="button"
              onClick={generateIssueOutRecord}
              style={{ alignSelf: 'end', justifySelf: 'start', width: 'auto', minWidth: 100 }}
            >
              Generate
            </button>
          </div>
        </article>

        {generatedIssueRange && (
          <>
            <div className="grid stats" style={{ marginTop: 16 }}>
              <article className="stat">
                <span>Issue Records</span>
                <strong>{issueRecordCount}</strong>
                <small>{generatedIssueRange.from} to {generatedIssueRange.to}</small>
              </article>
              <article className="stat">
                <span>Item Rows</span>
                <strong>{issueRows.length}</strong>
                <small>{issueStation === 'all' ? 'All stations' : issueStation}</small>
              </article>
              <article className="stat">
                <span>Total Quantity</span>
                <strong>{formatNumber(issueQtyTotal, 2)}</strong>
                <small>All issue rows</small>
              </article>
              <article className="stat">
                <span>Station Count</span>
                <strong>{issueStationCount}</strong>
                <small>Stations in report</small>
              </article>
            </div>

            <article className="panel" style={{ marginTop: 16 }}>
              <div className="panel-header">
                <h3>Issue Out Listing</h3>
              </div>
              <div className="table-wrap">
                <table className="listing-table">
                  <thead>
                    <tr>
                      <th>Issue No.</th>
                      <th>Date</th>
                      <th>Issued To</th>
                      <th>Station</th>
                      <th>Equipment</th>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Unit</th>
                      <th>Purpose</th>
                      <th>Status</th>
                      <th>Approved By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issueRows.length === 0 ? (
                      <tr><td colSpan={11} className="empty">No issue out records found for this filter.</td></tr>
                    ) : issueRows.map((row) => (
                      <tr key={row.key}>
                        <td>{row.issueNo}</td>
                        <td>{row.date || '-'}</td>
                        <td>{row.issuedTo}</td>
                        <td>{row.station}</td>
                        <td>{row.equipment}</td>
                        <td style={{ textAlign: 'left' }}>{row.item}</td>
                        <td>{formatNumber(row.quantity, 2)}</td>
                        <td>{row.unit || '-'}</td>
                        <td style={{ textAlign: 'left' }}>{row.purpose || '-'}</td>
                        <td>{row.status}</td>
                        <td>{row.approvedBy || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </>
        )}
      </>
    );
  }

  return (
    <>
      <div className="listing-actions">
        <button className="btn" type="button" onClick={() => setView('menu')}>Back</button>
      </div>

      <article className="panel" style={{ marginTop: 16 }}>
        <div className="panel-header">
          <h3>Stock Listing</h3>
        </div>
        <div className="form-grid" style={{ padding: 16 }}>
          <label>
            Report Date
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
          </label>
          <label>
            Sort By
            <select value={stockSort} onChange={(e) => setStockSort(e.target.value as StockSort)}>
              <option value="stock-id">Stock ID</option>
              <option value="cost-asc">Cost (Asc)</option>
              <option value="cost-desc">Cost (Desc)</option>
              <option value="activity-asc">Last Activity (Asc)</option>
              <option value="activity-desc">Last Activity (Desc)</option>
            </select>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, fontWeight: 500, color: '#555' }}>
              <input
                type="checkbox"
                checked={hideZero}
                onChange={(e) => setHideZero(e.target.checked)}
                style={{ width: 13, height: 13, margin: 0 }}
              />
              Hide Zero
            </span>
          </label>
          <button
            className="btn primary"
            type="button"
            onClick={generateStockListing}
            style={{ alignSelf: 'end', justifySelf: 'start', width: 'auto', minWidth: 100 }}
          >
            Generate
          </button>
        </div>
      </article>

      {generatedDate && (
        <>
          <div className="grid stats" style={{ marginTop: 16 }}>
            <article className="stat">
              <span>Stock Value</span>
              <strong>{money(totalValue)}</strong>
              <small>FIFO value as at {generatedDate}</small>
            </article>
            <article className="stat">
              <span>Total Quantity</span>
              <strong>{formatNumber(totalQty, 2)}</strong>
              <small>All listed items</small>
            </article>
            <article className="stat">
              <span>Low Stock Items</span>
              <strong>{lowStockCount}</strong>
              <small>At or below reorder level</small>
            </article>
            <article className="stat">
              <span>Opening Balance Items</span>
              <strong>{openingFallbackCount}</strong>
              <small>Old stock without purchase cost</small>
            </article>
          </div>

          <article className="panel" style={{ marginTop: 16 }}>
            <div className="panel-header">
              <h3>Stock Listing Report</h3>
            </div>
            <div className="table-wrap">
              <table className="listing-table">
                <thead>
                  <tr>
                    <th>Stock ID</th>
                    <th>Item</th>
                    <th>Category</th>
                    <th>Location</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>FIFO Value</th>
                    <th>Avg Cost</th>
                    <th>Last Activity</th>
                    <th>Reorder</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stockRows.length === 0 ? (
                    <tr><td colSpan={11} className="empty">No stock items found.</td></tr>
                  ) : stockRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.stockId}</td>
                      <td style={{ textAlign: 'left' }}>{row.item}</td>
                      <td>{row.category || '-'}</td>
                      <td>{row.location || '-'}</td>
                      <td>{formatNumber(row.quantity, 2)}</td>
                      <td>{row.unit || '-'}</td>
                      <td>{money(row.value)}</td>
                      <td>{money(row.avgCost)}</td>
                      <td>{row.lastActivity || '-'}</td>
                      <td>{formatNumber(row.reorder, 2)}</td>
                      <td>{row.reorder > 0 && row.quantity <= row.reorder ? 'Reorder' : 'Healthy'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {openingFallbackCount > 0 && (
              <p style={{ color: '#777', fontSize: 13, margin: '10px 16px 16px' }}>
                Some old stock has no Receive In price history yet, so its opening balance value is shown as RM 0.00 until future FIFO layers exist.
              </p>
            )}
          </article>
        </>
      )}
    </>
  );
}
