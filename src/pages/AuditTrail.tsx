import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

export default function AuditTrail() {
  const { state } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterModule, setFilterModule] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [entries, setEntries] = useState<string>('50');

  if (!currentUser?.isAdmin) {
    return (
      <div className="topbar">
        <div>
          <h2>Audit Trail</h2>
          <p>This page is restricted to administrators.</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => navigate('/')}>Back</button>
        </div>
      </div>
    );
  }

  const logs = state.auditLogs ?? [];

  // Distinct dropdown choices, derived from the actual log data
  const users   = useMemo(() => Array.from(new Set(logs.map((l) => l.username))).sort(), [logs]);
  const modules = useMemo(() => Array.from(new Set(logs.map((l) => l.module))).sort(),   [logs]);
  const actions = useMemo(() => Array.from(new Set(logs.map((l) => l.action))).sort(),   [logs]);

  const filtered = logs.filter((l) => {
    if (filterUser && l.username !== filterUser) return false;
    if (filterModule && l.module !== filterModule) return false;
    if (filterAction && l.action !== filterAction) return false;
    if (filterFrom && l.timestamp.slice(0, 10) < filterFrom) return false;
    if (filterTo && l.timestamp.slice(0, 10) > filterTo) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const text = `${l.username} ${l.module} ${l.action} ${l.recordType ?? ''} ${l.recordRef ?? ''} ${l.details ?? ''}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  const shown = entries === 'all' ? filtered : filtered.slice(0, Number(entries));

  function clearFilters() {
    setSearch('');
    setFilterUser('');
    setFilterModule('');
    setFilterAction('');
    setFilterFrom('');
    setFilterTo('');
  }

  function fmtTs(iso: string): string {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Audit Trail</h2>
          <p>Complete record of user actions across every module. {logs.length} total entries.</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => navigate('/')}>Back</button>
        </div>
      </div>

      <div className="panel" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>
            User
            <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)}>
              <option value="">All users</option>
              {users.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>
            Module
            <select value={filterModule} onChange={(e) => setFilterModule(e.target.value)}>
              <option value="">All modules</option>
              {modules.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>
            Action
            <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)}>
              <option value="">All actions</option>
              {actions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>
            From
            <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
          </label>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>
            To
            <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="search"
            placeholder="Search reference, details, user…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: '1 1 240px', minWidth: 220 }}
          />
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>
            Show&nbsp;
            <select value={entries} onChange={(e) => setEntries(e.target.value)}>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="250">250</option>
              <option value="all">All</option>
            </select>
          </label>
          <button className="btn" type="button" onClick={clearFilters}>Clear filters</button>
        </div>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table className="listing-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Module</th>
                <th>Action</th>
                <th>Reference</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan={6} className="empty">{logs.length === 0 ? 'No audit entries yet.' : 'No entries match the current filters.'}</td></tr>
              ) : shown.map((l) => (
                <tr key={l.id}>
                  <td style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 12 }}>{fmtTs(l.timestamp)}</td>
                  <td>{l.username}</td>
                  <td>{l.module}{l.recordType ? <span style={{ color: 'var(--muted)' }}> · {l.recordType}</span> : null}</td>
                  <td><span style={{ fontWeight: 600 }}>{l.action}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>{l.recordRef || '-'}</td>
                  <td style={{ fontSize: 13, color: '#475569' }}>{l.details || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > Number(entries) && entries !== 'all' && (
          <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--muted)' }}>
            Showing {shown.length} of {filtered.length} matching entries.
          </div>
        )}
      </div>
    </>
  );
}
