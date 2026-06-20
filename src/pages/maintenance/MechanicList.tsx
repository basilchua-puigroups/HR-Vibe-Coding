import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../../components/Modal';
import { nextId, nextMechanicCode } from '../../utils/codes';
import { appendAudit } from '../../utils/audit';
import type { Mechanic } from '../../types';

const BLANK: Omit<Mechanic, 'id'> = {
  code: '', name: '', specialization: '', phone: '', status: 'Active', remarks: '',
};

function statusBadge(status: string) {
  const isActive = status === 'Active';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 11, fontWeight: 700,
      background: isActive ? '#d1fae5' : '#e2e8f0',
      color:      isActive ? '#065f46' : '#475569',
    }}>
      {status}
    </span>
  );
}

export default function MechanicList() {
  const { state, setState } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Mechanic | null>(null);
  const [form, setForm] = useState<Omit<Mechanic, 'id'>>(BLANK);

  function openAdd() {
    setEditing(null);
    setForm({ ...BLANK, code: nextMechanicCode(state) });
    setOpen(true);
  }

  function openEdit(m: Mechanic) {
    setEditing(m);
    setForm({ code: m.code, name: m.name, specialization: m.specialization, phone: m.phone, status: m.status, remarks: m.remarks });
    setOpen(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { alert('Name is required.'); return; }
    setState((prev) => {
      if (editing) {
        return appendAudit(
          { ...prev, mechanics: prev.mechanics.map((m) => m.id === editing.id ? { ...editing, ...form } : m) },
          currentUser, 'Mechanic List', 'Edit', { recordRef: form.code, recordId: editing.id, details: form.name },
        );
      }
      const newMechanic: Mechanic = { id: nextId(prev.mechanics), ...form };
      return appendAudit(
        { ...prev, mechanics: [...prev.mechanics, newMechanic] },
        currentUser, 'Mechanic List', 'Create', { recordRef: newMechanic.code, recordId: newMechanic.id, details: newMechanic.name },
      );
    });
    setOpen(false);
  }

  function handleDelete(id: number) {
    if (!confirm('Delete this mechanic?')) return;
    const target = state.mechanics.find((m) => m.id === id);
    setState((prev) => appendAudit(
      { ...prev, mechanics: prev.mechanics.filter((m) => m.id !== id) },
      currentUser, 'Mechanic List', 'Delete', { recordRef: target?.code, recordId: id, details: target?.name },
    ));
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Mechanic List</h2>
          <p>Manage maintenance technicians and their specializations.</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => navigate('/maintenance')}>Back</button>
          <button className="btn primary" onClick={openAdd}>+ Add Mechanic</button>
        </div>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table className="listing-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Specialization</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Remarks</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {state.mechanics.length === 0 ? (
                <tr><td colSpan={7} className="empty">No mechanics registered yet.</td></tr>
              ) : state.mechanics.map((m) => (
                <tr key={m.id}>
                  <td>{m.code}</td>
                  <td>{m.name}</td>
                  <td>{m.specialization || '-'}</td>
                  <td>{m.phone || '-'}</td>
                  <td>{statusBadge(m.status)}</td>
                  <td>{m.remarks || '-'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn" style={{ fontSize: 12, padding: '4px 10px', marginRight: 4 }} onClick={() => openEdit(m)}>Edit</button>
                    <button className="btn danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete(m.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Mechanic' : 'Add Mechanic'}>
        <form className="form-grid" onSubmit={handleSave}>
          <label>
            Code
            <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="e.g. MEC-001" />
          </label>
          <label>
            Name <span style={{ color: 'red' }}>*</span>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </label>
          <label>
            Specialization
            <input value={form.specialization} onChange={(e) => setForm((f) => ({ ...f, specialization: e.target.value }))} placeholder="e.g. Electrical, Mechanical, Hydraulic" />
          </label>
          <label>
            Phone
            <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </label>
          <label>
            Status
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </label>
          <label className="full">
            Remarks
            <textarea value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
          </label>
          <button className="btn primary full" type="submit">Save Mechanic</button>
        </form>
      </Modal>
    </>
  );
}
