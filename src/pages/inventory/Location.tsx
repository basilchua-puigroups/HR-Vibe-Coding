import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../../components/Modal';
import { nextLocationCode, nextId } from '../../utils/codes';
import { hasPerm } from '../../utils/permissions';
import { appendAudit } from '../../utils/audit';
import { NoPermission } from '../../components/NoPermission';
import type { Location } from '../../types';

export default function Location() {
  const { state, setState } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });

  const canView = hasPerm(currentUser, 'viewLocation');
  const canCreate = hasPerm(currentUser, 'createLocation');
  const canEdit = hasPerm(currentUser, 'editLocation');
  const canDelete = hasPerm(currentUser, 'deleteLocation');

  if (!canView) return <NoPermission backPath="/inventory" />;

  function openAdd() {
    setEditing(null);
    setForm({ name: '', description: '' });
    setOpen(true);
  }

  function openEdit(l: Location) {
    setEditing(l);
    setForm({ name: l.name, description: l.description });
    setOpen(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { alert('Store location name is required.'); return; }
    setState((prev) => {
      if (editing) {
        return appendAudit(
          { ...prev, locations: prev.locations.map((l) => l.id === editing.id ? { ...editing, ...form } : l) },
          currentUser, 'Location', 'Edit', { recordRef: editing.code, recordId: editing.id, details: form.name },
        );
      }
      const newLoc: Location = { id: nextId(prev.locations), code: nextLocationCode(prev), ...form };
      return appendAudit(
        { ...prev, locations: [...prev.locations, newLoc] },
        currentUser, 'Location', 'Create', { recordRef: newLoc.code, recordId: newLoc.id, details: newLoc.name },
      );
    });
    setOpen(false);
  }

  function handleDelete(id: number) {
    if (!confirm('Delete this store location?')) return;
    const target = state.locations.find((l) => l.id === id);
    setState((prev) => appendAudit(
      { ...prev, locations: prev.locations.filter((l) => l.id !== id) },
      currentUser, 'Location', 'Delete', { recordRef: target?.code, recordId: id, details: target?.name },
    ));
  }

  return (
    <>
      <article className="panel">
        <div className="panel-header">
          <h3>Store Location</h3>
        </div>
        <div className="listing-actions" style={{ padding: '12px 16px 0' }}>
          <button className="btn" onClick={() => navigate('/inventory')}>Back</button>
          {canCreate && <button className="btn primary" onClick={openAdd}>+ Add Store Location</button>}
        </div>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="listing-table">
            <thead>
              <tr><th>No.</th><th>Store Location</th><th>Action</th></tr>
            </thead>
            <tbody>
              {state.locations.length === 0 ? (
                <tr><td colSpan={3} className="empty">No locations.</td></tr>
              ) : state.locations.map((l, idx) => (
                <tr key={l.id}>
                  <td>{idx + 1}</td>
                  <td>{l.name}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {canEdit && <button className="btn" style={{ fontSize: 12, padding: '4px 10px', marginRight: 4 }} onClick={() => openEdit(l)}>Edit</button>}
                    {canDelete && <button className="btn danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete(l.id)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Store Location' : 'Add Store Location'}>
        <form className="form-grid" onSubmit={handleSave}>
          <label className="full">
            Store Location <span style={{ color: 'red' }}>*</span>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </label>
          <button className="btn primary full" type="submit">Save Store Location</button>
        </form>
      </Modal>
    </>
  );
}
