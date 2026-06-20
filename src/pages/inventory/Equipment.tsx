import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../../components/Modal';
import { nextEquipmentCode, nextId } from '../../utils/codes';
import { hasPerm } from '../../utils/permissions';
import { appendAudit } from '../../utils/audit';
import { NoPermission } from '../../components/NoPermission';
import type { Equipment } from '../../types';

export default function EquipmentPage() {
  const { stationId } = useParams<{ stationId: string }>();
  const { state, setState } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const station = state.stations.find((s) => s.id === Number(stationId));
  const equipment = station?.equipment ?? [];

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [form, setForm] = useState({ codeSuffix: '', name: '', description: '' });

  const canView = hasPerm(currentUser, 'viewStation');
  const canCreate = hasPerm(currentUser, 'createEquipment');
  const canEdit = hasPerm(currentUser, 'editEquipment');
  const canDelete = hasPerm(currentUser, 'deleteEquipment');

  if (!canView) return <NoPermission backPath="/inventory" />;

  if (!station) {
    return (
      <div className="topbar">
        <div><h2>Station not found</h2></div>
        <div className="actions">
          <button className="btn" onClick={() => navigate('/inventory/station')}>Back</button>
        </div>
      </div>
    );
  }

  const prefix = station.code + ' - ';

  function openAdd() {
    setEditing(null);
    setForm({ codeSuffix: nextEquipmentCode(station!.code, equipment), name: '', description: '' });
    setOpen(true);
  }

  function openEdit(eq: Equipment) {
    setEditing(eq);
    const suffix = eq.code.startsWith(prefix) ? eq.code.slice(prefix.length) : eq.code;
    setForm({ codeSuffix: suffix, name: eq.name, description: eq.description });
    setOpen(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.codeSuffix.trim()) { alert('Code is required.'); return; }
    if (!form.name.trim()) { alert('Equipment name is required.'); return; }
    const fullCode = prefix + form.codeSuffix.trim();
    const dupCode = equipment.some(
      (e) => e.code.trim().toLowerCase() === fullCode.toLowerCase() && e.id !== editing?.id
    );
    if (dupCode) { alert(`Code "${fullCode}" is already in use. Please use a different code.`); return; }
    setState((prev) => {
      const updated = prev.stations.map((s) => {
        if (s.id !== Number(stationId)) return s;
        const eq = s.equipment ?? [];
        if (editing) {
          return { ...s, equipment: eq.map((e) => e.id === editing.id ? { ...editing, code: fullCode, name: form.name, description: form.description } : e) };
        }
        const newEq: Equipment = { id: nextId(prev.stations.flatMap((s) => s.equipment ?? [])), code: fullCode, name: form.name, description: form.description };
        return { ...s, equipment: [...eq, newEq] };
      });
      return appendAudit(
        { ...prev, stations: updated },
        currentUser, 'Equipment', editing ? 'Edit' : 'Create', {
          recordRef: fullCode, recordId: editing?.id,
          details: `${form.name} (station ${station!.name})`,
        },
      );
    });
    setOpen(false);
  }

  function handleDelete(id: number) {
    if (!confirm('Delete this equipment?')) return;
    const target = (station?.equipment ?? []).find((e) => e.id === id);
    setState((prev) => appendAudit(
      {
        ...prev,
        stations: prev.stations.map((s) =>
          s.id === Number(stationId) ? { ...s, equipment: (s.equipment ?? []).filter((e) => e.id !== id) } : s
        ),
      },
      currentUser, 'Equipment', 'Delete', {
        recordRef: target?.code, recordId: id, details: target?.name,
      },
    ));
  }

  return (
    <>
      <article className="panel">
        <div className="panel-header">
          <h3>Equipment — {station.name}</h3>
        </div>
        <div className="listing-actions" style={{ padding: '12px 16px 0' }}>
          <button className="btn" onClick={() => navigate('/inventory/station')}>Back</button>
          {canCreate && <button className="btn primary" onClick={openAdd}>+ Add Equipment</button>}
        </div>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="listing-table">
            <thead>
              <tr><th>No.</th><th>Code</th><th>Equipment</th><th>Description</th><th>Action</th></tr>
            </thead>
            <tbody>
              {equipment.length === 0 ? (
                <tr><td colSpan={5} className="empty">No equipment added yet.</td></tr>
              ) : equipment.map((eq, idx) => (
                <tr key={eq.id}>
                  <td>{idx + 1}</td>
                  <td>{eq.code}</td>
                  <td>{eq.name}</td>
                  <td>{eq.description || '-'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {canEdit && <button className="btn" style={{ fontSize: 12, padding: '4px 10px', marginRight: 4 }} onClick={() => openEdit(eq)}>Edit</button>}
                    {canDelete && <button className="btn danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete(eq.id)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Equipment' : 'Add Equipment'}>
        <form className="form-grid" onSubmit={handleSave}>
          <label className="full">
            Code <span style={{ color: 'red' }}>*</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                value={station.code}
                readOnly
                style={{ width: 110, background: 'var(--input-disabled-bg, #f0f0f0)', color: 'var(--text-muted, #888)', cursor: 'not-allowed', flexShrink: 0 }}
              />
              <span style={{ fontWeight: 600, color: '#666' }}>-</span>
              <input
                value={form.codeSuffix}
                onChange={(e) => setForm((f) => ({ ...f, codeSuffix: e.target.value }))}
                required
                placeholder="e.g. 0001"
                style={{ flex: 1 }}
              />
            </div>
          </label>
          <label>
            Equipment Name <span style={{ color: 'red' }}>*</span>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </label>
          <label className="full">
            Description
            <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </label>
          <button className="btn primary full" type="submit">Save Equipment</button>
        </form>
      </Modal>
    </>
  );
}
