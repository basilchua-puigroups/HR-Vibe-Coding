import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../../components/Modal';
import { StockItemPicker } from '../../components/StockItemPicker';
import { money, today } from '../../utils/format';
import { nextAssetNo } from '../../utils/codes';
import { hasPerm } from '../../utils/permissions';
import { appendAudit } from '../../utils/audit';
import { NoPermission } from '../../components/NoPermission';
import type { FixedAsset as FixedAssetType, InventoryItem } from '../../types';

const STATUS_OPTIONS = ['Active', 'Under Maintenance', 'Disposed'];

function statusBadge(status: string) {
  const map: Record<string, string> = {
    Active: 'ok',
    'Under Maintenance': 'warn',
    Disposed: 'bad',
  };
  return <span className={`badge ${map[status] ?? 'info'}`}>{status || 'Active'}</span>;
}

const blankForm = () => ({
  assetNo: '', name: '', category: '', station: '', equipment: '',
  purchaseDate: today(), purchaseValue: '', currentValue: '', status: 'Active', remarks: '',
});

export default function FixedAsset() {
  const { state, setState } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const canView   = hasPerm(currentUser, 'viewFixedAsset');
  const canCreate = hasPerm(currentUser, 'createFixedAsset');
  const canEdit   = hasPerm(currentUser, 'editFixedAsset');
  const canDelete = hasPerm(currentUser, 'deleteFixedAsset');

  if (!canView) return <NoPermission backPath="/inventory" />;

  const [open, setOpen]       = useState(false);
  const [editing, setEditing] = useState<FixedAssetType | null>(null);
  const [saveConfirm, setSaveConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<FixedAssetType | null>(null);
  const [search, setSearch]   = useState('');
  const [entries, setEntries] = useState<string>('10');
  const [form, setForm]       = useState(blankForm());
  const [itemId, setItemId]   = useState<number>(0);

  const assets = state.fixedAssets ?? [];

  const filtered = assets.filter((a) => {
    const partName = state.inventory.find((i) => i.id === a.itemId)?.item ?? '';
    const text = `${a.assetNo} ${a.name} ${a.category} ${a.station ?? a.location} ${a.equipment ?? ''} ${partName} ${a.status} ${a.remarks}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });
  const shown = entries === 'all' ? filtered : filtered.slice(0, Number(entries));

  function openAdd() {
    setEditing(null);
    setForm({ ...blankForm(), assetNo: nextAssetNo(state) });
    setItemId(0);
    setOpen(true);
  }

  function openEdit(a: FixedAssetType) {
    setEditing(a);
    setForm({
      assetNo: a.assetNo,
      name: a.name,
      category: a.category,
      station: a.station ?? a.location ?? '',
      equipment: a.equipment ?? '',
      purchaseDate: a.purchaseDate,
      purchaseValue: String(a.purchaseValue ?? ''),
      currentValue: String(a.currentValue ?? ''),
      status: a.status || 'Active',
      remarks: a.remarks,
    });
    setItemId(a.itemId ?? 0);
    setOpen(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { alert('Asset name is required.'); return; }
    const dupCode = (state.fixedAssets ?? []).some(
      (a) => a.assetNo.trim().toLowerCase() === form.assetNo.trim().toLowerCase() && a.id !== editing?.id
    );
    if (dupCode) { alert(`Asset No. "${form.assetNo.trim()}" is already in use. Please use a different Asset No.`); return; }
    setSaveConfirm(true);
  }

  function doSave() {
    setSaveConfirm(false);
    const record: FixedAssetType = {
      id: editing?.id ?? Date.now(),
      assetNo: form.assetNo,
      name: form.name,
      category: form.category,
      location: form.station,   // keep field name for backward compat
      station: form.station,
      equipment: form.equipment,
      itemId: itemId || undefined,
      purchaseDate: form.purchaseDate,
      purchaseValue: Number(form.purchaseValue) || 0,
      currentValue: Number(form.currentValue) || 0,
      status: form.status,
      remarks: form.remarks,
    };
    setState((prev) => {
      const list = prev.fixedAssets ?? [];
      const next = {
        ...prev,
        fixedAssets: editing
          ? list.map((a) => a.id === editing.id ? record : a)
          : [record, ...list],
      };
      return appendAudit(next, currentUser, 'Fixed Asset', editing ? 'Edit' : 'Create', {
        recordRef: record.assetNo, recordId: record.id,
        details: `${record.name} (${record.status})`,
      });
    });
    setOpen(false);
  }

  function doDelete(a: FixedAssetType) {
    setState((prev) => appendAudit(
      { ...prev, fixedAssets: (prev.fixedAssets ?? []).filter((x) => x.id !== a.id) },
      currentUser, 'Fixed Asset', 'Delete', { recordRef: a.assetNo, recordId: a.id, details: a.name },
    ));
    setDeleteConfirm(null);
  }

  return (
    <>
      <Modal open={saveConfirm} onClose={() => setSaveConfirm(false)} title="Confirm Save" hideClose>
        <p style={{ margin: '0 0 20px', fontSize: 14 }}>
          {editing ? `Save changes to asset ${form.assetNo}?` : `Add new fixed asset ${form.assetNo}?`}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn" type="button" onClick={() => setSaveConfirm(false)}>Cancel</button>
          <button className="btn primary" type="button" onClick={doSave}>Save</button>
        </div>
      </Modal>

      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Confirm Delete" hideClose>
        <p style={{ margin: '0 0 20px', fontSize: 14 }}>
          Delete asset <strong>{deleteConfirm?.assetNo} — {deleteConfirm?.name}</strong>? This cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn" type="button" onClick={() => setDeleteConfirm(null)}>Cancel</button>
          <button className="btn danger" type="button" onClick={() => deleteConfirm && doDelete(deleteConfirm)}>Delete</button>
        </div>
      </Modal>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? `Edit Asset — ${form.assetNo}` : 'New Fixed Asset'} wide>
        <form className="form-grid" onSubmit={handleSave}>
          <label>
            Asset No.
            <input value={form.assetNo} readOnly style={{ background: '#f5f5f5' }} />
          </label>
          <label>
            Status
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="full">
            Asset Name / Description <span style={{ color: 'red' }}>*</span>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required placeholder="e.g. Forklift, Generator Set" />
          </label>

          {/* Stock Item Picker — same autocomplete as IssueOut / ReceiveIn */}
          <StockItemPicker
            itemId={itemId}
            inventory={state.inventory}
            onChange={(id, inv: InventoryItem | undefined) => setItemId(inv ? id : 0)}
          />

          <label>
            Category
            <input
              list="fa-category-list"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="Type code or category name"
            />
            <datalist id="fa-category-list">
              {state.categories.map((c) => (
                <option key={c.id} value={`${c.code} - ${c.name}`} />
              ))}
            </datalist>
          </label>
          <label>
            Station
            <select value={form.station} onChange={(e) => setForm((f) => ({ ...f, station: e.target.value, equipment: '' }))}>
              <option value=""></option>
              {state.stations.map((s) => (
                <option key={s.id} value={s.name}>{s.code ? `${s.code} - ${s.name}` : s.name}</option>
              ))}
            </select>
          </label>
          <label>
            Equipment
            <select value={form.equipment} onChange={(e) => setForm((f) => ({ ...f, equipment: e.target.value }))}>
              <option value=""></option>
              {(state.stations.find((s) => s.name === form.station)?.equipment ?? []).map((eq) => (
                <option key={eq.id} value={eq.name}>{eq.code ? `${eq.code} - ${eq.name}` : eq.name}</option>
              ))}
            </select>
          </label>
          <label>
            Purchase Date
            <input type="date" value={form.purchaseDate} onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))} />
          </label>
          <label>
            Purchase Value (RM)
            <input type="number" min="0" step="0.01" placeholder="0.00" value={form.purchaseValue} onChange={(e) => setForm((f) => ({ ...f, purchaseValue: e.target.value }))} />
          </label>
          <label>
            Current Value (RM)
            <input type="number" min="0" step="0.01" placeholder="0.00" value={form.currentValue} onChange={(e) => setForm((f) => ({ ...f, currentValue: e.target.value }))} />
          </label>
          <label className="full">
            Remarks
            <textarea value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} placeholder="Condition notes, serial number, etc." />
          </label>
          <button className="btn primary full" type="submit">Save</button>
        </form>
      </Modal>

      <div><h2>Fixed Asset Register</h2></div>
      <div className="listing-actions">
        <button className="btn" onClick={() => navigate('/inventory')}>Back</button>
        {canCreate && <button className="btn primary" onClick={openAdd}>+ New Asset</button>}
      </div>

      <div className="listing-controls">
        <label className="entries-control">
          Show&nbsp;
          <select value={entries} onChange={(e) => setEntries(e.target.value)}>
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="all">All</option>
          </select>
          &nbsp;entries
        </label>
        <label className="search-control">
          Search:&nbsp;
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      <div className="table-wrap">
        <table className="listing-table">
          <thead>
            <tr>
              <th>No.</th>
              <th>Asset No.</th>
              <th>Name / Description</th>
              <th>Category</th>
              <th>Station</th>
              <th>Equipment</th>
              <th>Purchase Date</th>
              <th>Purchase Value (RM)</th>
              <th>Current Value (RM)</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={11} className="empty">No fixed assets found.</td></tr>
            ) : shown.map((a, idx) => (
              <tr key={a.id}>
                <td>{idx + 1}</td>
                <td>{a.assetNo}</td>
                <td>{a.name}</td>
                <td>{a.category || '-'}</td>
                <td>{(a.station ?? a.location) || '-'}</td>
                <td>{a.equipment || '-'}</td>
                <td>{a.purchaseDate || '-'}</td>
                <td style={{ textAlign: 'right' }}>{money(a.purchaseValue ?? 0)}</td>
                <td style={{ textAlign: 'right' }}>{money(a.currentValue ?? 0)}</td>
                <td>{statusBadge(a.status)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {canEdit && (
                    <button className="btn" style={{ fontSize: 12, padding: '4px 10px', marginRight: 4 }} onClick={() => openEdit(a)}>Edit</button>
                  )}
                  {canDelete && (
                    <button className="btn danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setDeleteConfirm(a)}>Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
