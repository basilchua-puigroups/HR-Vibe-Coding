import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { hasPerm } from '../../utils/permissions';
import { appendAudit } from '../../utils/audit';
import { NoPermission } from '../../components/NoPermission';
import { nextId } from '../../utils/codes';
import type { Supplier, AppState } from '../../types';

type View = 'list' | 'form';

function nextSupplierId(state: AppState): string {
  const nums = state.suppliers
    .map((s) => Number(String(s.supplierId || '').replace(/\D/g, '')))
    .filter((n) => !isNaN(n) && n > 0);
  const max = nums.length ? Math.max(...nums) : 0;
  return 'SUP-' + String(max + 1).padStart(6, '0');
}

const norm = (value: string | undefined) => (value ?? '').trim().toLowerCase();

function supplierUsage(state: AppState, supplier: Supplier) {
  const supplierName = norm(supplier.name);
  const rfqs = state.rfqs.filter((rfq) =>
    (rfq.suppliers ?? []).some((s) => s.supplierId === supplier.id || norm(s.name) === supplierName),
  );
  const orders = state.orders.filter((order) =>
    order.supplierId === supplier.id || norm(order.supplier) === supplierName,
  );
  const receiveIns = (state.receiveIns ?? []).filter((rec) =>
    rec.supplierId === supplier.id || norm(rec.supplier) === supplierName ||
    rec.items.some((item) => item.supplierId === supplier.id || norm(item.supplier) === supplierName),
  );

  return { rfqs, orders, receiveIns };
}

export default function SupplierFile() {
  const { state, setState } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<Supplier | null>(null);

  const canView = hasPerm(currentUser, 'viewSupplier');
  const canCreate = hasPerm(currentUser, 'createSupplier');
  const canEdit = hasPerm(currentUser, 'editSupplier');
  const canDelete = hasPerm(currentUser, 'deleteSupplier');

  if (!canView) return <NoPermission backPath="/procurement" />;

  const [form, setForm] = useState({
    supplierId: '', name: '', category: '', address: '',
    phone: '', fax: '', contact: '', email: '',
  });

  function openAdd() {
    setEditing(null);
    setForm({ supplierId: '', name: '', category: '', address: '', phone: '', fax: '', contact: '', email: '' });
    setView('form');
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({
      supplierId: s.supplierId ?? '',
      name: s.name,
      category: s.category ?? '',
      address: s.address ?? '',
      phone: s.phone ?? '',
      fax: s.fax ?? '',
      contact: s.contact ?? '',
      email: s.email ?? '',
    });
    setView('form');
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { alert('Supplier name is required.'); return; }
    setState((prev) => {
      if (editing) {
        const next = {
          ...prev,
          suppliers: prev.suppliers.map((s) =>
            s.id === editing.id ? { ...editing, ...form, region: editing.region, balance: editing.balance } : s
          ),
        };
        return appendAudit(next, currentUser, 'Supplier', 'Edit', {
          recordRef: editing.supplierId ?? form.name, recordId: editing.id,
        });
      }
      const newSupplier: Supplier = {
        id: nextId(prev.suppliers),
        supplierId: form.supplierId || nextSupplierId(prev),
        name: form.name,
        category: form.category,
        address: form.address,
        phone: form.phone,
        fax: form.fax,
        contact: form.contact,
        email: form.email,
        region: '',
        balance: 0,
      };
      return appendAudit(
        { ...prev, suppliers: [...prev.suppliers, newSupplier] },
        currentUser, 'Supplier', 'Create', {
          recordRef: newSupplier.supplierId, recordId: newSupplier.id,
          details: newSupplier.name,
        },
      );
    });
    setView('list');
  }

  function handleDelete(id: number) {
    const target = state.suppliers.find((s) => s.id === id);
    if (!target) return;

    const used = supplierUsage(state, target);
    if (used.rfqs.length || used.orders.length || used.receiveIns.length) {
      const rfqRefs = used.rfqs.map((r) => r.rfqNo).filter(Boolean);
      const poRefs = used.orders.map((o) => o.poNo).filter(Boolean);
      const receiveRefs = used.receiveIns.map((r) => r.receiveNo).filter(Boolean);
      const parts = [
        rfqRefs.length ? `RFQ: ${rfqRefs.slice(0, 5).join(', ')}${rfqRefs.length > 5 ? ` +${rfqRefs.length - 5} more` : ''}` : '',
        poRefs.length ? `PO: ${poRefs.slice(0, 5).join(', ')}${poRefs.length > 5 ? ` +${poRefs.length - 5} more` : ''}` : '',
        receiveRefs.length ? `Receive In: ${receiveRefs.slice(0, 5).join(', ')}${receiveRefs.length > 5 ? ` +${receiveRefs.length - 5} more` : ''}` : '',
      ].filter(Boolean);

      alert(`Cannot delete supplier "${target.name}" because it is already used in records.\n\n${parts.join('\n')}`);
      return;
    }

    if (!confirm('Delete this supplier?')) return;
    setState((prev) => appendAudit(
      { ...prev, suppliers: prev.suppliers.filter((s) => s.id !== id) },
      currentUser, 'Supplier', 'Delete', {
        recordRef: target?.supplierId ?? target?.name, recordId: id,
      },
    ));
  }

  // ─────────── LIST VIEW ───────────
  if (view === 'list') return (
    <article className="panel">
      <div className="panel-header">
        <h3>Supplier Directory</h3>
      </div>
      <div className="listing-actions" style={{ padding: '12px 16px 0' }}>
        <button className="btn" onClick={() => navigate('/procurement')}>Back</button>
        {canCreate && <button className="btn primary" onClick={openAdd}>+ Add Supplier</button>}
      </div>
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table className="listing-table">
          <thead>
            <tr>
              <th>No.</th>
              <th>Supplier ID</th>
              <th>Category</th>
              <th>Supplier Name</th>
              <th>Phone</th>
              <th>Fax</th>
              <th>Contact Person</th>
              <th>Email</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {state.suppliers.length === 0 ? (
              <tr><td colSpan={9} className="empty">No suppliers found.</td></tr>
            ) : state.suppliers.map((s, idx) => (
              <tr key={s.id}>
                <td>{idx + 1}</td>
                <td>{s.supplierId || '-'}</td>
                <td>{s.category || '-'}</td>
                <td>{s.name}</td>
                <td>{s.phone || '-'}</td>
                <td>{s.fax || '-'}</td>
                <td>{s.contact || '-'}</td>
                <td>{s.email || '-'}</td>
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
  );

  // ─────────── FORM VIEW ───────────
  return (
    <form className="irf-editor" onSubmit={handleSave}>
      <h2 className="irf-title">{editing ? 'Edit Supplier' : 'Add Supplier'}</h2>
      <div className="irf-toolbar">
        <button className="btn" type="button" onClick={() => setView('list')}>Back</button>
        <button className="btn primary" type="submit">Save</button>
      </div>
      <div className="irf-card">
        <div className="irf-grid">
          <label className="full">
            Supplier ID
            <input value={form.supplierId} readOnly placeholder="--Auto Generate--" style={{ background: '#f5f5f5' }} />
          </label>
          <label>
            Supplier Name <span style={{ color: 'red' }}>*</span>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </label>
          <label>
            Category
            <input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
          </label>
          <label className="full">
            Address
            <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </label>
          <label>
            Phone
            <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </label>
          <label>
            Fax
            <input value={form.fax} onChange={(e) => setForm((f) => ({ ...f, fax: e.target.value }))} />
          </label>
          <label>
            Contact Person
            <input value={form.contact} onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))} />
          </label>
          <label>
            Email <small>(separate multiple with ;)</small>
            <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </label>
        </div>
      </div>
    </form>
  );
}
