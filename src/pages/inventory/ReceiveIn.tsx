import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../../components/Modal';
import { StockItemPickerCells } from '../../components/StockItemPicker';
import { formatNumber, money, today } from '../../utils/format';
import { nextReceiveNo, nextIssueNo } from '../../utils/codes';
import { hasPerm } from '../../utils/permissions';
import { appendAudit } from '../../utils/audit';
import { NoPermission } from '../../components/NoPermission';
import { receiveInHasFifoConsumption, receiveInLayers } from '../../utils/fifo';
import type { ReceiveInRecord, ReceiveInItem, IssueOut, Order } from '../../types';

type View = 'list' | 'form' | 'detail';

const blankItem = (): ReceiveInItem => ({ itemId: 0, quantity: 1, unit: '', unitPrice: undefined, sstPercent: 0 });

function statusBadge(status: string) {
  const colors: Record<string, string> = { Approved: '#198754', Pending: '#6c757d' };
  const c = colors[status] ?? colors.Pending;
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, color: '#fff', background: c }}>
      {status}
    </span>
  );
}

export default function ReceiveIn() {
  const { state, setState } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<ReceiveInRecord | null>(null);
  const [detail, setDetail] = useState<ReceiveInRecord | null>(null);
  const [saveConfirm, setSaveConfirm] = useState(false);
  const [actionConfirm, setActionConfirm] = useState<{ message: string; label: string; onConfirm: () => void } | null>(null);
  const [form, setForm] = useState({
    receiveNo: '', date: today(), stockType: 'Stock In', issuedTo: '', reference: '', note: '', poId: undefined as number | undefined, poNo: '',
    supplierId: undefined as number | undefined, supplier: '',
  });
  const [items, setItems] = useState<ReceiveInItem[]>([blankItem()]);

  const canView    = hasPerm(currentUser, 'viewReceive');
  const canCreate  = hasPerm(currentUser, 'createReceive');
  const canEdit    = hasPerm(currentUser, 'editReceive');
  const canDelete  = hasPerm(currentUser, 'deleteReceive');
  const canApprove = hasPerm(currentUser, 'approveReceive');

  if (!canView) return <NoPermission backPath="/inventory" />;

  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState<string>('10');

  const filteredReceive = (() => {
    const list = state.receiveIns ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((r) => {
      const text = `${r.receiveNo} ${r.date} ${r.stockType} ${partsSummary(r)} ${r.reference ?? ''} ${r.poNo ?? ''} ${supplierSummary(r.items, r.supplier ?? '')} ${r.status ?? 'Pending'}`.toLowerCase();
      return text.includes(q);
    });
  })();
  const shownReceive = entries === 'all' ? filteredReceive : filteredReceive.slice(0, Number(entries));

  function confirmAction(message: string, label: string, onConfirm: () => void) {
    setActionConfirm({ message, label, onConfirm });
  }

  const partName = (id: number) => state.inventory.find((i) => i.id === id)?.item ?? '-';
  const selectedPo = form.poId ? state.orders.find((po) => po.id === form.poId) : undefined;
  const supplierByName = (name: string) => state.suppliers.find((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase());

  function updateSupplierName(supplier: string) {
    const match = supplierByName(supplier);
    setForm((f) => ({ ...f, supplier, supplierId: match?.id }));
  }

  function supplierSummary(itemsForRecord: ReceiveInItem[], fallback = ''): string {
    const names = Array.from(new Set(itemsForRecord.map((it) => it.supplier?.trim()).filter(Boolean) as string[]));
    if (!names.length) return fallback;
    if (names.length === 1) return names[0];
    return `${names[0]} (+${names.length - 1} more)`;
  }

  function updateItemSupplier(idx: number, supplier: string) {
    const match = supplierByName(supplier);
    updateItem(idx, { supplier, supplierId: match?.id });
  }

  function receivedQtyForPoLine(poId: number, poItemIdx: number, excludeReceiveId?: number): number {
    return (state.receiveIns ?? []).reduce((sum, rec) => {
      if (rec.id === excludeReceiveId || rec.poId !== poId) return sum;
      return sum + rec.items.reduce((lineSum, item) =>
        item.poItemIdx === poItemIdx ? lineSum + Number(item.quantity || 0) : lineSum
      , 0);
    }, 0);
  }

  function poPendingItems(po: Order, excludeReceiveId?: number): ReceiveInItem[] {
    return (po.items ?? []).flatMap((line, idx) => {
      const ordered = Number(line.quantity || 0);
      const received = receivedQtyForPoLine(po.id, idx, excludeReceiveId);
      const pending = Math.max(0, ordered - received);
      if (!line.itemId || pending <= 0) return [];
      return [{
        itemId: line.itemId,
        quantity: pending,
        unit: line.unit,
        supplierId: po.supplierId,
        supplier: po.supplier,
        unitPrice: Number(line.unitPrice || 0),
        sstPercent: Number(line.sstPercent || 0),
        poItemIdx: idx,
      }];
    });
  }

  function isBlankItemRow(item: ReceiveInItem): boolean {
    return !item.itemId
      && !item.unit.trim()
      && !item.supplier?.trim()
      && !item.poItemIdx
      && !item.unitPrice
      && !item.sstPercent;
  }

  function savableItems(): ReceiveInItem[] {
    return items.filter((item) => !isBlankItemRow(item));
  }

  function lineTotal(item: ReceiveInItem): number {
    const gross = Number(item.quantity || 0) * Number(item.unitPrice || 0);
    return gross + gross * Number(item.sstPercent || 0) / 100;
  }

  function poHasReceivableLines(po: Order, excludeReceiveId?: number): boolean {
    return (po.items ?? []).some((line, idx) => {
      if (!line.itemId) return true;
      const ordered = Number(line.quantity || 0);
      const received = receivedQtyForPoLine(po.id, idx, excludeReceiveId);
      return Math.max(0, ordered - received) > 0;
    });
  }

  function poPendingLabel(po: Order): string {
    const unlinked = (po.items ?? []).filter((line) => !line.itemId).length;
    if (unlinked) return 'needs item link';
    const pendingRows = poPendingItems(po, editing?.id).length;
    return `${pendingRows} pending row${pendingRows === 1 ? '' : 's'}`;
  }

  function poOverReceiveMessage(): string | null {
    if (!form.poId || form.stockType !== 'Stock In') return null;
    const po = state.orders.find((order) => order.id === form.poId);
    if (!po) return null;

    for (const item of items) {
      if (item.poItemIdx == null) continue;
      const poLine = po.items?.[item.poItemIdx];
      if (!poLine) continue;
      const ordered = Number(poLine.quantity || 0);
      const alreadyReceived = receivedQtyForPoLine(po.id, item.poItemIdx, editing?.id);
      const pending = Math.max(0, ordered - alreadyReceived);
      const requested = Number(item.quantity || 0);
      if (requested > pending) {
        const name = partName(item.itemId);
        return `${name} exceeds PO pending quantity. Ordered ${ordered}, already received ${alreadyReceived}, pending ${pending}, this Receive In ${requested}.`;
      }
    }
    return null;
  }

  const receivablePos = state.orders.filter((po) =>
    po.status !== 'Cancelled'
    && !!po.approvedBy
    && !!po.goodsDeliveredBy
    && poHasReceivableLines(po, editing?.id)
  );

  function selectPo(poId: number) {
    const po = state.orders.find((o) => o.id === poId);
    setForm((f) => ({
      ...f,
      poId: po?.id,
      poNo: po?.poNo ?? '',
      supplierId: po?.supplierId,
      supplier: po?.supplier ?? '',
      reference: po?.poNo ?? f.reference,
    }));
  }

  function importSelectedPoItems() {
    if (!selectedPo) {
      alert('Select a delivered PO first.');
      return;
    }
    if (!selectedPo.goodsDeliveredBy) {
      alert(`PO ${selectedPo.poNo} is approved but not marked Goods Delivered yet.`);
      return;
    }
    const unlinked = selectedPo.items.filter((line) => !line.itemId);
    if (unlinked.length) {
      alert(`PO ${selectedPo.poNo} has ${unlinked.length} item row(s) not linked to Item File. Open the PO and use Create / Link to link an existing Item File item or create the new Item File item, then import again.`);
      return;
    }
    const pending = poPendingItems(selectedPo, editing?.id);
    if (!pending.length) {
      alert(`PO ${selectedPo.poNo} has no pending quantities to receive.`);
      return;
    }
    setItems(pending);
  }

  function partsSummary(rec: ReceiveInRecord): string {
    const names = rec.items.map((it) => partName(it.itemId)).filter(Boolean);
    if (names.length === 0) return '-';
    if (names.length === 1) return names[0];
    return `${names[0]} (+${names.length - 1} more)`;
  }

  function openNew() {
    setEditing(null);
    setForm({ receiveNo: nextReceiveNo(state), date: today(), stockType: 'Stock In', issuedTo: '', reference: '', note: '', poId: undefined, poNo: '', supplierId: undefined, supplier: '' });
    setItems([blankItem()]);
    setView('form');
  }

  function openEdit(r: ReceiveInRecord) {
    setEditing(r);
    setForm({
      receiveNo: r.receiveNo,
      date: r.date,
      stockType: r.stockType,
      issuedTo: r.issuedTo ?? '',
      reference: r.reference,
      note: r.note,
      poId: r.poId,
      poNo: r.poNo ?? '',
      supplierId: r.supplierId,
      supplier: r.supplier ?? '',
    });
    setItems(r.items.length ? r.items.map((i) => ({
      ...i,
      supplierId: i.supplierId ?? (!r.poId ? r.supplierId : undefined),
      supplier: i.supplier || (!r.poId ? (r.supplier ?? '') : ''),
    })) : [blankItem()]);
    setView('form');
  }

  function openDetail(r: ReceiveInRecord) {
    setDetail(r);
    setView('detail');
  }

  function addItem() { setItems((prev) => [...prev, blankItem()]); }
  function removeItem(idx: number) { setItems((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev); }
  function updateItem(idx: number, patch: Partial<ReceiveInItem>) {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
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
    if (form.stockType === 'Stock In' && !form.poId && cleanItems.some((it) => !it.unitPrice || Number(it.unitPrice) <= 0)) {
      alert('Unit Price is required for Stock In without PO link.');
      return;
    }
    if (form.stockType === 'Stock In' && !form.poId && cleanItems.some((it) => !it.supplier?.trim())) {
      alert('Supplier is required for every Stock In item without PO link.');
      return;
    }
    const overReceive = poOverReceiveMessage();
    if (overReceive) {
      alert(overReceive);
      return;
    }
    setSaveConfirm(true);
  }

  function doSave() {
    setSaveConfirm(false);
    const cleanItems = savableItems();
    setState((prev) => {
      const user = currentUser?.username ?? '';
      const ts = Date.now();

      if (form.stockType === 'Direct Issue') {
        // Save as Pending — approval (and movements) happens at the linked Issue Out Form.
        // Create the paired IssueOut now so the user can navigate there to approve.
        const existingIO = editing?.linkedIssueNo
          ? prev.issueOuts.find((io) => io.issueNo === editing.linkedIssueNo)
          : undefined;
        const issueNo = editing?.linkedIssueNo ?? nextIssueNo(prev);
        const newIssueOut: IssueOut = {
          id: existingIO?.id ?? ts + 10000,
          issueNo,
          issuedTo: form.issuedTo,
          remarks: form.reference || 'Direct Issue',
          items: cleanItems.map((it) => {
            const inv = prev.inventory.find((x) => x.id === it.itemId);
            return {
              itemId: it.itemId,
              description: inv?.item ?? '',
              quantity: Number(it.quantity),
              unit: it.unit,
              station: '',
              purpose: form.reference || form.note,
            };
          }),
          status: 'Pending',
          verifiedBy: '',
          approvedBy: '',
          createdBy: existingIO?.createdBy ?? user,
          createdAt: existingIO?.createdAt ?? form.date,
          uploadedToTx: false,
          isDirectIssue: true,
        };
        const newRecord: ReceiveInRecord = {
          id: editing?.id ?? ts,
          receiveNo: form.receiveNo,
          date: form.date,
          stockType: 'Direct Issue',
          issuedTo: form.issuedTo,
          reference: form.reference,
          note: form.note,
          items: cleanItems.map((it) => ({
            ...it,
            quantity: Number(it.quantity),
            supplierId: it.supplierId,
            supplier: it.supplier ?? '',
            unitPrice: Number(it.unitPrice || 0),
            sstPercent: Number(it.sstPercent || 0),
          })),
          poId: form.poId,
          poNo: form.poNo,
          status: 'Pending',
          createdBy: editing?.createdBy ?? user,
          linkedIssueNo: issueNo,
        };
        const receiveIns = editing
          ? (prev.receiveIns ?? []).map((r) => r.id === editing.id ? newRecord : r)
          : [newRecord, ...(prev.receiveIns ?? [])];
        const issueOuts = existingIO
          ? prev.issueOuts.map((io) => io.id === existingIO.id ? newIssueOut : io)
          : [newIssueOut, ...prev.issueOuts];
        return appendAudit(
          { ...prev, receiveIns, issueOuts },
          currentUser, 'Receive In', editing ? 'Edit' : 'Create', {
            recordRef: newRecord.receiveNo, recordId: newRecord.id,
            details: `Direct Issue → ${issueNo} (${cleanItems.length} item(s))`,
          },
        );
      }

      // Stock In — save as Pending, no inventory change yet
      const newRecord: ReceiveInRecord = {
        id: editing?.id ?? ts,
        receiveNo: form.receiveNo,
        date: form.date,
        stockType: 'Stock In',
        reference: form.reference,
        note: form.note,
        items: cleanItems.map((it) => ({
            ...it,
            quantity: Number(it.quantity),
            supplierId: form.poId ? form.supplierId : it.supplierId,
            supplier: form.poId ? form.supplier : (it.supplier ?? ''),
            unitPrice: Number(it.unitPrice || 0),
            sstPercent: Number(it.sstPercent || 0),
          })),
        poId: form.poId,
        poNo: form.poNo,
        supplierId: form.poId ? form.supplierId : undefined,
        supplier: form.poId ? form.supplier : supplierSummary(cleanItems),
        status: 'Pending',
        createdBy: editing?.createdBy ?? user,
      };
      const receiveIns = editing
        ? (prev.receiveIns ?? []).map((r) => r.id === editing.id ? newRecord : r)
        : [newRecord, ...(prev.receiveIns ?? [])];
      return appendAudit(
        { ...prev, receiveIns },
        currentUser, 'Receive In', editing ? 'Edit' : 'Create', {
          recordRef: newRecord.receiveNo, recordId: newRecord.id,
          details: `Stock In, ${cleanItems.length} item(s)`,
        },
      );
    });
    setView('list');
  }

  function handleApprove(r: ReceiveInRecord) {
    if (r.stockType === 'Direct Issue') {
      alert(`Direct Issue records are approved at the Issue Out Form.\n\nOpen Issue No. ${r.linkedIssueNo ?? ''} there to approve.`);
      return;
    }
    const name = currentUser?.username ?? 'Authorized User';
    const ts = Date.now();
    setState((prev) => {
      // Stock In — add to inventory
      const updatedInventory = prev.inventory.map((inv) => {
        const total = r.items.reduce((sum, it) => it.itemId === inv.id ? sum + it.quantity : sum, 0);
        return total > 0 ? { ...inv, quantity: inv.quantity + total } : inv;
      });
      const newMovements = r.items.map((it, i) => ({
        id: ts + i,
        receiveNo: r.receiveNo,
        itemId: it.itemId,
        date: r.date,
        type: 'Receive',
        stockType: 'Stock In',
        reference: r.reference,
        quantity: it.quantity,
        note: r.note,
        status: 'Approved',
        approvedBy: name,
      }));
      const existingLayers = (prev.stockLayers ?? []).filter((layer) =>
        !(layer.sourceType === 'Receive In' && layer.sourceRef === r.receiveNo)
      );
      const newLayers = receiveInLayers(r, existingLayers);
      const updatedRecord: ReceiveInRecord = { ...r, status: 'Approved', approvedBy: name, approvedDate: today() };
      return appendAudit(
        {
          ...prev,
          inventory: updatedInventory,
          movements: [...newMovements, ...prev.movements],
          stockLayers: [...newLayers, ...existingLayers],
          receiveIns: (prev.receiveIns ?? []).map((x) => x.id === r.id ? updatedRecord : x),
        },
        currentUser, 'Receive In', 'Approve', {
          recordRef: r.receiveNo, recordId: r.id,
          details: `Stock In approved, ${r.items.length} item(s)`,
        },
      );
    });
    setDetail((d) => d ? { ...d, status: 'Approved', approvedBy: name } : d);
  }

  function handleDelete(r: ReceiveInRecord) {
    if (r.status === 'Approved' && receiveInHasFifoConsumption(state, r.receiveNo)) {
      alert(`Cannot delete Receive In ${r.receiveNo} because its FIFO stock has already been issued.\n\nReverse/delete the related Issue Out or Maintenance records first.`);
      return;
    }
    if (!confirm('Delete this receive in record?')) return;
    setState((prev) => {
      let next: typeof prev;
      if (r.stockType === 'Direct Issue') {
        next = {
          ...prev,
          movements: prev.movements.filter((m) =>
            m.receiveNo !== r.receiveNo &&
            !(m.stockType === 'Issue Out' && m.reference === r.linkedIssueNo)
          ),
          issueOuts: r.linkedIssueNo
            ? prev.issueOuts.filter((io) => io.issueNo !== r.linkedIssueNo)
            : prev.issueOuts,
          receiveIns: (prev.receiveIns ?? []).filter((x) => x.id !== r.id),
        };
      } else if (r.status === 'Approved') {
        const restoredInventory = prev.inventory.map((inv) => {
          const total = r.items.reduce((sum, it) => it.itemId === inv.id ? sum + it.quantity : sum, 0);
          return total > 0 ? { ...inv, quantity: inv.quantity - total } : inv;
        });
        next = {
          ...prev,
          inventory: restoredInventory,
          movements: prev.movements.filter((m) => m.receiveNo !== r.receiveNo),
          stockLayers: (prev.stockLayers ?? []).filter((layer) => !(layer.sourceType === 'Receive In' && layer.sourceRef === r.receiveNo)),
          stockLayerConsumptions: prev.stockLayerConsumptions ?? [],
          receiveIns: (prev.receiveIns ?? []).filter((x) => x.id !== r.id),
        };
      } else {
        next = { ...prev, receiveIns: (prev.receiveIns ?? []).filter((x) => x.id !== r.id) };
      }
      return appendAudit(next, currentUser, 'Receive In', 'Delete', {
        recordRef: r.receiveNo, recordId: r.id, details: r.stockType,
      });
    });
  }

  // ─────────── LIST VIEW ───────────
  if (view === 'list') return (
    <article className="panel">
      <div className="panel-header"><h3>Receive In</h3></div>
      <div className="listing-actions" style={{ padding: '12px 16px 0' }}>
        <button className="btn" onClick={() => navigate('/inventory')}>Back</button>
        {canCreate && <button className="btn primary" onClick={openNew}>+ New</button>}
      </div>
      <div className="listing-controls" style={{ padding: '12px 16px 0' }}>
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
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Receive No., Part, Reference…" />
        </label>
      </div>
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table className="listing-table">
          <thead>
            <tr>
              <th>Receive No.</th>
              <th>Date</th>
              <th>Stock Type</th>
              <th>Supplier</th>
              <th>Part(s)</th>
              <th>Reference No.</th>
              <th>Approved</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shownReceive.length === 0 ? (
              <tr><td colSpan={8} className="empty">{search ? 'No records match your search.' : 'No receive in records.'}</td></tr>
            ) : shownReceive.map((r) => (
              <tr key={r.id}>
                <td>{r.receiveNo}</td>
                <td>{r.date}</td>
                <td>{r.stockType}</td>
                <td>{supplierSummary(r.items, r.supplier ?? '') || '-'}</td>
                <td>{partsSummary(r)}</td>
                <td>{r.reference || '-'}</td>
                <td>{r.approvedBy ? `${r.approvedBy} @ ${r.approvedDate || '-'}` : '-'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn" style={{ fontSize: 12, padding: '4px 10px', marginRight: 4 }} onClick={() => openDetail(r)}>View</button>
                  {canEdit && r.status !== 'Approved' && (
                    <button className="btn" style={{ fontSize: 12, padding: '4px 10px', marginRight: 4 }} onClick={() => openEdit(r)}>Edit</button>
                  )}
                  {canDelete && (
                    <button className="btn danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete(r)}>Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );

  // ─────────── FORM VIEW ───────────
  if (view === 'form') return (
    <>
      <Modal open={saveConfirm} onClose={() => setSaveConfirm(false)} title="Confirm Save" hideClose>
        <p style={{ margin: '0 0 20px', fontSize: 14 }}>Save this Receive In record?</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn" type="button" onClick={() => setSaveConfirm(false)}>Cancel</button>
          <button className="btn primary" type="button" onClick={doSave}>Save</button>
        </div>
      </Modal>
      <form className="irf-editor" onSubmit={handleSave}>
        <h2 className="irf-title">
          {editing ? `Edit Receive In ${form.receiveNo}` : 'New Receive In'}
        </h2>
        <div className="irf-toolbar">
          <button className="btn" type="button" onClick={() => setView('list')}>Back</button>
          <button className="btn primary" type="submit">Save</button>
        </div>
        <div className="irf-card">
          <div className="irf-grid">
            <label>
              Receive No.
              <input value={form.receiveNo} readOnly style={{ background: '#f5f5f5' }} />
            </label>
            <label>
              Date
              <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
            </label>
            <label>
              Stock Type
              {editing ? (
                <input value={form.stockType} readOnly style={{ background: '#f5f5f5' }} />
              ) : (
                <select value={form.stockType} onChange={(e) => {
                  const stockType = e.target.value;
                  setForm((f) => ({
                    ...f,
                    stockType,
                    issuedTo: '',
                    poId: stockType === 'Direct Issue' ? undefined : f.poId,
                    poNo: stockType === 'Direct Issue' ? '' : f.poNo,
                    supplierId: stockType === 'Direct Issue' ? undefined : f.supplierId,
                    supplier: stockType === 'Direct Issue' ? '' : f.supplier,
                    reference: stockType === 'Direct Issue' && f.poNo === f.reference ? '' : f.reference,
                  }));
                }}>
                  <option value="Stock In">Stock In</option>
                  <option value="Direct Issue">Direct Issue</option>
                </select>
              )}
            </label>
            {form.stockType === 'Stock In' && (
              <label>
                PO Link
                <select
                  value={form.poId ?? ''}
                  onChange={(e) => {
                    const poId = Number(e.target.value);
                    if (poId) selectPo(poId);
                    else setForm((f) => ({ ...f, poId: undefined, poNo: '', supplierId: undefined, supplier: '', reference: f.poNo === f.reference ? '' : f.reference }));
                  }}
                >
                  <option value="">No PO link</option>
                  {receivablePos.map((po) => (
                    <option key={po.id} value={po.id}>{po.poNo} - {po.supplier || 'No supplier'} ({poPendingLabel(po)})</option>
                  ))}
                </select>
              </label>
            )}
            {form.stockType === 'Stock In' && form.poId && (
              <label>
                Supplier
                <input
                  list="receive-supplier-list"
                  value={form.supplier}
                  readOnly
                  style={{ background: '#f5f5f5' }}
                  onChange={(e) => updateSupplierName(e.target.value)}
                  placeholder="From PO"
                />
              </label>
            )}
            <label>
              Reference No.
              <input value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} placeholder="PO no., DO no., etc." />
            </label>
          </div>
          <datalist id="receive-supplier-list">
            {state.suppliers.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>

          <div className="irf-item-actions">
            <button className="btn primary" type="button" onClick={addItem}>+ Add Item</button>
            {form.stockType === 'Stock In' && (
              <button className="btn" type="button" onClick={importSelectedPoItems} disabled={!selectedPo}>
                Import PO Items
              </button>
            )}
          </div>

          <div className="table-wrap">
            <table className="irf-item-table">
              <thead>
                <tr>
                  <th style={{ width: 90 }}>Stock ID <span style={{ color: 'red' }}>*</span></th>
                  <th>Part Name <span style={{ color: 'red' }}>*</span></th>
                  {form.stockType === 'Stock In' && !form.poId && <th style={{ width: 190 }}>Supplier <span style={{ color: 'red' }}>*</span></th>}
                  <th style={{ width: 90 }}>Qty <span style={{ color: 'red' }}>*</span></th>
                  <th style={{ width: 80 }}>Unit <span style={{ color: 'red' }}>*</span></th>
                  {form.stockType === 'Stock In' && <th style={{ width: 110 }}>Unit Price {!form.poId && <span style={{ color: 'red' }}>*</span>}</th>}
                  {form.stockType === 'Stock In' && <th style={{ width: 80 }}>SST %</th>}
                  {form.stockType === 'Stock In' && <th style={{ width: 110 }}>Total Price</th>}
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
                        ...(inv ? { unit: inv.unit } : { unit: '' }),
                      })}
                    />
                    {form.stockType === 'Stock In' && !form.poId && (
                      <td>
                        <input
                          list="receive-supplier-list"
                          value={it.supplier ?? ''}
                          onChange={(e) => updateItemSupplier(idx, e.target.value)}
                          placeholder="Select supplier"
                        />
                      </td>
                    )}
                    <td><input type="number" step="1" min="1" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} /></td>
                    <td><input value={it.unit} onChange={(e) => updateItem(idx, { unit: e.target.value })} /></td>
                    {form.stockType === 'Stock In' && (
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={it.unitPrice || ''}
                          readOnly={!!form.poId}
                          style={form.poId ? { background: '#f5f5f5' } : undefined}
                          onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })}
                        />
                      </td>
                    )}
                    {form.stockType === 'Stock In' && (
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={it.sstPercent ?? 0}
                          onChange={(e) => updateItem(idx, { sstPercent: Number(e.target.value) })}
                        />
                      </td>
                    )}
                    {form.stockType === 'Stock In' && (
                      <td><input readOnly value={money(lineTotal(it))} style={{ background: '#f5f5f5' }} /></td>
                    )}
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
  const d = (state.receiveIns ?? []).find((r) => r.id === detail?.id) ?? detail!;
  const dStatus = d.status ?? 'Pending';
  return (
    <>
      <Modal open={!!actionConfirm} onClose={() => setActionConfirm(null)} title="Confirm" hideClose>
        <p style={{ margin: '0 0 20px', fontSize: 14 }}>{actionConfirm?.message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn" type="button" onClick={() => setActionConfirm(null)}>Cancel</button>
          <button className="btn primary" type="button" onClick={() => { actionConfirm?.onConfirm(); setActionConfirm(null); }}>Confirm</button>
        </div>
      </Modal>
      <div className="listing-actions">
        <button className="btn" type="button" onClick={() => setView('list')}>Back</button>
        {canEdit && d.status !== 'Approved' && (
          <button className="btn primary" type="button" onClick={() => openEdit(d)}>Edit</button>
        )}
        {canApprove && d.stockType !== 'Direct Issue' && (
          <button className="btn primary" type="button" disabled={dStatus === 'Approved'}
            onClick={() => confirmAction(
              'Approve this Receive In? Stock will be added to the item file.',
              'Approve',
              () => handleApprove(d)
            )}>
            {dStatus === 'Approved' ? 'Approved' : 'Approve'}
          </button>
        )}
        {d.stockType === 'Direct Issue' && dStatus !== 'Approved' && (
          <em style={{ color: 'var(--muted)', fontSize: 13, alignSelf: 'center' }}>
            Approve this Direct Issue at the Issue Out Form ({d.linkedIssueNo ?? '-'}).
          </em>
        )}
      </div>
      <div className="irf-editor" style={{ marginTop: 16 }}>
        <h2 className="irf-title">Receive In — View ({d.receiveNo})</h2>
        <div className="irf-card">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: 16 }}>
            <div><strong>Receive No.:</strong> {d.receiveNo}</div>
            <div><strong>Date:</strong> {d.date}</div>
            <div><strong>Stock Type:</strong> {d.stockType}</div>
            {d.issuedTo && <div><strong>Issued To:</strong> {d.issuedTo}</div>}
            {d.poNo && <div><strong>PO No.:</strong> {d.poNo}</div>}
            {d.stockType === 'Stock In' && <div><strong>Supplier:</strong> {supplierSummary(d.items, d.supplier ?? '') || '-'}</div>}
            <div><strong>Reference No.:</strong> {d.reference || '-'}</div>
            <div><strong>Status:</strong> {statusBadge(dStatus)}</div>
            <div><strong>Created By:</strong> {d.createdBy || '-'}</div>
            <div><strong>Approved By:</strong> {d.approvedBy || '-'}</div>
          </div>
          <div className="table-wrap">
            <table className="listing-table">
              <thead>
                <tr>
                  <th>Part</th>
                  {d.stockType === 'Stock In' && !d.poId && <th>Supplier</th>}
                  <th>Qty</th>
                  <th>Unit</th>
                  {d.stockType === 'Stock In' && <th>Unit Price</th>}
                  {d.stockType === 'Stock In' && <th>SST %</th>}
                  {d.stockType === 'Stock In' && <th>Total Price</th>}
                </tr>
              </thead>
              <tbody>
                {d.items.map((it, i) => (
                  <tr key={i}>
                    <td>{partName(it.itemId)}</td>
                    {d.stockType === 'Stock In' && !d.poId && <td>{it.supplier || '-'}</td>}
                    <td>{it.quantity}</td>
                    <td>{it.unit}</td>
                    {d.stockType === 'Stock In' && <td>{it.unitPrice ? money(it.unitPrice) : '-'}</td>}
                    {d.stockType === 'Stock In' && <td>{formatNumber(it.sstPercent ?? 0, 2)}</td>}
                    {d.stockType === 'Stock In' && <td>{money(lineTotal(it))}</td>}
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
