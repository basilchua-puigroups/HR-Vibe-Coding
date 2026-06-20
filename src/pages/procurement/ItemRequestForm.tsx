import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../../components/Modal';
import { today } from '../../utils/format';
import { nextRefNo } from '../../utils/codes';
import { hasPerm } from '../../utils/permissions';
import { appendAudit } from '../../utils/audit';
import { NoPermission } from '../../components/NoPermission';
import { ItemDescriptionInput } from '../../components/ItemDescriptionInput';
import type { ItemRequest, RequestItem, InventoryItem } from '../../types';

type View = 'list' | 'form' | 'detail';

const blankItem = (): RequestItem => ({
  description: '', quantity: '', unit: '', purpose: '', remarks: '', location: '', fileName: '', fileData: '',
});

function hasRequestItemName(item: RequestItem): boolean {
  return !!item.itemId || item.description.trim() !== '';
}

function isBlankRequestItem(item: RequestItem): boolean {
  return !item.itemId &&
    item.description.trim() === '' &&
    item.quantity.trim() === '' &&
    item.unit.trim() === '' &&
    item.purpose.trim() === '' &&
    item.remarks.trim() === '' &&
    item.location.trim() === '' &&
    item.fileName.trim() === '' &&
    item.fileData.trim() === '';
}

export default function Requests() {
  const { state, setState } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<ItemRequest | null>(null);
  const [detail, setDetail] = useState<ItemRequest | null>(null);
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState<string>('10');
  const [selected, setSelected] = useState<number[]>([]);
  const [saveConfirm, setSaveConfirm] = useState(false);
  const [actionConfirm, setActionConfirm] = useState<{ message: string; label: string; btnClass: string; onConfirm: () => void } | null>(null);

  function confirmAction(message: string, label: string, btnClass: string, onConfirm: () => void) {
    setActionConfirm({ message, label, btnClass, onConfirm });
  }

  const canView = hasPerm(currentUser, 'viewIrf');
  const canCreate = hasPerm(currentUser, 'createIrf');
  const canEdit = hasPerm(currentUser, 'editIrf');
  const canApprove = hasPerm(currentUser, 'approveIrf');
  const canReject = hasPerm(currentUser, 'rejectIrf');
  const canDelete = hasPerm(currentUser, 'deleteIrf');
  const canPrint = hasPerm(currentUser, 'printIrf');

  if (!canView) return <NoPermission backPath="/procurement" />;

  const [form, setForm] = useState({
    date: today(), type: '', requestedBy: '', remarks: '', refNo: '',
  });
  const [items, setItems] = useState<RequestItem[]>([blankItem()]);

  const filtered = state.requests.filter((r) =>
    r.refNo.toLowerCase().includes(search.toLowerCase()) ||
    r.requestedBy.toLowerCase().includes(search.toLowerCase()) ||
    (r.remarks || '').toLowerCase().includes(search.toLowerCase())
  );
  const shown = entries === 'all' ? filtered : filtered.slice(0, Number(entries));
  const itemByName = (name: string) =>
    state.inventory.find((item) => item.item.trim().toLowerCase() === name.trim().toLowerCase());

  function openNew() {
    setEditing(null);
    setForm({ date: today(), type: '', requestedBy: '', remarks: '', refNo: nextRefNo(state) });
    setItems([blankItem()]);
    setView('form');
  }

  function openEdit(r: ItemRequest) {
    setEditing(r);
    setForm({ date: r.date, type: r.type, requestedBy: r.requestedBy, remarks: r.remarks, refNo: r.refNo });
    setItems(r.items.length ? r.items.map((i) => ({ ...i })) : [blankItem()]);
    setView('form');
  }

  function openDetail(r: ItemRequest) {
    setDetail(r);
    setView('detail');
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveConfirm(true);
  }

  function doSave() {
    setSaveConfirm(false);
    const cleanItems = items.filter((it) => !isBlankRequestItem(it));
    if (!cleanItems.length) {
      alert('At least one item is required before saving this IRF.');
      return;
    }
    const missingItemIdx = items.findIndex((it) => !isBlankRequestItem(it) && !hasRequestItemName(it));
    if (missingItemIdx >= 0) {
      alert(`Item row ${missingItemIdx + 1} needs an item description. Delete the row if it was added accidentally.`);
      return;
    }
    const linkedItems = cleanItems.map((it) => {
      if (it.itemId) return it;
      const selected = itemByName(it.description);
      return selected ? { ...it, itemId: selected.id, unit: it.unit || selected.unit } : it;
    });
    setState((prev) => {
      const record: ItemRequest = {
        id: editing?.id ?? Date.now(),
        requestTo: 'Purchasing Manager',
        approvalStatus: 'Pending',
        approvedBy: '',
        approvedDate: '',
        ...form,
        items: linkedItems,
      };
      const next = editing
        ? { ...prev, requests: prev.requests.map((r) => r.id === editing.id ? record : r) }
        : { ...prev, requests: [record, ...prev.requests] };
      return appendAudit(next, currentUser, 'IRF', editing ? 'Edit' : 'Create', {
        recordRef: record.refNo, recordId: record.id,
        details: `${linkedItems.length} item(s)`,
      });
    });
    setView('list');
  }

  function handleDelete(ids: number[]) {
    const blocked = ids
      .map((id) => state.requests.find((r) => r.id === id))
      .filter((r) => r && state.rfqs.some((rfq) => rfq.irfRef === r.refNo));
    if (blocked.length) {
      const refs = blocked.map((r) => r!.refNo).join(', ');
      alert(`Cannot delete ${refs} — it is linked to an RFQ. Delete the RFQ first.`);
      return;
    }
    if (!confirm(`Delete ${ids.length} request(s)?`)) return;
    const targets = state.requests.filter((r) => ids.includes(r.id));
    setState((prev) => {
      let next: typeof prev = { ...prev, requests: prev.requests.filter((r) => !ids.includes(r.id)) };
      for (const r of targets) {
        next = appendAudit(next, currentUser, 'IRF', 'Delete', { recordRef: r.refNo, recordId: r.id });
      }
      return next;
    });
    setSelected([]);
  }

  function handleApprove(r: ItemRequest) {
    const username = currentUser?.username ?? 'Authorized User';
    const updated = { ...r, approvalStatus: 'Approved', approvedBy: username, approvedDate: today() };
    setState((prev) => appendAudit(
      { ...prev, requests: prev.requests.map((req) => req.id === r.id ? updated : req) },
      currentUser, 'IRF', 'Approve', { recordRef: r.refNo, recordId: r.id },
    ));
    setDetail(updated);
  }

  function handleReject(r: ItemRequest) {
    const username = currentUser?.username ?? 'Authorized User';
    const updated = { ...r, approvalStatus: 'Rejected', approvedBy: username, approvedDate: today() };
    setState((prev) => appendAudit(
      { ...prev, requests: prev.requests.map((req) => req.id === r.id ? updated : req) },
      currentUser, 'IRF', 'Reject', { recordRef: r.refNo, recordId: r.id },
    ));
    setDetail(updated);
  }

  function updateItem(idx: number, patch: Partial<RequestItem>) {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }
  function updateItemDescription(idx: number, description: string, selected?: InventoryItem) {
    updateItem(idx, selected ? { itemId: selected.id, description: selected.item, unit: selected.unit } : { itemId: undefined, description });
  }

  function addItem() {
    setItems((prev) => [...prev, blankItem()]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);
  }

  function clearItem(idx: number) {
    setItems((prev) => prev.map((it, i) => i === idx ? blankItem() : it));
  }

  function toggleSelect(id: number) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? shown.map((r) => r.id) : []);
  }

  function approvalMark(status: string) {
    if (status === 'Approved') return <span className="approval-mark approved">✓</span>;
    if (status === 'Rejected') return <span className="approval-mark rejected">×</span>;
    return null;
  }

  // ── LIST VIEW ──────────────────────────────────────────────
  if (view === 'list') return (
    <>
      <div><h2>Item Request Form (IRF) Listing</h2></div>
      <div className="listing-actions">
        <button className="btn" onClick={() => navigate('/procurement')}>Back</button>
        {canCreate && <button className="btn primary" onClick={openNew}>+ New</button>}
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
              <th>IRF No.</th>
              <th>Date</th>
              <th>Requested By</th>
              <th>Remarks</th>
              <th>Approved</th>
              <th>RFQ</th>
              <th>Approved/Rejected</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={8} className="empty">No records found.</td></tr>
            ) : shown.map((r) => (
              <tr key={r.id}>
                <td>{r.refNo}</td>
                <td>{r.date}</td>
                <td>{r.requestedBy}</td>
                <td>{r.remarks || '-'}</td>
                <td style={{ textAlign: 'center' }}>{approvalMark(r.approvalStatus)}</td>
                <td style={{ textAlign: 'center' }}>
                  {state.rfqs.some((rfq) => (rfq.irfRef ?? '').split(';').map((s) => s.trim()).includes(r.refNo)) && (
                    <span style={{ color: '#28a745', fontSize: 16 }} title="RFQ created">&#10003;</span>
                  )}
                </td>
                <td>{r.approvedBy ? `${r.approvedBy} @ ${r.approvedDate || '-'}` : '-'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn" style={{ fontSize: 12, padding: '4px 10px', marginRight: 4 }} onClick={() => openDetail(r)}>View</button>
                  {canEdit && <button className="btn" style={{ fontSize: 12, padding: '4px 10px', marginRight: 4 }} onClick={() => openEdit(r)}>Edit</button>}
                  {canDelete && <button className="btn danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete([r.id])}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  // ── FORM VIEW ──────────────────────────────────────────────
  if (view === 'form') return (
    <>
    <Modal open={saveConfirm} onClose={() => setSaveConfirm(false)} title="Confirm Save" hideClose>
      <p style={{ margin: '0 0 20px', fontSize: 14 }}>Do you want to save this Item Request Form?</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button className="btn" type="button" onClick={() => setSaveConfirm(false)}>Cancel</button>
        <button className="btn primary" type="button" onClick={doSave}>Save</button>
      </div>
    </Modal>
    <form className="irf-editor" onSubmit={handleSave}>
      <h2 className="irf-title">
        {editing ? `Edit Item Request Form (IRF) ${form.refNo}` : 'New Item Request Form (IRF)'}
      </h2>
      <div className="irf-toolbar">
        <button className="btn" type="button" onClick={() => setView('list')}>Back</button>
        <button className="btn primary" type="submit">Save</button>
      </div>
      <div className="irf-card">
        <div className="irf-grid">
          <label>
            Date (d/m/y)
            <input name="date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
          </label>
          <label>
            Type
            <select name="type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} required>
              <option value="">Please Select One</option>
              <option value="Normal">Normal</option>
              <option value="Urgent">Urgent</option>
              <option value="Repeat Order">Repeat Order</option>
              <option value="Work Order">Work Order</option>
            </select>
          </label>
          <label>
            Requested By
            <input name="requestedBy" placeholder="Requested By" value={form.requestedBy} onChange={(e) => setForm((f) => ({ ...f, requestedBy: e.target.value }))} required />
          </label>
          <label className="full">
            Remarks
            <input name="remarks" placeholder="Remarks" value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
          </label>
        </div>

        <div className="table-wrap">
          <table className="irf-item-table">
            <colgroup>
              <col className="irf-col-control" />
              <col className="irf-col-description" />
              <col className="irf-col-quantity" />
              <col className="irf-col-unit" />
              <col className="irf-col-purpose" />
              <col className="irf-col-remarks" />
              <col className="irf-col-location" />
              <col className="irf-col-file" />
              <col className="irf-col-action" />
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th>Item Description</th>
                <th>Quantity</th>
                <th>Unit</th>
                <th>Purpose</th>
                <th>Remarks</th>
                <th>Location</th>
                <th>Files Attachment</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx}>
                  <td><button className="square-btn danger" type="button" onClick={() => removeItem(idx)}>-</button></td>
                  <td><ItemDescriptionInput value={it.description} inventory={state.inventory} onChange={(desc, sel) => updateItemDescription(idx, desc, sel)} /></td>
                  <td><input type="number" step="1" min="1" placeholder="Qty" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: e.target.value })} /></td>
                  <td><input placeholder="Unit" value={it.unit} onChange={(e) => updateItem(idx, { unit: e.target.value })} /></td>
                  <td><input placeholder="Purpose" value={it.purpose} onChange={(e) => updateItem(idx, { purpose: e.target.value })} /></td>
                  <td><input placeholder="Remarks" value={it.remarks} onChange={(e) => updateItem(idx, { remarks: e.target.value })} /></td>
                  <td><input placeholder="Location" value={it.location} onChange={(e) => updateItem(idx, { location: e.target.value })} /></td>
                  <td>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,image/*,application/pdf" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) updateItem(idx, { fileName: file.name });
                    }} />
                    {it.fileName && <small>{it.fileName}</small>}
                  </td>
                  <td><button className="square-btn gold" type="button" title="Clear row" onClick={() => clearItem(idx)}>x</button></td>
                </tr>
              ))}
              <tr>
                <td><button className="square-btn primary" type="button" onClick={addItem}>+</button></td>
                <td colSpan={8}></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </form>
    </>
  );

  // ── DETAIL VIEW ────────────────────────────────────────────
  const d = state.requests.find((r) => r.id === detail?.id) ?? detail!;
  const isApproved = d.approvalStatus === 'Approved';
  const isRejected = d.approvalStatus === 'Rejected';
  return (
    <>
    <Modal open={!!actionConfirm} onClose={() => setActionConfirm(null)} title="Confirm" hideClose>
      <p style={{ margin: '0 0 20px', fontSize: 14 }}>{actionConfirm?.message}</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button className="btn" type="button" onClick={() => setActionConfirm(null)}>Cancel</button>
        <button className={actionConfirm?.btnClass} type="button" onClick={() => { actionConfirm?.onConfirm(); setActionConfirm(null); }}>{actionConfirm?.label}</button>
      </div>
    </Modal>
    <div className="irf-editor">
      <h2 className="irf-title">Item Request Form (IRF) {d.refNo}</h2>
      <div className="irf-toolbar">
        <button className="btn" type="button" onClick={() => setView('list')}>Back</button>
        {canEdit && <button className="btn primary" type="button" onClick={() => openEdit(d)}>Edit</button>}
        {canApprove && (
          <button className="btn primary" type="button" disabled={isApproved} onClick={() => confirmAction('Approve this Item Request Form?', 'Approve', 'btn primary', () => handleApprove(d))}>
            {isApproved ? 'Approved' : 'Approve'}
          </button>
        )}
        {canReject && (
          <button className="btn danger" type="button" disabled={isRejected} onClick={() => confirmAction('Reject this Item Request Form?', 'Reject', 'btn danger', () => handleReject(d))}>
            {isRejected ? 'Rejected' : 'Reject'}
          </button>
        )}
      </div>
      <div className="irf-card">
        <div className="irf-grid">
          <label>Date (d/m/y)<input disabled value={d.date} /></label>
          <label>Type<input disabled value={d.type} /></label>
          <label>Requested By<input disabled value={d.requestedBy} /></label>
          <label className="full">Remarks<input disabled value={d.remarks} /></label>
        </div>
        <div className="table-wrap">
          <table className="irf-item-table">
            <thead>
              <tr>
                <th>Item Description</th>
                <th>Quantity</th>
                <th>Unit</th>
                <th>Purpose</th>
                <th>Remarks</th>
                <th>Location</th>
                <th>Files Attachment</th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((it, idx) => (
                <tr key={idx}>
                  <td>{it.description}</td>
                  <td>{it.quantity}</td>
                  <td>{it.unit}</td>
                  <td>{it.purpose}</td>
                  <td>{it.remarks}</td>
                  <td>{it.location}</td>
                  <td>{it.fileName || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    </>
  );
}
