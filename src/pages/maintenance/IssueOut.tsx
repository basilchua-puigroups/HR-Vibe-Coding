import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Modal } from '../../components/Modal';
import { statusBadge } from '../../components/Badge';
import { today } from '../../utils/format';
import { nextIssueNo, nextId } from '../../utils/codes';
import type { IssueOut, IssueOutItem } from '../../types';

const BLANK_ITEM: IssueOutItem = { itemId: 0, description: '', quantity: '', unit: '', station: '', purpose: '' };

export default function IssueOutPage() {
  const { state, setState } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<IssueOut | null>(null);
  const [form, setForm] = useState({ issuedTo: '', remarks: '', createdBy: '' });
  const [items, setItems] = useState<IssueOutItem[]>([{ ...BLANK_ITEM }]);

  function openAdd() {
    setEditing(null);
    setForm({ issuedTo: '', remarks: '', createdBy: '' });
    setItems([{ ...BLANK_ITEM, itemId: state.inventory[0]?.id ?? 0 }]);
    setOpen(true);
  }

  function openEdit(io: IssueOut) {
    setEditing(io);
    setForm({ issuedTo: io.issuedTo, remarks: io.remarks, createdBy: io.createdBy });
    setItems(io.items.length ? io.items : [{ ...BLANK_ITEM }]);
    setOpen(true);
  }

  function addItem() {
    setItems((prev) => [...prev, { ...BLANK_ITEM, itemId: state.inventory[0]?.id ?? 0 }]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);
  }

  function updateItem(idx: number, patch: Partial<IssueOutItem>) {
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const merged = { ...it, ...patch };
      if (patch.itemId !== undefined) {
        const inv = state.inventory.find((inv) => inv.id === patch.itemId);
        merged.unit = inv?.unit ?? '';
      }
      return merged;
    }));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.issuedTo.trim()) { alert('Issued To is required.'); return; }
    if (items.some((it) => !it.quantity || Number(it.quantity) <= 0)) {
      alert('All items require a quantity greater than 0.'); return;
    }
    const totals = new Map<number, number>();
    for (const it of items) {
      totals.set(it.itemId, (totals.get(it.itemId) ?? 0) + (Number(it.quantity) || 0));
    }
    for (const [itemId, qty] of totals) {
      const inv = state.inventory.find((i) => i.id === itemId);
      if (inv && qty > inv.quantity) {
        alert(`Cannot save — insufficient stock:\n\n${inv.item} — issue qty ${qty} ${inv.unit} exceeds stock on hand (${inv.quantity} ${inv.unit}).`);
        return;
      }
    }
    const savedItems = items.map((it) => ({ ...it, quantity: Number(it.quantity) || 0 }));
    setState((prev) => {
      if (editing) {
        return { ...prev, issueOuts: prev.issueOuts.map((io) => io.id === editing.id ? { ...editing, ...form, items: savedItems } : io) };
      }
      const newIo: IssueOut = { id: nextId(prev.issueOuts), issueNo: nextIssueNo(prev), status: 'Pending', verifiedBy: '', approvedBy: '', createdAt: today(), ...form, items: savedItems };
      return { ...prev, issueOuts: [newIo, ...prev.issueOuts] };
    });
    setOpen(false);
  }

  function handleDelete(id: number) {
    if (!confirm('Delete this issue out?')) return;
    setState((prev) => ({ ...prev, issueOuts: prev.issueOuts.filter((io) => io.id !== id) }));
  }

  function handleApprove(io: IssueOut, type: 'verify' | 'approve') {
    const name = prompt(`${type === 'verify' ? 'Verified' : 'Approved'} by:`);
    if (!name) return;
    setState((prev) => ({
      ...prev,
      issueOuts: prev.issueOuts.map((r) => r.id === io.id
        ? type === 'verify'
          ? { ...r, verifiedBy: name, status: 'Verified' }
          : { ...r, approvedBy: name, status: 'Approved' }
        : r),
    }));
  }

  const partName = (id: number) => state.inventory.find((i) => i.id === id)?.item ?? '-';

  return (
    <>
      <div className="topbar">
        <div><h2>Issue Out</h2><p>Record parts issued to maintenance jobs.</p></div>
        <div className="actions">
          <button className="btn primary" onClick={openAdd}>+ New Issue Out</button>
        </div>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table className="listing-table">
            <thead>
              <tr><th>Issue No.</th><th>Issued To</th><th>Remarks</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {state.issueOuts.length === 0 ? (
                <tr><td colSpan={5} className="empty">No issue outs recorded.</td></tr>
              ) : state.issueOuts.map((io) => (
                <tr key={io.id}>
                  <td>{io.issueNo}</td>
                  <td>{io.issuedTo}</td>
                  <td>{io.remarks || '-'}</td>
                  <td>{statusBadge(io.status || 'Pending')}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {io.status === 'Pending' && <button className="btn" style={{ fontSize: 12, padding: '4px 8px', marginRight: 4 }} onClick={() => handleApprove(io, 'verify')}>Verify</button>}
                    {io.status === 'Verified' && <button className="btn primary" style={{ fontSize: 12, padding: '4px 8px', marginRight: 4 }} onClick={() => handleApprove(io, 'approve')}>Approve</button>}
                    <button className="btn" style={{ fontSize: 12, padding: '4px 10px', marginRight: 4 }} onClick={() => openEdit(io)}>Edit</button>
                    <button className="btn danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete(io.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Issue Out' : 'New Issue Out'} wide>
        <form onSubmit={handleSave}>
          <div className="form-grid" style={{ marginBottom: 16 }}>
            <label>
              Issued To <span style={{ color: 'red' }}>*</span>
              <input value={form.issuedTo} onChange={(e) => setForm((f) => ({ ...f, issuedTo: e.target.value }))} required />
            </label>
            <label>
              Created By
              <input value={form.createdBy} onChange={(e) => setForm((f) => ({ ...f, createdBy: e.target.value }))} />
            </label>
            <label className="full">
              Remarks
              <textarea value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong>Items</strong>
            <button type="button" className="btn primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={addItem}>+ Add Row</button>
          </div>

          <div className="table-wrap" style={{ marginBottom: 16 }}>
            <table style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Part</th><th>Description</th><th>Qty</th><th>Unit</th><th>Station</th><th>Purpose</th><th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx}>
                    <td>
                      <select value={it.itemId} style={{ width: '100%', fontSize: 13, border: '1px solid #ccc', borderRadius: 3, padding: '3px 5px' }} onChange={(e) => updateItem(idx, { itemId: Number(e.target.value) })}>
                        {state.inventory.map((i) => <option key={i.id} value={i.id}>{i.item}</option>)}
                      </select>
                    </td>
                    <td><input value={it.description} style={{ width: '100%', fontSize: 13, border: '1px solid #ccc', borderRadius: 3, padding: '3px 5px' }} onChange={(e) => updateItem(idx, { description: e.target.value })} /></td>
                    <td><input type="number" step="1" min="1" value={it.quantity} placeholder="0" style={{ width: 70, fontSize: 13, border: '1px solid #ccc', borderRadius: 3, padding: '3px 5px' }} onChange={(e) => updateItem(idx, { quantity: e.target.value })} /></td>
                    <td><input value={it.unit} readOnly style={{ width: 60, fontSize: 13, border: '1px solid #ccc', borderRadius: 3, padding: '3px 5px', background: '#f5f5f5' }} /></td>
                    <td>
                      <select value={it.station} style={{ width: '100%', fontSize: 13, border: '1px solid #ccc', borderRadius: 3, padding: '3px 5px' }} onChange={(e) => updateItem(idx, { station: e.target.value })}>
                        <option value="">-- Station --</option>
                        {state.stations.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                      </select>
                    </td>
                    <td><input value={it.purpose} style={{ width: '100%', fontSize: 13, border: '1px solid #ccc', borderRadius: 3, padding: '3px 5px' }} onChange={(e) => updateItem(idx, { purpose: e.target.value })} /></td>
                    <td><button type="button" className="square-btn danger" onClick={() => removeItem(idx)}>-</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className="btn primary full" type="submit">Save Issue Out</button>
        </form>
      </Modal>
    </>
  );
}
