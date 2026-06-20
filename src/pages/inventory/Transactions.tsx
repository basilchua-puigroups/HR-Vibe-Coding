import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../../components/Modal';
import { today } from '../../utils/format';
import { hasPerm } from '../../utils/permissions';
import { appendAudit } from '../../utils/audit';
import { NoPermission } from '../../components/NoPermission';
import { nextId } from '../../utils/codes';
import type { Movement } from '../../types';

export default function Transactions() {
  const { state, setState } = useApp();
  const { currentUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ date: today(), stockType: 'Stock In', itemId: 0, quantity: '', reference: '', note: '' });

  const canView = hasPerm(currentUser, 'viewTransaction');
  const canCreate = hasPerm(currentUser, 'createTransaction');
  const canDelete = hasPerm(currentUser, 'deleteTransaction');

  if (!canView) return <NoPermission backPath="/inventory" />;

  const sorted = [...state.movements].sort((a, b) => b.date.localeCompare(a.date));
  const partName = (id: number) => state.inventory.find((i) => i.id === id)?.item ?? '-';
  const partUnit = (id: number) => state.inventory.find((i) => i.id === id)?.unit ?? '';

  function openAdd() {
    setForm({ date: today(), stockType: 'Stock In', itemId: state.inventory[0]?.id ?? 0, quantity: '', reference: '', note: '' });
    setOpen(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.quantity || Number(form.quantity) <= 0) { alert('Please enter a valid quantity.'); return; }
    const qty = form.stockType === 'Direct Issue' ? -Math.abs(Number(form.quantity)) : Math.abs(Number(form.quantity));
    setState((prev) => {
      const item = prev.inventory.find((i) => i.id === form.itemId);
      if (!item) return prev;
      const updatedInventory = prev.inventory.map((i) =>
        i.id === form.itemId ? { ...i, quantity: Math.max(0, i.quantity + qty) } : i
      );
      const newMovement: Movement = { id: nextId(prev.movements), itemId: form.itemId, date: form.date, type: form.stockType === 'Stock In' ? 'Receive' : 'Issue', stockType: form.stockType, reference: form.reference, quantity: qty, note: form.note };
      return appendAudit(
        { ...prev, inventory: updatedInventory, movements: [newMovement, ...prev.movements] },
        currentUser, 'Transaction', 'Create', {
          recordRef: form.reference || `${form.stockType}`, recordId: newMovement.id,
          details: `${form.stockType} ${qty > 0 ? '+' : ''}${qty} ${item.unit} of ${item.item}`,
        },
      );
    });
    setOpen(false);
  }

  function handleDelete(id: number) {
    if (!confirm('Delete this transaction?')) return;
    const target = state.movements.find((m) => m.id === id);
    setState((prev) => appendAudit(
      { ...prev, movements: prev.movements.filter((m) => m.id !== id) },
      currentUser, 'Transaction', 'Delete', {
        recordRef: target?.reference ?? String(id), recordId: id,
        details: target ? `${target.stockType ?? target.type} ${target.quantity}` : undefined,
      },
    ));
  }

  return (
    <>
      <div className="topbar">
        <div><h2>Transactions</h2><p>Record stock-in and issue-out movements.</p></div>
        <div className="actions">
          {canCreate && <button className="btn primary" onClick={openAdd}>+ New Transaction</button>}
        </div>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table className="listing-table">
            <thead>
              <tr><th>Date</th><th>Type</th><th>Part</th><th>Qty</th><th>Reference</th><th>Note</th><th>Action</th></tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={7} className="empty">No transactions.</td></tr>
              ) : sorted.map((m) => (
                <tr key={m.id}>
                  <td>{m.date}</td>
                  <td>{m.stockType || m.type}</td>
                  <td>{partName(m.itemId)}</td>
                  <td style={{ color: m.quantity < 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>
                    {m.quantity > 0 ? '+' : ''}{m.quantity} {partUnit(m.itemId)}
                  </td>
                  <td>{m.reference || '-'}</td>
                  <td>{m.note || '-'}</td>
                  <td>
                    {canDelete && <button className="btn danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete(m.id)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New Transaction">
        <form className="form-grid" onSubmit={handleSave}>
          <label>
            Date <span style={{ color: 'red' }}>*</span>
            <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
          </label>
          <label>
            Stock Type
            <select value={form.stockType} onChange={(e) => setForm((f) => ({ ...f, stockType: e.target.value }))}>
              <option>Stock In</option>
              <option>Direct Issue</option>
            </select>
          </label>
          <label className="full">
            Part <span style={{ color: 'red' }}>*</span>
            <select value={form.itemId} onChange={(e) => setForm((f) => ({ ...f, itemId: Number(e.target.value) }))} required>
              {state.inventory.map((i) => <option key={i.id} value={i.id}>{i.item}</option>)}
            </select>
          </label>
          <label>
            Quantity <span style={{ color: 'red' }}>*</span>
            <input type="number" step="1" min="1" placeholder="e.g. 10" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
          </label>
          <label>
            Reference
            <input value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} placeholder="PO no., job no., etc." />
          </label>
          <label className="full">
            Note
            <textarea value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          </label>
          <button className="btn primary full" type="submit">Save Transaction</button>
        </form>
      </Modal>
    </>
  );
}
