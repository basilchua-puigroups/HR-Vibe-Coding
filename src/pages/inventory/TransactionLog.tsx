import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { hasPerm } from '../../utils/permissions';
import { NoPermission } from '../../components/NoPermission';

export default function TransactionLog() {
  const { state } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState<string>('25');

  if (!hasPerm(currentUser, 'viewTransaction')) return <NoPermission backPath="/inventory" />;

  const partName = (id: number) => state.inventory.find((i) => i.id === id)?.item ?? '-';
  const partUnit = (id: number) => state.inventory.find((i) => i.id === id)?.unit ?? '';

  // Look up the source record to get createdBy / approvedBy
  function getCreatedBy(m: { receiveNo?: string; type?: string; stockType?: string; reference?: string; createdBy?: string }): string {
    if (m.receiveNo) return (state.receiveIns ?? []).find((r) => r.receiveNo === m.receiveNo)?.createdBy ?? '-';
    if (m.type === 'Issue' && m.stockType === 'Issue Out')
      return state.issueOuts.find((io) => io.issueNo === m.reference)?.createdBy ?? '-';
    return m.createdBy ?? '-';
  }

  function getApprovedBy(m: { receiveNo?: string; type?: string; stockType?: string; reference?: string; approvedBy?: string }): string {
    if (m.approvedBy) return m.approvedBy;
    if (m.receiveNo) return (state.receiveIns ?? []).find((r) => r.receiveNo === m.receiveNo)?.approvedBy ?? '-';
    if (m.type === 'Issue' && m.stockType === 'Issue Out')
      return state.issueOuts.find((io) => io.issueNo === m.reference)?.approvedBy ?? '-';
    return '-';
  }

  // Issue Out entries that belong to a Direct Issue — we hide these since the
  // Direct Issue receive entry already represents the full transaction.
  const directIssueNos = new Set(
    state.issueOuts.filter((io) => io.isDirectIssue).map((io) => io.issueNo)
  );

  const sorted = [...state.movements]
    .filter((m) => !(m.type === 'Issue' && m.stockType === 'Issue Out' && directIssueNos.has(m.reference ?? '')))
    .sort((a, b) => b.date.localeCompare(a.date));

  const filtered = search.trim()
    ? sorted.filter((m) => {
        const text = `${m.date} ${m.stockType ?? ''} ${m.type ?? ''} ${m.reference ?? ''} ${partName(m.itemId)} ${m.note ?? ''}`.toLowerCase();
        return text.includes(search.toLowerCase());
      })
    : sorted;

  const shown = entries === 'all' ? filtered : filtered.slice(0, Number(entries));

  return (
    <article className="panel">
      <div className="panel-header">
        <h3>Transaction</h3>
      </div>
      <div className="listing-actions" style={{ padding: '12px 16px 0' }}>
        <button className="btn" onClick={() => navigate('/inventory')}>Back</button>
      </div>
      <div className="listing-controls" style={{ padding: '12px 16px 0' }}>
        <label className="entries-control">
          Show&nbsp;
          <select value={entries} onChange={(e) => setEntries(e.target.value)}>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="all">All</option>
          </select>
          &nbsp;entries
        </label>
        <label className="search-control">
          Search:&nbsp;
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Date, Part, Reference, Source…" />
        </label>
      </div>
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table className="listing-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Source</th>
              <th>Reference</th>
              <th>Part</th>
              <th>Qty</th>
              <th>Created By</th>
              <th>Approved By</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={7} className="empty">{search ? 'No transactions match your search.' : 'No transactions recorded.'}</td></tr>
            ) : shown.map((m) => (
              <tr key={m.id}>
                <td>{m.date}</td>
                <td>{m.stockType || m.type || '-'}</td>
                <td>
                  {m.stockType === 'Direct Issue'
                    ? (() => {
                        const rec = (state.receiveIns ?? []).find((r) => r.receiveNo === m.receiveNo);
                        return [m.receiveNo, rec?.linkedIssueNo].filter(Boolean).join(' / ') || '-';
                      })()
                    : m.receiveNo || m.reference || '-'}
                </td>
                <td>{partName(m.itemId)}</td>
                <td style={{ color: m.stockType === 'Direct Issue' ? undefined : m.quantity < 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>
                  {m.stockType === 'Direct Issue' ? '—' : `${m.quantity > 0 ? '+' : ''}${m.quantity} ${partUnit(m.itemId)}`}
                </td>
                <td>{getCreatedBy(m)}</td>
                <td>{getApprovedBy(m)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
