import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../../components/Modal';
import { nextStationCode, nextId } from '../../utils/codes';
import { hasPerm } from '../../utils/permissions';
import { appendAudit } from '../../utils/audit';
import { NoPermission } from '../../components/NoPermission';
import type { Station } from '../../types';

export default function StationPage() {
  const { state, setState } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Station | null>(null);
  const [form, setForm] = useState({ code: '', name: '' });

  const canView = hasPerm(currentUser, 'viewStation');
  const canCreate = hasPerm(currentUser, 'createStation');
  const canEdit = hasPerm(currentUser, 'editStation');
  const canDelete = hasPerm(currentUser, 'deleteStation');

  if (!canView) return <NoPermission backPath="/inventory" />;

  function openAdd() {
    setEditing(null);
    setForm({ code: nextStationCode(state), name: '' });
    setOpen(true);
  }

  function openEdit(s: Station) {
    setEditing(s);
    setForm({ code: s.code, name: s.name });
    setOpen(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code.trim()) { alert('Code is required.'); return; }
    if (!form.name.trim()) { alert('Station name is required.'); return; }
    const dupCode = state.stations.some(
      (s) => s.code.trim().toLowerCase() === form.code.trim().toLowerCase() && s.id !== editing?.id
    );
    if (dupCode) { alert(`Code "${form.code.trim()}" is already in use. Please use a different code.`); return; }
    setState((prev) => {
      if (editing) {
        return appendAudit(
          { ...prev, stations: prev.stations.map((s) => s.id === editing.id ? { ...editing, ...form } : s) },
          currentUser, 'Station', 'Edit', { recordRef: form.code, recordId: editing.id, details: form.name },
        );
      }
      const newStation: Station = { id: nextId(prev.stations), locationId: 0, description: '', equipment: [], ...form };
      return appendAudit(
        { ...prev, stations: [...prev.stations, newStation] },
        currentUser, 'Station', 'Create', { recordRef: newStation.code, recordId: newStation.id, details: newStation.name },
      );
    });
    setOpen(false);
  }

  function handleDelete(id: number) {
    if (!confirm('Delete this station?')) return;
    const target = state.stations.find((s) => s.id === id);
    setState((prev) => appendAudit(
      { ...prev, stations: prev.stations.filter((s) => s.id !== id) },
      currentUser, 'Station', 'Delete', { recordRef: target?.code, recordId: id, details: target?.name },
    ));
  }

  return (
    <>
      <article className="panel">
        <div className="panel-header">
          <h3>Station</h3>
        </div>
        <div className="listing-actions" style={{ padding: '12px 16px 0' }}>
          <button className="btn" onClick={() => navigate('/inventory')}>Back</button>
          {canCreate && <button className="btn primary" onClick={openAdd}>+ Add Station</button>}
        </div>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="listing-table">
            <thead>
              <tr><th>No.</th><th>Code</th><th>Station</th><th>Equipment</th><th>Action</th></tr>
            </thead>
            <tbody>
              {state.stations.length === 0 ? (
                <tr><td colSpan={5} className="empty">No stations.</td></tr>
              ) : state.stations.map((s, idx) => (
                <tr key={s.id}>
                  <td>{idx + 1}</td>
                  <td>{s.code}</td>
                  <td>{s.name}</td>
                  <td>
                    <button
                      className="btn"
                      style={{ fontSize: 12, padding: '4px 10px' }}
                      onClick={() => navigate(`/inventory/station/${s.id}/equipment`)}
                    >
                      {s.equipment?.length ?? 0} Equipment
                    </button>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {canEdit && <button className="btn" style={{ fontSize: 12, padding: '4px 10px', marginRight: 4 }} onClick={() => openEdit(s)}>Edit</button>}
                    {canDelete && <button className="btn danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete(s.id)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Station' : 'Add Station'}>
        <form className="form-grid" onSubmit={handleSave}>
          <label>
            Code <span style={{ color: 'red' }}>*</span>
            <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} required />
          </label>
          <label>
            Station Name <span style={{ color: 'red' }}>*</span>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </label>
          <button className="btn primary full" type="submit">Save Station</button>
        </form>
      </Modal>
    </>
  );
}
