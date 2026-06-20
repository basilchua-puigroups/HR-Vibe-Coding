import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../../components/Modal';
import { formatNumber, money } from '../../utils/format';
import { hasPerm } from '../../utils/permissions';
import { appendAudit } from '../../utils/audit';
import { NoPermission } from '../../components/NoPermission';
import { nextId, nextStockId } from '../../utils/codes';
import type { Category, InventoryItem } from '../../types';

function resolveCategory(input: string, categories: Category[]): Category | null {
  const text = input.trim();
  if (!text) return null;
  const dashIdx = text.indexOf(' - ');
  if (dashIdx > 0) {
    const code = text.slice(0, dashIdx).trim().toUpperCase();
    const name = text.slice(dashIdx + 3).trim().toLowerCase();
    const match = categories.find((c) => c.code.toUpperCase() === code && c.name.toLowerCase() === name);
    if (match) return match;
  }
  const upper = text.toUpperCase();
  const lower = text.toLowerCase();
  return (
    categories.find((c) => c.code.toUpperCase() === upper) ??
    categories.find((c) => c.name.toLowerCase() === lower) ??
    null
  );
}

function categoryDisplay(name: string, categories: Category[]): string {
  const c = categories.find((cat) => cat.name.toLowerCase() === name.toLowerCase());
  return c ? `${c.code} - ${c.name}` : name;
}

function stockBadge(item: InventoryItem) {
  if (item.reorder > 0 && item.quantity <= item.reorder) return <span className="badge bad">Reorder</span>;
  return <span className="badge ok">Healthy</span>;
}

type ItemSort = 'stock-id' | 'status-healthy' | 'status-reorder' | 'linked-first' | 'not-linked-first';

function stockStatusRank(item: InventoryItem): number {
  if (item.reorder > 0 && item.quantity <= item.reorder) return 0;
  return 1;
}

function poLinkedRank(linked: boolean): number { return linked ? 1 : 0; }

const norm = (value: string | undefined) => (value ?? '').trim().toLowerCase();

export default function ItemFile() {
  const { state, setState } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [detailItem, setDetailItem] = useState<InventoryItem | null>(null);

  const canView = hasPerm(currentUser, 'viewItem');
  const canCreate = hasPerm(currentUser, 'createItem');
  const canEdit = hasPerm(currentUser, 'editItem');
  const canDelete = hasPerm(currentUser, 'deleteItem');

  if (!canView) return <NoPermission backPath="/inventory" />;
  const [form, setForm] = useState({
    stockId: '', item: '', partNo: '', category: '', unit: 'pcs', reorder: 0, location: '',
  });
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState<string>('10');
  const [categoryView, setCategoryView] = useState<string>('all');
  const [itemSort, setItemSort] = useState<ItemSort>('stock-id');

  const poLinkedSet = useMemo(() => {
    const ids = new Set<number>();
    for (const order of state.orders) {
      for (const line of order.items ?? []) {
        if (line.itemId) ids.add(line.itemId);
      }
    }
    return ids;
  }, [state.orders]);

  const filtered = state.inventory
    .filter((i) => {
      const text = `${i.stockId ?? ''} ${i.item} ${i.partNo ?? ''} ${i.category} ${i.location ?? ''}`.toLowerCase();
      const matchesSearch = text.includes(search.toLowerCase());
      const matchesCategory = categoryView === 'all' || norm(i.category) === norm(categoryView);
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      if (itemSort === 'status-healthy') return stockStatusRank(b) - stockStatusRank(a) || (a.stockId || '').localeCompare(b.stockId || '', undefined, { numeric: true });
      if (itemSort === 'status-reorder') return stockStatusRank(a) - stockStatusRank(b) || (a.stockId || '').localeCompare(b.stockId || '', undefined, { numeric: true });
      if (itemSort === 'linked-first') return poLinkedRank(poLinkedSet.has(b.id)) - poLinkedRank(poLinkedSet.has(a.id)) || (a.stockId || '').localeCompare(b.stockId || '', undefined, { numeric: true });
      if (itemSort === 'not-linked-first') return poLinkedRank(poLinkedSet.has(a.id)) - poLinkedRank(poLinkedSet.has(b.id)) || (a.stockId || '').localeCompare(b.stockId || '', undefined, { numeric: true });
      return (a.stockId || '').localeCompare(b.stockId || '', undefined, { numeric: true });
    });
  const shown = entries === 'all' ? filtered : filtered.slice(0, Number(entries));
  function purchaseHistoryFor(item: InventoryItem) {
    const poRows = state.orders.flatMap((order) =>
        (order.items ?? [])
          .filter((line) => line.itemId === item.id || (!line.itemId && norm(line.description) === norm(item.item)))
          .map((line, idx) => {
            const gross = Number(line.quantity || 0) * Number(line.unitPrice || 0);
            const sst = gross * Number(line.sstPercent || 0) / 100;
            const ordered = Number(line.quantity || 0);
            const received = (state.receiveIns ?? []).reduce((sum, rec) => {
              const samePo = rec.poId === order.id || (!!rec.poNo && norm(rec.poNo) === norm(order.poNo)) || norm(rec.reference) === norm(order.poNo);
              if (!samePo || rec.status !== 'Approved') return sum;
              return sum + rec.items.reduce((lineSum, receivedLine) => {
                const sameLine = receivedLine.poItemIdx === idx;
                const sameItem = receivedLine.itemId === item.id;
                return sameLine || (receivedLine.poItemIdx == null && sameItem)
                  ? lineSum + Number(receivedLine.quantity || 0)
                  : lineSum;
              }, 0);
            }, 0);
            const pending = Math.max(0, ordered - received);
            const receiveStatus = received <= 0
              ? 'Pending Receive'
              : pending > 0
                ? 'Partial Received'
                : 'Received';
            return {
              key: `${order.id}-${idx}`,
              poId: order.id,
              poNo: order.poNo,
              date: order.date,
              supplier: order.supplier,
              ordered,
              received,
              pending,
              unit: line.unit || item.unit,
              unitPrice: Number(line.unitPrice || 0),
              sstPercent: Number(line.sstPercent || 0),
              total: gross + sst,
              poStatus: order.status || 'Ordered',
              receiveStatus,
              verifiedBy: order.verifiedBy,
              approvedBy: order.approvedBy,
            };
          })
      );
    const directReceiveRows = (state.receiveIns ?? []).flatMap((rec) => {
      if (rec.stockType !== 'Stock In' || rec.poId || rec.poNo) return [];
      return rec.items
        .filter((line) => line.itemId === item.id)
        .map((line, idx) => {
          const gross = Number(line.quantity || 0) * Number(line.unitPrice || 0);
          const sst = gross * Number(line.sstPercent || 0) / 100;
          return {
            key: `receive-${rec.id}-${idx}`,
            poId: '',
            poNo: '',
            date: rec.date,
            supplier: line.supplier || rec.supplier || '',
            ordered: 0,
            received: Number(line.quantity || 0),
            pending: 0,
            unit: line.unit || item.unit,
            unitPrice: Number(line.unitPrice || 0),
            sstPercent: Number(line.sstPercent || 0),
            total: gross + sst,
            poStatus: 'No PO',
            receiveStatus: rec.status || 'Pending Receive',
            verifiedBy: '',
            approvedBy: rec.approvedBy,
          };
        });
    });

    return [...poRows, ...directReceiveRows]
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.poNo || '').localeCompare(a.poNo || ''));
  }
  function itemUsage(item: InventoryItem) {
    const itemName = norm(item.item);
    const requests = state.requests.filter((r) =>
      r.items.some((line) => line.itemId === item.id || (!line.itemId && norm(line.description) === itemName)),
    );
    const rfqs = state.rfqs.filter((r) =>
      r.items.some((line) => line.itemId === item.id || (!line.itemId && norm(line.description) === itemName)),
    );
    const orders = state.orders.filter((o) =>
      o.items.some((line) => line.itemId === item.id || (!line.itemId && norm(line.description) === itemName)),
    );
    const receiveIns = (state.receiveIns ?? []).filter((r) => r.items.some((line) => line.itemId === item.id));
    const movements = state.movements.filter((m) => m.itemId === item.id);

    return { requests, rfqs, orders, receiveIns, movements };
  }

  function openAdd() {
    setEditing(null);
    setForm({ stockId: '', item: '', partNo: '', category: '', unit: 'pcs', reorder: 0, location: '' });
    setOpen(true);
  }

  function openEdit(i: InventoryItem) {
    setEditing(i);
    setForm({
      stockId: i.stockId ?? '',
      item: i.item, partNo: i.partNo, category: categoryDisplay(i.category, state.categories),
      unit: i.unit, reorder: i.reorder, location: i.location,
    });
    setOpen(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.item.trim()) { alert('Part Name is required.'); return; }
    if (!form.category.trim()) { alert('Category is required.'); return; }
    const match = resolveCategory(form.category, state.categories);
    if (!match) { alert('Category not found. Pick an existing category by code or name.'); return; }
    const categoryName = match.name;
    setState((prev) => {
      if (editing) {
        // Stock ID stays fixed once assigned — preserve it even if the category changes.
        // quantity is intentionally excluded from form — preserve the live stock value
        const next = { ...prev, inventory: prev.inventory.map((i) => i.id === editing.id ? { ...editing, ...form, stockId: editing.stockId, quantity: editing.quantity, category: categoryName } : i) };
        return appendAudit(next, currentUser, 'Item File', 'Edit', {
          recordRef: editing.stockId, recordId: editing.id, details: form.item,
        });
      }
      // Stock ID is auto-generated from the category code; new items always start at 0
      // (stock must be added via Receive In).
      const stockId = nextStockId(prev, match.code);
      const newItem: InventoryItem = { id: nextId(prev.inventory), ...form, stockId, quantity: 0, category: categoryName };
      return appendAudit(
        { ...prev, inventory: [...prev.inventory, newItem] },
        currentUser, 'Item File', 'Create', {
          recordRef: newItem.stockId, recordId: newItem.id, details: newItem.item,
        },
      );
    });
    setOpen(false);
  }

  function handleDelete(id: number) {
    const target = state.inventory.find((i) => i.id === id);
    if (!target) return;

    const used = itemUsage(target);
    if (used.requests.length || used.rfqs.length || used.orders.length || used.receiveIns.length || used.movements.length) {
      const parts = [
        used.requests.length ? `IRF: ${used.requests.map((r) => r.refNo).slice(0, 5).join(', ')}${used.requests.length > 5 ? ` +${used.requests.length - 5} more` : ''}` : '',
        used.rfqs.length ? `RFQ: ${used.rfqs.map((r) => r.rfqNo).slice(0, 5).join(', ')}${used.rfqs.length > 5 ? ` +${used.rfqs.length - 5} more` : ''}` : '',
        used.orders.length ? `PO: ${used.orders.map((o) => o.poNo).slice(0, 5).join(', ')}${used.orders.length > 5 ? ` +${used.orders.length - 5} more` : ''}` : '',
        used.receiveIns.length ? `Receive In: ${used.receiveIns.map((r) => r.receiveNo).slice(0, 5).join(', ')}${used.receiveIns.length > 5 ? ` +${used.receiveIns.length - 5} more` : ''}` : '',
        used.movements.length ? `Stock movements: ${used.movements.length}` : '',
      ].filter(Boolean);

      alert(`Cannot delete item "${target.item}" because it is already used in records.\n\n${parts.join('\n')}`);
      return;
    }

    if (!confirm('Delete this inventory item?')) return;
    setState((prev) => appendAudit(
      { ...prev, inventory: prev.inventory.filter((i) => i.id !== id) },
      currentUser, 'Item File', 'Delete', {
        recordRef: target?.stockId ?? String(id), recordId: id, details: target?.item,
      },
    ));
    setDetailItem(null);
  }

  const itemModal = (
    <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Inventory Part' : 'Add Inventory Part'}>
      <form className="form-grid" onSubmit={handleSave}>
        <label>
          Stock ID
          <input value={form.stockId} readOnly placeholder="Auto-generated from category" style={{ background: 'var(--muted-bg, #f1f5f9)' }} />
        </label>
        <label>
          Part Name <span style={{ color: 'red' }}>*</span>
          <input value={form.item} onChange={(e) => setForm((f) => ({ ...f, item: e.target.value }))} required />
        </label>
        <label>
          Part No.
          <input value={form.partNo} onChange={(e) => setForm((f) => ({ ...f, partNo: e.target.value }))} />
        </label>
        <label>
          Category <span style={{ color: 'red' }}>*</span>
          <input
            list="item-category-list"
            value={form.category}
            onChange={(e) => {
              const category = e.target.value;
              setForm((f) => {
                if (editing) return { ...f, category };
                const m = resolveCategory(category, state.categories);
                return { ...f, category, stockId: m ? nextStockId(state, m.code) : '' };
              });
            }}
            placeholder="Type code (C001) or name (Sterilizer)"
            required
          />
          <datalist id="item-category-list">
            {state.categories.map((c) => (
              <option key={c.id} value={`${c.code} - ${c.name}`} />
            ))}
          </datalist>
        </label>
        <label>
          Unit
          <input value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} required />
        </label>
        <label>
          Reorder Level
          <input type="number" step="1" min="0" value={form.reorder} onChange={(e) => setForm((f) => ({ ...f, reorder: Number(e.target.value) }))} />
        </label>
        <label className="full">
          Store Location
          <input
            list="item-location-list"
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            placeholder="Select or type store location"
          />
          <datalist id="item-location-list">
            {state.locations.map((l) => (
              <option key={l.id} value={l.name} />
            ))}
          </datalist>
        </label>
        <button className="btn primary full" type="submit">Save Part</button>
      </form>
    </Modal>
  );

  if (detailItem) {
    const item = state.inventory.find((i) => i.id === detailItem.id) ?? detailItem;
    const history = purchaseHistoryFor(item);

    return (
      <>
        <div className="irf-editor">
          <h2 className="irf-title">Item - View</h2>
          <div className="irf-toolbar" style={{ justifyContent: 'center', gap: 4, marginTop: 18 }}>
            {canCreate && <button className="btn primary" type="button" onClick={openAdd}>+ Add Item</button>}
            {canEdit && <button className="btn" type="button" onClick={() => openEdit(item)}>Edit</button>}
            {canDelete && <button className="btn danger" type="button" onClick={() => handleDelete(item.id)}>Delete</button>}
            <button className="btn" type="button" onClick={() => navigate('/audit-trail')}>Audit Trail</button>
            <button className="btn" type="button" style={{ marginLeft: 'auto' }} onClick={() => setDetailItem(null)}>Items Listing</button>
          </div>

          <h3 style={{ textAlign: 'center', margin: '28px 0 12px' }}>MAIN ITEM DATA</h3>
          <div className="table-wrap" style={{ maxWidth: 1228, margin: '0 auto' }}>
            <table className="listing-table">
              <tbody>
                {[
                  ['ITEM ID', item.stockId || String(item.id)],
                  ['TYPE', 'ITEM'],
                  ['CATEGORY', categoryDisplay(item.category, state.categories)],
                  ['PART NO.', item.partNo || '-'],
                  ['ITEM NAME', item.item],
                  ['UNIT OF MEASUREMENT', item.unit || '-'],
                  ['STORE LOCATION', item.location || '-'],
                  ['CURRENT STOCK', `${formatNumber(item.quantity, 2)} ${item.unit}`],
                  ['REORDER LEVEL', `${formatNumber(item.reorder, 2)} ${item.unit}`],
                ].map(([label, value]) => (
                  <tr key={label}>
                    <th style={{ width: 300, textAlign: 'right', background: '#fff' }}>{label}</th>
                    <td style={{ textAlign: 'left' }}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 style={{ textAlign: 'center', margin: '34px 0 12px' }}>SUPPLIER PRICE HISTORY</h3>
          <div className="table-wrap" style={{ maxWidth: 1228, margin: '0 auto' }}>
            <table className="listing-table">
              <thead>
                <tr>
                  <th>PO# / REF.</th>
                  <th>DATE</th>
                  <th>SUPPLIER</th>
                  <th>ORDERED</th>
                  <th>RECEIVED</th>
                  <th>PENDING</th>
                  <th>UNIT</th>
                  <th>PRICE</th>
                  <th>SST %</th>
                  <th>TOTAL</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr><td colSpan={11} className="empty">No supplier price history found for this item.</td></tr>
                ) : history.map((row) => (
                  <tr key={row.key}>
                    <td>
                      {row.poId ? (
                        <button className="btn-link" onClick={() => navigate('/procurement/orders', { state: { openPoId: row.poId } })}>{row.poNo || '-'}</button>
                      ) : row.poNo ? (
                        row.poNo
                      ) : (
                        <span className="badge neutral" title="Received directly without a Purchase Order">No PO</span>
                      )}
                    </td>
                    <td>{row.date || '-'}</td>
                    <td style={{ textAlign: 'left' }}>{row.supplier || '-'}</td>
                    <td>{formatNumber(row.ordered, 2)}</td>
                    <td>{formatNumber(row.received, 2)}</td>
                    <td>{formatNumber(row.pending, 2)}</td>
                    <td>{row.unit || '-'}</td>
                    <td>{money(row.unitPrice)}</td>
                    <td>{formatNumber(row.sstPercent ?? 0, 2)}</td>
                    <td>{money(row.total)}</td>
                    <td>{row.poStatus} / {row.receiveStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {itemModal}
      </>
    );
  }

  return (
    <>
      <div className="listing-actions">
        <button className="btn" onClick={() => navigate('/inventory')}>Back</button>
      </div>
      <article className="panel" style={{ marginTop: 16 }}>
        <div className="panel-header">
          <h3>Parts Stock Listing</h3>
          {canCreate && <button className="btn primary" onClick={openAdd}>Add Part</button>}
        </div>
        <div className="listing-controls" style={{ padding: '0 16px' }}>
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
          <label className="entries-control">
            View List&nbsp;
            <select value={categoryView} onChange={(e) => setCategoryView(e.target.value)}>
              <option value="all">All</option>
              {state.categories.map((c) => (
                <option key={c.id} value={c.name}>{c.code} - {c.name}</option>
              ))}
            </select>
          </label>
          <label className="entries-control">
            Sort By&nbsp;
            <select value={itemSort} onChange={(e) => setItemSort(e.target.value as ItemSort)}>
              <option value="stock-id">Stock ID</option>
              <option value="status-healthy">Status - Healthy First</option>
              <option value="status-reorder">Status - Reorder First</option>
              <option value="linked-first">PO Link - Linked First</option>
              <option value="not-linked-first">PO Link - Not Linked First</option>
            </select>
          </label>
          <label className="search-control">
            Search:&nbsp;
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Stock ID, Part Name, Part No…" />
          </label>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>No.</th>
                <th>Stock ID</th>
                <th>Part</th>
                <th>Category</th>
                <th>Store Location</th>
                <th>Stock</th>
                <th>Reorder</th>
                <th>Status</th>
                <th>PO Link</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan={10} className="empty">{search ? 'No items match your search.' : 'No items.'}</td></tr>
              ) : shown.map((i, idx) => (
                <tr key={i.id}>
                  <td>{idx + 1}</td>
                  <td>{i.stockId || '-'}</td>
                  <td>{i.item}</td>
                  <td>{categoryDisplay(i.category, state.categories)}</td>
                  <td>{i.location || '-'}</td>
                  <td>{formatNumber(i.quantity, 2)} {i.unit}</td>
                  <td>{formatNumber(i.reorder, 2)} {i.unit}</td>
                  <td>{stockBadge(i)}</td>
                  <td>{poLinkedSet.has(i.id) ? <span className="badge ok">Linked</span> : <span className="badge neutral">Not Linked</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn" style={{ fontSize: 12, padding: '4px 10px', marginRight: 4 }} onClick={() => setDetailItem(i)}>View</button>
                    {canEdit && <button className="btn" style={{ fontSize: 12, padding: '4px 10px', marginRight: 4 }} onClick={() => openEdit(i)}>Edit</button>}
                    {canDelete && <button className="btn danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete(i.id)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      {itemModal}

    </>
  );
}
