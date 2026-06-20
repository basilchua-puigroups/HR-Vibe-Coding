import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../../components/Modal';
import { StockItemPickerCells } from '../../components/StockItemPicker';
import { today } from '../../utils/format';
import { nextIssueNo, nextId } from '../../utils/codes';
import { hasPerm } from '../../utils/permissions';
import { appendAudit } from '../../utils/audit';
import { NoPermission } from '../../components/NoPermission';
import { consumeFifo, restoreFifoSource } from '../../utils/fifo';
import type { IssueOut, IssueOutItem } from '../../types';

type View = 'list' | 'form' | 'detail';

const blankItem = (): IssueOutItem => ({
  itemId: 0, description: '', quantity: '', unit: '', station: '', equipment: '', purpose: '', workerName: '',
});

function statusBadge(status: string) {
  const colors: Record<string, string> = { Approved: '#198754', Verified: '#0d6efd', Pending: '#6c757d' };
  const color = colors[status] || colors.Pending;
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, color: '#fff', background: color }}>
      {status || 'Pending'}
    </span>
  );
}

export default function IssueOutForm() {
  const { state, setState } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<IssueOut | null>(null);
  const [detail, setDetail] = useState<IssueOut | null>(null);
  const [saveConfirm, setSaveConfirm] = useState(false);
  const [actionConfirm, setActionConfirm] = useState<{ message: string; label: string; onConfirm: () => void } | null>(null);
  const [directIssueApprove, setDirectIssueApprove] = useState<{ io: IssueOut; items: IssueOutItem[] } | null>(null);

  function confirmAction(message: string, label: string, onConfirm: () => void) {
    setActionConfirm({ message, label, onConfirm });
  }

  function updateApproveItem(idx: number, patch: Partial<IssueOutItem>) {
    setDirectIssueApprove((prev) => {
      if (!prev) return prev;
      return { ...prev, items: prev.items.map((it, i) => i === idx ? { ...it, ...patch } : it) };
    });
  }

  function doDirectIssueApprove() {
    if (!directIssueApprove) return;
    const { io, items: approveItems } = directIssueApprove;
    if (approveItems.some((it) => !it.station)) {
      alert('All items require a station to be selected.'); return;
    }
    setDirectIssueApprove(null);
    handleApprove({ ...io, items: approveItems });
  }

  const canView = hasPerm(currentUser, 'viewIssueOut');
  const canCreate = hasPerm(currentUser, 'createIssueOut');
  const canEdit = hasPerm(currentUser, 'editIssueOut');
  const canDelete = hasPerm(currentUser, 'deleteIssueOut');
  const canApprove = hasPerm(currentUser, 'approveIssueOut');

  if (!canView) return <NoPermission backPath="/inventory" />;

  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState<string>('10');

  const filteredIssue = (() => {
    if (!search.trim()) return state.issueOuts;
    const q = search.toLowerCase();
    return state.issueOuts.filter((io) => {
      const stations = [...new Set((io.items ?? []).map((it) => it.station).filter(Boolean))].join(' ');
      const text = `${io.issueNo} ${io.remarks ?? ''} ${stations} ${io.status ?? 'Pending'}`.toLowerCase();
      return text.includes(q);
    });
  })();
  const shownIssue = entries === 'all' ? filteredIssue : filteredIssue.slice(0, Number(entries));

  const [form, setForm] = useState({ issueNo: '', remarks: '' });
  const [items, setItems] = useState<IssueOutItem[]>([blankItem()]);

  function openNew() {
    setEditing(null);
    setForm({ issueNo: nextIssueNo(state), remarks: '' });
    setItems([blankItem()]);
    setView('form');
  }

  function openEdit(io: IssueOut) {
    setEditing(io);
    setForm({ issueNo: io.issueNo, remarks: io.remarks });
    setItems(io.items?.length ? io.items.map((i) => ({ ...i })) : [blankItem()]);
    setView('form');
  }

  function openDetail(io: IssueOut) {
    setDetail(io);
    setView('detail');
  }

  function checkStockAvailability(rows: IssueOutItem[]): string | null {
    const totals = new Map<number, number>();
    for (const it of rows) {
      const qty = Number(it.quantity) || 0;
      totals.set(it.itemId, (totals.get(it.itemId) ?? 0) + qty);
    }
    for (const [itemId, qty] of totals) {
      const inv = state.inventory.find((i) => i.id === itemId);
      if (!inv) continue;
      if (qty > inv.quantity) {
        return `${inv.item} — issue qty ${qty} ${inv.unit} exceeds stock on hand (${inv.quantity} ${inv.unit}).`;
      }
    }
    return null;
  }

  function isBlankItemRow(item: IssueOutItem): boolean {
    return !item.itemId
      && !item.description.trim()
      && !item.quantity
      && !item.unit.trim()
      && !item.station
      && !item.equipment
      && !item.purpose.trim()
      && !item.workerName?.trim();
  }

  function savableItems(): IssueOutItem[] {
    return items.filter((item) => !isBlankItemRow(item));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const cleanItems = savableItems();
    if (!cleanItems.length) {
      alert('At least one item is required.');
      return;
    }
    if (cleanItems.some((it) => !it.itemId)) {
      alert('All rows require a stock item — select via Stock ID or Part Name.'); return;
    }
    if (cleanItems.some((it) => !it.quantity || Number(it.quantity) <= 0)) {
      alert('All items require a quantity greater than 0.'); return;
    }
    if (cleanItems.some((it) => !it.unit.trim())) {
      alert('All items require a unit.'); return;
    }
    if (cleanItems.some((it) => !it.station)) {
      alert('All items require a station to be selected.'); return;
    }
    // Skip stock check when re-editing an Approved IssueOut — doSave reverses the existing
    // deduction first, so the real availability check happens at Approve time.
    if (editing?.status !== 'Approved') {
      const shortage = checkStockAvailability(cleanItems);
      if (shortage) { alert(`Cannot save — insufficient stock:\n\n${shortage}`); return; }
    }
    setSaveConfirm(true);
  }

  function doSave() {
    setSaveConfirm(false);
    const cleanItems = savableItems();
    setState((prev) => {
      // ── Editing a previously-Approved IssueOut ──────────────────────────────
      // Reverse the prior stock deduction + remove its movements, then save with
      // status 'Pending' (needs re-approval). A snapshot of the original items is
      // kept in preEditItems so the user can Reject Edit to restore the old state.
      if (editing && editing.status === 'Approved') {
        const restoredFifo = restoreFifoSource(prev, 'Issue Out', editing.issueNo);
        const reversedInventory = prev.inventory.map((inv) => {
          const total = editing.items.reduce(
            (sum, it) => (it.itemId === inv.id ? sum + (Number(it.quantity) || 0) : sum), 0
          );
          return total > 0 ? { ...inv, quantity: inv.quantity + total } : inv;
        });
        const filteredMovements = prev.movements.filter(
          (m) => !(m.type === 'Issue' && m.stockType === 'Issue Out' && m.reference === editing.issueNo)
        );
        const record: IssueOut = {
          ...editing,
          remarks: form.remarks,
          items: cleanItems.map((it) => ({ ...it, quantity: Number(it.quantity) || 0 })),
          status: 'Pending',
          verifiedBy: '',
          approvedBy: '',
          uploadedToTx: false,
          preEditItems: editing.preEditItems ?? editing.items, // keep earliest snapshot
        };
        return appendAudit(
          {
            ...prev,
            inventory: reversedInventory,
            movements: filteredMovements,
            stockLayers: restoredFifo.stockLayers,
            stockLayerConsumptions: restoredFifo.stockLayerConsumptions,
            issueOuts: prev.issueOuts.map((x) => x.id === editing.id ? record : x),
          },
          currentUser, 'Issue Out', 'Edit', {
            recordRef: record.issueNo, recordId: record.id,
            details: 'Re-edit of previously Approved record (reverted stock, pending re-approval)',
          },
        );
      }

      // ── New or non-Approved edit ────────────────────────────────────────────
      const record: IssueOut = {
        id: editing?.id ?? Date.now(),
        issueNo: form.issueNo,
        issuedTo: editing?.issuedTo ?? '',
        remarks: form.remarks,
        items: cleanItems.map((it) => ({ ...it, quantity: Number(it.quantity) || 0 })),
        // Always reset to Pending on edit so re-approval is required
        status: 'Pending',
        verifiedBy: '',
        approvedBy: '',
        createdBy: editing?.createdBy ?? (currentUser?.username ?? ''),
        createdAt: editing?.createdAt ?? today(),
        uploadedToTx: false,
        preEditItems: editing?.preEditItems, // preserve existing snapshot if any
      };
      const next = editing
        ? { ...prev, issueOuts: prev.issueOuts.map((x) => x.id === editing.id ? record : x) }
        : { ...prev, issueOuts: [record, ...prev.issueOuts] };
      return appendAudit(next, currentUser, 'Issue Out', editing ? 'Edit' : 'Create', {
        recordRef: record.issueNo, recordId: record.id,
        details: `${cleanItems.length} item(s)`,
      });
    });
    setView('list');
  }

  function handleRejectEdit(io: IssueOut) {
    // Restore pre-edit items, re-apply original stock deductions, set back to Approved
    const originalItems = io.preEditItems!;
    setState((prev) => {
      const fifo = consumeFifo(
        prev,
        originalItems.map((it) => ({ itemId: it.itemId, quantity: Number(it.quantity) || 0 })),
        { sourceType: 'Issue Out', sourceRef: io.issueNo, sourceId: io.id, issueDate: io.createdAt ?? today() },
      );
      if (fifo.error) {
        alert(`Cannot restore edit — ${fifo.error}`);
        return prev;
      }
      const updatedInventory = [...prev.inventory];
      const baseMovId = nextId(prev.movements);
      const newMovements = originalItems.map((it, i) => {
        const idx = updatedInventory.findIndex((i) => i.id === it.itemId);
        if (idx >= 0) {
          updatedInventory[idx] = {
            ...updatedInventory[idx],
            quantity: updatedInventory[idx].quantity - (Number(it.quantity) || 0),
          };
        }
        return {
          id: baseMovId + i,
          itemId: it.itemId,
          date: io.createdAt ?? today(),
          type: 'Issue',
          stockType: 'Issue Out',
          reference: io.issueNo,
          quantity: -(Number(it.quantity) || 0),
          note: `${it.station} — ${it.purpose}`,
        };
      });
      const restored: IssueOut = {
        ...io,
        items: originalItems,
        status: 'Approved',
        approvedBy: io.approvedBy || currentUser?.username || 'Authorized User',
        uploadedToTx: true,
        preEditItems: undefined,
      };
      return appendAudit(
        {
          ...prev,
          inventory: updatedInventory,
          movements: [...newMovements, ...prev.movements],
          stockLayers: fifo.stockLayers,
          stockLayerConsumptions: fifo.stockLayerConsumptions,
          issueOuts: prev.issueOuts.map((x) => x.id === io.id ? restored : x),
        },
        currentUser, 'Issue Out', 'Reject Edit', {
          recordRef: io.issueNo, recordId: io.id,
          details: 'Reverted to pre-edit state and re-approved',
        },
      );
    });
  }

  function handleDelete(id: number) {
    if (!confirm('Delete this issue out form?')) return;
    setState((prev) => {
      const target = prev.issueOuts.find((x) => x.id === id);
      if (!target) return prev;

      let next: typeof prev;
      // ── Direct Issue: also delete the linked Receive In + both movements ──
      if (target.isDirectIssue) {
        const linkedReceive = (prev.receiveIns ?? []).find((r) => r.linkedIssueNo === target.issueNo);
        next = {
          ...prev,
          movements: prev.movements.filter((m) =>
            !(linkedReceive && m.receiveNo === linkedReceive.receiveNo) &&
            !(m.type === 'Issue' && m.stockType === 'Issue Out' && m.reference === target.issueNo)
          ),
          receiveIns: (prev.receiveIns ?? []).filter((r) => r.linkedIssueNo !== target.issueNo),
          issueOuts: prev.issueOuts.filter((x) => x.id !== id),
        };
      } else if (target.status === 'Approved') {
        const restoredFifo = restoreFifoSource(prev, 'Issue Out', target.issueNo);
        const restoredInventory = prev.inventory.map((inv) => {
          const total = (target.items ?? []).reduce(
            (sum, it) => (it.itemId === inv.id ? sum + (Number(it.quantity) || 0) : sum), 0
          );
          return total > 0 ? { ...inv, quantity: inv.quantity + total } : inv;
        });
        const filteredMovements = prev.movements.filter(
          (m) => !(m.type === 'Issue' && m.stockType === 'Issue Out' && m.reference === target.issueNo)
        );
        next = {
          ...prev,
          inventory: restoredInventory,
          movements: filteredMovements,
          stockLayers: restoredFifo.stockLayers,
          stockLayerConsumptions: restoredFifo.stockLayerConsumptions,
          issueOuts: prev.issueOuts.filter((x) => x.id !== id),
        };
      } else {
        next = { ...prev, issueOuts: prev.issueOuts.filter((x) => x.id !== id) };
      }
      return appendAudit(next, currentUser, 'Issue Out', 'Delete', {
        recordRef: target.issueNo, recordId: target.id,
        details: target.isDirectIssue ? 'Direct Issue' : target.status,
      });
    });
  }

  function handleApprove(io: IssueOut) {
    // Direct Issue net stock change is zero, so skip the on-hand check.
    if (!io.isDirectIssue) {
      const totals = new Map<number, number>();
      for (const it of io.items) {
        totals.set(it.itemId, (totals.get(it.itemId) ?? 0) + (Number(it.quantity) || 0));
      }
      for (const [itemId, qty] of totals) {
        const inv = state.inventory.find((i) => i.id === itemId);
        if (inv && qty > inv.quantity) {
          alert(`Cannot approve — insufficient stock:\n\n${inv.item} — issue qty ${qty} ${inv.unit} exceeds stock on hand (${inv.quantity} ${inv.unit}).`);
          return;
        }
      }
    }
    const name = currentUser?.username ?? 'Authorized User';
    setState((prev) => {
      // ── Direct Issue: log both Receive + Issue movements, flip linked ReceiveIn to Approved, no inventory change.
      if (io.isDirectIssue) {
        const ts = Date.now();
        const linkedReceive = (prev.receiveIns ?? []).find((r) => r.linkedIssueNo === io.issueNo);
        const receiveMovements = io.items.map((it, i) => ({
          id: ts + i * 2,
          receiveNo: linkedReceive?.receiveNo,
          itemId: it.itemId,
          date: linkedReceive?.date ?? today(),
          type: 'Receive',
          stockType: 'Direct Issue',
          reference: linkedReceive?.reference ?? '',
          quantity: Number(it.quantity) || 0,
          note: linkedReceive?.note ?? '',
          status: 'Approved',
          approvedBy: name,
        }));
        const issueMovements = io.items.map((it, i) => ({
          id: ts + i * 2 + 1,
          itemId: it.itemId,
          date: linkedReceive?.date ?? today(),
          type: 'Issue',
          stockType: 'Issue Out',
          reference: io.issueNo,
          quantity: -(Number(it.quantity) || 0),
          note: `Direct Issue to ${io.issuedTo}`,
          status: 'Approved',
          approvedBy: name,
        }));
        const updatedIO = { ...io, approvedBy: name, approvedDate: today(), status: 'Approved', uploadedToTx: true };
        const updatedReceiveIns = (prev.receiveIns ?? []).map((r) =>
          r.linkedIssueNo === io.issueNo ? { ...r, status: 'Approved', approvedBy: name } : r
        );
        return appendAudit(
          {
            ...prev,
            movements: [...receiveMovements, ...issueMovements, ...prev.movements],
            issueOuts: prev.issueOuts.map((x) => x.id === io.id ? updatedIO : x),
            receiveIns: updatedReceiveIns,
          },
          currentUser, 'Issue Out', 'Approve', {
            recordRef: io.issueNo, recordId: io.id,
            details: `Direct Issue to ${io.issuedTo} approved`,
          },
        );
      }

      // ── Standard Issue Out: deduct inventory, log issue movement.
      const fifo = consumeFifo(
        prev,
        io.items.map((it) => ({ itemId: it.itemId, quantity: Number(it.quantity) || 0 })),
        { sourceType: 'Issue Out', sourceRef: io.issueNo, sourceId: io.id, issueDate: today() },
      );
      if (fifo.error) {
        alert(`Cannot approve — ${fifo.error}`);
        return prev;
      }
      const updatedInventory = [...prev.inventory];
      const baseMovId = nextId(prev.movements);
      const newMovements = io.items.map((it, i) => {
        const idx = updatedInventory.findIndex((i) => i.id === it.itemId);
        if (idx >= 0) {
          updatedInventory[idx] = {
            ...updatedInventory[idx],
            quantity: updatedInventory[idx].quantity - Number(it.quantity || 0),
          };
        }
        return {
          id: baseMovId + i,
          itemId: it.itemId,
          date: today(),
          type: 'Issue',
          stockType: 'Issue Out',
          reference: io.issueNo,
          quantity: -Number(it.quantity || 0),
          note: `${it.station} — ${it.purpose}`,
        };
      });
      const updatedIssueOut = { ...io, approvedBy: name, approvedDate: today(), status: 'Approved', uploadedToTx: true };
      return appendAudit(
        {
          ...prev,
          inventory: updatedInventory,
          movements: [...newMovements, ...prev.movements],
          stockLayers: fifo.stockLayers,
          stockLayerConsumptions: fifo.stockLayerConsumptions,
          issueOuts: prev.issueOuts.map((x) => x.id === io.id ? updatedIssueOut : x),
        },
        currentUser, 'Issue Out', 'Approve', {
          recordRef: io.issueNo, recordId: io.id,
          details: `${io.items.length} item(s) deducted from stock`,
        },
      );
    });
    setDetail({ ...io, approvedBy: name, approvedDate: today(), status: 'Approved', uploadedToTx: true });
  }

  function addItem() { setItems((prev) => [...prev, blankItem()]); }
  function removeItem(idx: number) { setItems((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev); }
  function updateItem(idx: number, patch: Partial<IssueOutItem>) {
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const merged = { ...it, ...patch };
      if (patch.itemId !== undefined) {
        const inv = state.inventory.find((x) => x.id === patch.itemId);
        if (inv) {
          merged.unit = inv.unit;
          merged.description = merged.description || inv.item;
        }
      }
      return merged;
    }));
  }

  // ─────────── LIST VIEW ───────────
  if (view === 'list') return (
    <>
      <div><h2>Issue Out Form Listing</h2></div>
      <div className="listing-actions">
        <button className="btn" onClick={() => navigate('/inventory')}>Back</button>
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
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Issue No., Reference, Station…" />
        </label>
      </div>
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table className="listing-table">
          <thead>
            <tr>
              <th>Issue No.</th>
              <th>Reference No.</th>
              <th>Station(s)</th>
              <th>Approved</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shownIssue.length === 0 ? (
              <tr><td colSpan={5} className="empty">{search ? 'No records match your search.' : 'No issue out forms.'}</td></tr>
            ) : shownIssue.map((io) => (
              <tr key={io.id}>
                <td>{io.issueNo}</td>
                <td>{io.remarks || '-'}</td>
                <td>
                  {[...new Set((io.items ?? []).map((it) => it.station).filter(Boolean))].join(', ') || '-'}
                </td>
                <td>{io.approvedBy ? `${io.approvedBy} @ ${io.approvedDate || '-'}` : '-'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn" style={{ fontSize: 12, padding: '4px 10px', marginRight: 4 }} onClick={() => openDetail(io)}>View</button>
                  {canEdit && !io.isDirectIssue && <button className="btn" style={{ fontSize: 12, padding: '4px 10px', marginRight: 4 }} onClick={() => openEdit(io)}>Edit</button>}
                  {canDelete && <button className="btn danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete(io.id)}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  // ─────────── FORM VIEW ───────────
  if (view === 'form') return (
    <>
    <Modal open={saveConfirm} onClose={() => setSaveConfirm(false)} title="Confirm Save" hideClose>
      <p style={{ margin: '0 0 20px', fontSize: 14 }}>Save this Issue Out Form?</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button className="btn" type="button" onClick={() => setSaveConfirm(false)}>Cancel</button>
        <button className="btn primary" type="button" onClick={doSave}>Save</button>
      </div>
    </Modal>
    <form className="irf-editor" onSubmit={handleSave}>
      <h2 className="irf-title">
        {editing ? `Edit Issue Out Form ${form.issueNo}` : 'New Issue Out Form'}
      </h2>
      <div className="irf-toolbar">
        <button className="btn" type="button" onClick={() => setView('list')}>Back</button>
        <button className="btn primary" type="submit">Save</button>
      </div>
      <div className="irf-card">
        <div className="irf-grid">
          <label>
            Issue No.
            <input value={form.issueNo} readOnly placeholder="--Auto Generate--" style={{ background: '#f5f5f5' }} />
          </label>
          <label className="full">
            Reference No.
            <input placeholder="Reference number" value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
          </label>
        </div>

        <div className="irf-item-actions">
          <button className="btn primary" type="button" onClick={addItem}>+ Add Item</button>
        </div>

        <div className="table-wrap">
          <table className="irf-item-table">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Stock ID <span style={{ color: 'red' }}>*</span></th>
                <th style={{ width: 150 }}>Part Name <span style={{ color: 'red' }}>*</span></th>
                <th style={{ width: 90 }}>Qty <span style={{ color: 'red' }}>*</span></th>
                <th style={{ width: 70 }}>Unit <span style={{ color: 'red' }}>*</span></th>
                <th style={{ width: 180 }}>Station <span style={{ color: 'red' }}>*</span></th>
                <th style={{ width: 240 }}>Equipment</th>
                <th style={{ width: 160 }}>Purpose</th>
                <th style={{ width: 130 }}>Worker's Name</th>
                <th style={{ width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx}>
                  <StockItemPickerCells
                    itemId={it.itemId}
                    inventory={state.inventory}
                    onChange={(id, inv) => updateItem(idx, {
                      itemId: id,
                      ...(inv ? { unit: inv.unit, description: inv.item } : { unit: '', description: '' }),
                    })}
                  />
                  <td><input type="number" step="1" min="1" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: e.target.value })} /></td>
                  <td><input value={it.unit} onChange={(e) => updateItem(idx, { unit: e.target.value })} /></td>
                  <td>
                    <select value={it.station} onChange={(e) => updateItem(idx, { station: e.target.value, equipment: '' })}>
                      <option value=""></option>
                      {state.stations.map((s) => <option key={s.id} value={s.name}>{s.code ? `${s.code} - ${s.name}` : s.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={it.equipment ?? ''} onChange={(e) => updateItem(idx, { equipment: e.target.value })}>
                      <option value=""></option>
                      {(state.stations.find((s) => s.name === it.station)?.equipment ?? []).map((eq) => (
                        <option key={eq.id} value={eq.name}>{eq.code ? `${eq.code} - ${eq.name}` : eq.name}</option>
                      ))}
                    </select>
                  </td>
                  <td><input value={it.purpose} onChange={(e) => updateItem(idx, { purpose: e.target.value })} /></td>
                  <td><input value={it.workerName ?? ''} onChange={(e) => updateItem(idx, { workerName: e.target.value })} /></td>
                  <td><button className="square-btn danger" type="button" onClick={() => removeItem(idx)}>-</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </form>
    </>
  );

  // ─────────── DETAIL VIEW ───────────
  const d = state.issueOuts.find((x) => x.id === detail?.id) ?? detail!;
  return (
    <>
      <Modal open={!!actionConfirm} onClose={() => setActionConfirm(null)} title="Confirm" hideClose>
        <p style={{ margin: '0 0 20px', fontSize: 14 }}>{actionConfirm?.message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn" type="button" onClick={() => setActionConfirm(null)}>Cancel</button>
          <button className="btn primary" type="button" onClick={() => { actionConfirm?.onConfirm(); setActionConfirm(null); }}>Confirm</button>
        </div>
      </Modal>

      <Modal open={!!directIssueApprove} onClose={() => setDirectIssueApprove(null)} title={`Approve Direct Issue — ${directIssueApprove?.io.issueNo}`} wide>
        <p style={{ fontSize: 13, margin: '0 0 14px', color: 'var(--muted)' }}>
          Fill in the required details for each item before approving.
        </p>
        <div className="table-wrap">
          <table className="irf-item-table">
            <thead>
              <tr>
                <th>Part</th>
                <th style={{ width: 80 }}>Qty</th>
                <th style={{ width: 180 }}>Station <span style={{ color: 'red' }}>*</span></th>
                <th style={{ width: 200 }}>Equipment</th>
                <th style={{ width: 150 }}>Purpose</th>
                <th style={{ width: 130 }}>Worker's Name</th>
              </tr>
            </thead>
            <tbody>
              {(directIssueApprove?.items ?? []).map((it, idx) => {
                const part = state.inventory.find((x) => x.id === it.itemId);
                return (
                  <tr key={idx}>
                    <td>{part?.item || it.description || '-'}</td>
                    <td>{it.quantity} {it.unit}</td>
                    <td>
                      <select value={it.station} onChange={(e) => updateApproveItem(idx, { station: e.target.value, equipment: '' })}>
                        <option value=""></option>
                        {state.stations.map((s) => (
                          <option key={s.id} value={s.name}>{s.code ? `${s.code} - ${s.name}` : s.name}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select value={it.equipment ?? ''} onChange={(e) => updateApproveItem(idx, { equipment: e.target.value })}>
                        <option value=""></option>
                        {(state.stations.find((s) => s.name === it.station)?.equipment ?? []).map((eq) => (
                          <option key={eq.id} value={eq.name}>{eq.code ? `${eq.code} - ${eq.name}` : eq.name}</option>
                        ))}
                      </select>
                    </td>
                    <td><input value={it.purpose} onChange={(e) => updateApproveItem(idx, { purpose: e.target.value })} /></td>
                    <td><input value={it.workerName ?? ''} onChange={(e) => updateApproveItem(idx, { workerName: e.target.value })} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn" type="button" onClick={() => setDirectIssueApprove(null)}>Cancel</button>
          <button className="btn primary" type="button" onClick={doDirectIssueApprove}>Approve</button>
        </div>
      </Modal>
      <div className="listing-actions">
        <button className="btn" type="button" onClick={() => setView('list')}>Back</button>
        {canEdit && !d.isDirectIssue && <button className="btn primary" type="button" onClick={() => openEdit(d)}>Edit</button>}
        {d.preEditItems && (
          <button className="btn danger" type="button"
            onClick={() => confirmAction('Reject this edit and restore the previous approved state?', 'Reject Edit', () => handleRejectEdit(d))}>
            Reject Edit
          </button>
        )}
        {canApprove && (
          <button className="btn primary" type="button" disabled={!!d.approvedBy}
            onClick={() => {
              if (d.isDirectIssue && !d.approvedBy) {
                setDirectIssueApprove({ io: d, items: d.items.map((it) => ({ ...it })) });
              } else {
                confirmAction('Approve this Issue Out Form?', 'Approve', () => handleApprove(d));
              }
            }}>
            {d.approvedBy ? 'Approved' : 'Approve'}
          </button>
        )}
      </div>

      <div className="irf-editor" style={{ marginTop: 16 }}>
        <h2 className="irf-title">Issue Out Form — View ({d.issueNo})</h2>
        <div className="irf-card">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: 16 }}>
            <div><strong>Issue No.:</strong> {d.issueNo}</div>
            <div><strong>Status:</strong> {statusBadge(d.status || 'Pending')}</div>
            <div><strong>Created By:</strong> {d.createdBy || '-'}</div>
            <div><strong>Verified By:</strong> {d.verifiedBy || '-'}</div>
            <div><strong>Approved By:</strong> {d.approvedBy || '-'}</div>
            <div className="full" style={{ gridColumn: 'span 3' }}><strong>Reference No.:</strong> {d.remarks || '-'}</div>
          </div>
          <div className="table-wrap">
            <table className="listing-table">
              <thead>
                <tr>
                  <th>Part</th>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Station</th>
                  <th>Equipment</th>
                  <th>Purpose</th>
                  <th>Worker's Name</th>
                </tr>
              </thead>
              <tbody>
                {d.items.map((it, i) => {
                  const part = state.inventory.find((x) => x.id === it.itemId);
                  return (
                    <tr key={i}>
                      <td>{part?.item || '-'}</td>
                      <td>{it.description || '-'}</td>
                      <td>{it.quantity}</td>
                      <td>{it.unit || '-'}</td>
                      <td>{it.station || '-'}</td>
                      <td>{it.equipment || '-'}</td>
                      <td>{it.purpose || '-'}</td>
                      <td>{it.workerName || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
