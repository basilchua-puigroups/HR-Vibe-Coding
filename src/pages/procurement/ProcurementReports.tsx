import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { formatNumber, money, today } from '../../utils/format';
import { statusBadge } from '../../components/Badge';

type ReportView = 'menu' | 'purchase-summary';
type PurchaseSort = 'po-asc' | 'po-desc' | 'total-asc' | 'total-desc';

type GeneratedRange = {
  from: string;
  to: string;
};

function firstDayOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export default function ProcurementReports() {
  const { state } = useApp();
  const navigate = useNavigate();
  const [view, setView] = useState<ReportView>('menu');
  const [fromDate, setFromDate] = useState(firstDayOfMonth(today()));
  const [toDate, setToDate] = useState(today());
  const [purchaseSort, setPurchaseSort] = useState<PurchaseSort>('po-asc');
  const [generatedRange, setGeneratedRange] = useState<GeneratedRange | null>(null);

  function lineTotal(quantity: number, unitPrice: number, sstPercent: number): number {
    const gross = Number(quantity || 0) * Number(unitPrice || 0);
    return gross + gross * Number(sstPercent || 0) / 100;
  }

  function generatePurchaseSummary() {
    if (!fromDate || !toDate) {
      alert('Please select From Date and To Date.');
      return;
    }
    if (fromDate > toDate) {
      alert('From Date cannot be later than To Date.');
      return;
    }
    setGeneratedRange({ from: fromDate, to: toDate });
  }

  const purchaseRows = generatedRange
    ? state.orders
        .filter((order) => {
          const date = order.date || '';
          return date >= generatedRange.from && date <= generatedRange.to;
        })
        .flatMap((order) =>
          (order.items ?? []).map((item, idx) => {
            const quantity = Number(item.quantity || 0);
            const unitPrice = Number(item.unitPrice || 0);
            const sstPercent = Number(item.sstPercent || 0);
            return {
              key: `${order.id}-${idx}`,
              orderId: order.id,
              poNo: order.poNo,
              date: order.date,
              supplier: order.supplier || '-',
              description: item.description || '-',
              quantity,
              unit: item.unit || '-',
              unitPrice,
              sstPercent,
              total: lineTotal(quantity, unitPrice, sstPercent),
              status: order.status || 'Ordered',
            };
          }),
        )
        .sort((a, b) => {
          if (purchaseSort === 'po-asc') {
            return (a.poNo || '').localeCompare(b.poNo || '', undefined, { numeric: true }) || (a.date || '').localeCompare(b.date || '');
          }
          if (purchaseSort === 'po-desc') {
            return (b.poNo || '').localeCompare(a.poNo || '', undefined, { numeric: true }) || (b.date || '').localeCompare(a.date || '');
          }
          if (purchaseSort === 'total-asc') {
            return a.total - b.total || (a.poNo || '').localeCompare(b.poNo || '', undefined, { numeric: true });
          }
          return b.total - a.total || (a.poNo || '').localeCompare(b.poNo || '', undefined, { numeric: true });
        })
    : [];

  const supplierSummary = Object.values(
    purchaseRows.reduce((acc, row) => {
      if (!acc[row.supplier]) acc[row.supplier] = { supplier: row.supplier, poNos: new Set<string>(), quantity: 0, total: 0 };
      acc[row.supplier].poNos.add(row.poNo);
      acc[row.supplier].quantity += row.quantity;
      acc[row.supplier].total += row.total;
      return acc;
    }, {} as Record<string, { supplier: string; poNos: Set<string>; quantity: number; total: number }>),
  );

  const totalValue = purchaseRows.reduce((sum, row) => sum + row.total, 0);
  const totalQty = purchaseRows.reduce((sum, row) => sum + row.quantity, 0);
  const poCount = new Set(purchaseRows.map((row) => row.poNo)).size;
  const supplierCount = supplierSummary.length;

  if (view === 'menu') {
    return (
      <>
        <div className="listing-actions">
          <button className="btn" onClick={() => navigate('/procurement')}>Back</button>
        </div>
        <div className="module-grid" aria-label="Procurement report modules" style={{ marginTop: 24 }}>
          <button className="module-card" type="button" onClick={() => { setGeneratedRange(null); setView('purchase-summary'); }}>
            <span className="module-icon module-teal">
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <path d="M16 8h32v48H16z" />
                <path d="M24 20h16M24 28h16M24 36h10" />
                <path d="M24 46h6M36 46h6" />
              </svg>
            </span>
            <span className="module-label">Purchase Summary Report</span>
          </button>
        </div>
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
          <h3>Purchase Summary Report</h3>
        </div>
        <div className="form-grid" style={{ padding: 16 }}>
          <label>
            From Date
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>
          <label>
            To Date
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
          <label>
            Sort By
            <select value={purchaseSort} onChange={(e) => setPurchaseSort(e.target.value as PurchaseSort)}>
              <option value="po-asc">PO (Asc)</option>
              <option value="po-desc">PO (Desc)</option>
              <option value="total-asc">Total Cost (Asc)</option>
              <option value="total-desc">Total Cost (Desc)</option>
            </select>
          </label>
          <button className="btn primary" type="button" onClick={generatePurchaseSummary}>Generate</button>
        </div>
      </article>

      {generatedRange && (
        <>
          <div className="grid stats" style={{ marginTop: 16 }}>
            <article className="stat">
              <span>Total Purchase Value</span>
              <strong>{money(totalValue)}</strong>
              <small>{generatedRange.from} to {generatedRange.to}</small>
            </article>
            <article className="stat">
              <span>PO Count</span>
              <strong>{poCount}</strong>
              <small>Purchase orders</small>
            </article>
            <article className="stat">
              <span>Supplier Count</span>
              <strong>{supplierCount}</strong>
              <small>Suppliers purchased from</small>
            </article>
            <article className="stat">
              <span>Total Quantity</span>
              <strong>{formatNumber(totalQty, 2)}</strong>
              <small>All purchase rows</small>
            </article>
          </div>

          <article className="panel" style={{ marginTop: 16 }}>
            <div className="panel-header">
              <h3>Purchase Listing</h3>
            </div>
            <div className="table-wrap">
              <table className="listing-table">
                <thead>
                  <tr>
                    <th>PO No.</th>
                    <th>Date</th>
                    <th>Supplier</th>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Unit Price</th>
                    <th>SST %</th>
                    <th>Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseRows.length === 0 ? (
                    <tr><td colSpan={10} className="empty">No purchase records found for this date range.</td></tr>
                  ) : purchaseRows.map((row) => (
                    <tr key={row.key}>
                      <td><button className="btn-link" onClick={() => navigate('/procurement/orders', { state: { openPoId: row.orderId } })}>{row.poNo}</button></td>
                      <td>{row.date}</td>
                      <td style={{ textAlign: 'left' }}>{row.supplier}</td>
                      <td style={{ textAlign: 'left' }}>{row.description}</td>
                      <td>{formatNumber(row.quantity, 2)}</td>
                      <td>{row.unit}</td>
                      <td>{money(row.unitPrice)}</td>
                      <td>{formatNumber(row.sstPercent, 2)}</td>
                      <td>{money(row.total)}</td>
                      <td>{statusBadge(row.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="panel" style={{ marginTop: 16 }}>
            <div className="panel-header">
              <h3>Supplier Summary</h3>
            </div>
            <div className="table-wrap">
              <table className="listing-table">
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>PO Count</th>
                    <th>Total Qty</th>
                    <th>Total Value</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierSummary.length === 0 ? (
                    <tr><td colSpan={4} className="empty">No supplier summary for this date range.</td></tr>
                  ) : supplierSummary.map((row) => (
                    <tr key={row.supplier}>
                      <td style={{ textAlign: 'left' }}>{row.supplier}</td>
                      <td>{row.poNos.size}</td>
                      <td>{formatNumber(row.quantity, 2)}</td>
                      <td>{money(row.total)}</td>
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
