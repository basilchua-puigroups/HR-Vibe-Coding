import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { today, formatNumber, money } from '../../utils/format';
import { nextId, nextPoNo, nextStockId } from '../../utils/codes';
import { hasPerm } from '../../utils/permissions';
import { appendAudit } from '../../utils/audit';
import { Modal } from '../../components/Modal';
import { NoPermission } from '../../components/NoPermission';
import { ItemDescriptionInput } from '../../components/ItemDescriptionInput';
import type { Category, Order, OrderItem, InventoryItem, UserSetting } from '../../types';

function getPoLimit(defaultLimit: number | null | undefined, itemLimits: Array<{ itemId: number; limit: number }>, po: Order): number | null {
  const base = defaultLimit ?? null;
  if (!itemLimits.length) return base;
  const applicable = itemLimits
    .filter((il) => po.items.some((pi) => pi.itemId === il.itemId))
    .map((il) => il.limit);
  if (!applicable.length) return base;
  const maxSpecial = Math.max(...applicable);
  return base === null ? maxSpecial : Math.max(base, maxSpecial);
}

function getPoVerifyLimit(user: UserSetting, po: Order): number | null {
  return getPoLimit(user.verifyLimit, user.verifyItemLimits ?? [], po);
}

function getPoApprovalLimit(user: UserSetting, po: Order): number | null {
  return getPoLimit(user.approvalLimit, user.approvalItemLimits ?? [], po);
}

type View = 'list' | 'form' | 'detail';

const blankItem = (): OrderItem => ({
  reqNo: '', description: '', quantity: 0, unit: '', unitPrice: 0, sstPercent: 0,
  purpose: '', quotations: '', remarks: '', fileName: '', fileData: '',
});

function hasOrderItemName(item: OrderItem): boolean {
  return !!item.itemId || item.description.trim() !== '';
}

function isBlankOrderItem(item: OrderItem): boolean {
  return !item.itemId &&
    item.reqNo.trim() === '' &&
    item.description.trim() === '' &&
    Number(item.quantity || 0) === 0 &&
    item.unit.trim() === '' &&
    Number(item.unitPrice || 0) === 0 &&
    Number(item.sstPercent || 0) === 0 &&
    item.purpose.trim() === '' &&
    item.quotations.trim() === '' &&
    item.remarks.trim() === '' &&
    item.fileName.trim() === '' &&
    item.fileData.trim() === '';
}

function calcTotal(items: OrderItem[]): number {
  return items.reduce((sum, it) => {
    const gross = Number(it.quantity || 0) * Number(it.unitPrice || 0);
    return sum + gross + gross * Number(it.sstPercent || 0) / 100;
  }, 0);
}

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

export default function PurchaseOrder() {
  const { state, setState } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<Order | null>(null);
  const [detail, setDetail] = useState<Order | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'pending' | 'date'>('pending');
  const [entries, setEntries] = useState<string>('10');

  const canView = hasPerm(currentUser, 'viewPo');
  const canCreate = hasPerm(currentUser, 'createPo');
  const canEdit = hasPerm(currentUser, 'editPo');
  const canDelete = hasPerm(currentUser, 'deletePo');
  const canVerify  = hasPerm(currentUser, 'verifyPo');
  const canApprove = hasPerm(currentUser, 'approvePo');
  const canCreateInventoryItem = hasPerm(currentUser, 'createItem');

  const [form, setForm] = useState({
    poNo: '', date: today(), supplier: '', supplierId: undefined as number | undefined, email: '', fax: '', section: '', remarks: '',
  });
  const [items, setItems] = useState<OrderItem[]>([blankItem()]);
  const [createItemDraft, setCreateItemDraft] = useState<null | {
    orderId?: number;
    idx: number;
    existingItemId: number | '';
    item: string;
    partNo: string;
    category: string;
    stockId: string;
    unit: string;
    reorder: number;
    location: string;
  }>(null);
  const [ccrLink, setCcrLink] = useState<{ rfqId: number; ccrItemIdxs: number[] } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingUpload, setPendingUpload] = useState<{ orderId: number; type: 'do' | 'invoice' } | null>(null);
  const [popover, setPopover] = useState<{ orderId: number; type: 'do' | 'invoice'; x: number; y: number; buttonTop: number } | null>(null);

  function triggerUpload(orderId: number, type: 'do' | 'invoice') {
    setPendingUpload({ orderId, type });
    fileInputRef.current?.click();
  }

  function openFilePopover(e: React.MouseEvent<HTMLButtonElement>, orderId: number, type: 'do' | 'invoice') {
    const rect = e.currentTarget.getBoundingClientRect();
    setPopover({ orderId, type, x: rect.left, y: rect.bottom + 4, buttonTop: rect.top });
  }

  function openFileInTab(dataUrl: string) {
    const [header, base64] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)?.[1] ?? 'application/octet-stream';
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const blob = new Blob([arr], { type: mime });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  function removeFile(orderId: number, type: 'do' | 'invoice', idx: number) {
    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) => {
        if (o.id !== orderId) return o;
        return type === 'do'
          ? { ...o, doFiles: (o.doFiles ?? []).filter((_, i) => i !== idx) }
          : { ...o, invoiceFiles: (o.invoiceFiles ?? []).filter((_, i) => i !== idx) };
      }),
    }));
  }

  function setFileRefNo(orderId: number, type: 'do' | 'invoice', fileIdx: number, refNo: string) {
    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) => {
        if (o.id !== orderId) return o;
        if (type === 'do') {
          const doFiles = (o.doFiles ?? []).map((f, i) => i === fileIdx ? { ...f, refNo } : f);
          return { ...o, doFiles };
        }
        const invoiceFiles = (o.invoiceFiles ?? []).map((f, i) => i === fileIdx ? { ...f, refNo } : f);
        return { ...o, invoiceFiles };
      }),
    }));
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !pendingUpload) { e.target.value = ''; return; }
    const MAX_BYTES = 2 * 1024 * 1024; // 2 MB per file
    const oversized = files.filter((f) => f.size > MAX_BYTES);
    if (oversized.length) {
      alert(`File too large: ${oversized.map((f) => f.name).join(', ')}.\nMaximum size is 2 MB per file. Please compress the PDF and try again.`);
      e.target.value = '';
      return;
    }
    const { orderId, type } = pendingUpload;
    Promise.all(
      files.map((f) => new Promise<{ name: string; data: string }>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: f.name, data: reader.result as string });
        reader.onerror = reject;
        reader.readAsDataURL(f);
      }))
    ).then((newFiles) => {
      setState((prev) => ({
        ...prev,
        orders: prev.orders.map((o) => {
          if (o.id !== orderId) return o;
          return type === 'do'
            ? { ...o, doFiles: [...(o.doFiles ?? []), ...newFiles] }
            : { ...o, invoiceFiles: [...(o.invoiceFiles ?? []), ...newFiles] };
        }),
      }));
      setPendingUpload(null);
      e.target.value = '';
    });
  }

  // Auto-open form pre-filled when navigated from CCR "Create PO"
  const supplierByName = (name: string) =>
    state.suppliers.find((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase());
  const itemByName = (name: string) =>
    state.inventory.find((item) => item.item.trim().toLowerCase() === name.trim().toLowerCase());

  function updateSupplierName(name: string) {
    const selected = supplierByName(name);
    setForm((f) => ({
      ...f,
      supplier: name,
      supplierId: selected?.id,
      email: selected ? selected.email ?? '' : f.email,
      fax: selected ? selected.fax ?? '' : f.fax,
    }));
  }

  useEffect(() => {
    if (!location.state || typeof location.state !== 'object') return;
    if ('openPoId' in location.state) {
      const id = (location.state as { openPoId: number }).openPoId;
      const order = state.orders.find((o) => o.id === id);
      if (order) openDetail(order);
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    if (!('fromCcr' in location.state)) return;
    const fromCcr = (location.state as {
      fromCcr: { supplier: string; supplierId?: number; email?: string; fax?: string; remarks: string; items: OrderItem[]; rfqId?: number; ccrItemIdxs?: number[] };
    }).fromCcr;
    const selected = fromCcr.supplierId
      ? state.suppliers.find((s) => s.id === fromCcr.supplierId)
      : supplierByName(fromCcr.supplier);
    setEditing(null);
    setForm({
      poNo: nextPoNo(state),
      date: today(),
      supplier: fromCcr.supplier,
      supplierId: selected?.id ?? fromCcr.supplierId,
      email: selected?.email ?? fromCcr.email ?? '', fax: selected?.fax ?? fromCcr.fax ?? '', section: '',
      remarks: fromCcr.remarks,
    });
    setItems(fromCcr.items.length ? fromCcr.items : [blankItem()]);
    setCcrLink(fromCcr.rfqId !== undefined && fromCcr.ccrItemIdxs
      ? { rfqId: fromCcr.rfqId, ccrItemIdxs: fromCcr.ccrItemIdxs }
      : null);
    setView('form');
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  if (!canView) return <NoPermission backPath="/procurement" />;

  const filtered = state.orders.filter((o) => {
    const doRefs = (o.doFiles ?? []).map((f) => f.refNo ?? '').join(' ');
    const invRefs = (o.invoiceFiles ?? []).map((f) => f.refNo ?? '').join(' ');
    const text = `${o.poNo} ${o.supplier ?? ''} ${o.remarks ?? ''} ${doRefs} ${invRefs}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  const byDateDesc = (a: Order, b: Order) => {
    const d = (b.date || '').localeCompare(a.date || '');
    return d !== 0 ? d : b.id - a.id;
  };

  const sorted = sortBy === 'pending'
    ? [...filtered].sort((a, b) => {
        const rank = (o: Order) => o.status === 'Cancelled' ? 3 : o.approvedBy ? 2 : o.verifiedBy ? 1 : 0;
        const diff = rank(a) - rank(b);
        return diff !== 0 ? diff : byDateDesc(a, b);
      })
    : [...filtered].sort(byDateDesc);

  const shown = entries === 'all' ? sorted : sorted.slice(0, Number(entries));

  function itemLinkBadge(o: Order) {
    const lines = (o.items ?? []).filter((l) => (l.description || '').trim());
    if (!lines.length) return <span className="badge neutral">No Items</span>;
    const linked = lines.filter((l) => !!l.itemId).length;
    if (linked === lines.length) return <span className="badge ok">All Linked</span>;
    if (linked > 0) return <span className="badge warn">Partial</span>;
    return <span className="badge neutral">Not Linked</span>;
  }

  function openNew() {
    setEditing(null);
    setCreateItemDraft(null);
    setForm({ poNo: nextPoNo(state), date: today(), supplier: '', supplierId: undefined, email: '', fax: '', section: '', remarks: '' });
    setItems([blankItem()]);
    setCcrLink(null);
    setView('form');
  }

  function openEdit(o: Order) {
    // Clear verify/approve immediately so the PO is not "approved while being edited"
    const cleared: Order = { ...o, approvedBy: '', approvedDate: '', goodsDeliveredBy: '', goodsDeliveredDate: '' };
    setState((prev) => ({ ...prev, orders: prev.orders.map((x) => x.id === o.id ? cleared : x) }));
    setEditing(cleared);
    setCreateItemDraft(null);
    setForm({
      poNo: o.poNo, date: o.date,
      supplier: o.supplier ?? '', supplierId: o.supplierId, email: o.email ?? '', fax: o.fax ?? '',
      section: o.section ?? '', remarks: o.remarks ?? '',
    });
    setItems(o.items?.length ? o.items.map((i) => ({ ...i })) : [blankItem()]);
    setCcrLink(null);
    setView('form');
  }

  function openDetail(o: Order) {
    setDetail(o);
    setView('detail');
  }

  const [saveConfirm, setSaveConfirm] = useState(false);
  const [unapprovePrompt, setUnapprovePrompt] = useState<{ cleanItems: OrderItem[] } | null>(null);
  const [actionConfirm, setActionConfirm] = useState<{ message: string; label: string; btnClass: string; onConfirm: () => void } | null>(null);

  function confirmAction(message: string, label: string, btnClass: string, onConfirm: () => void) {
    setActionConfirm({ message, label, btnClass, onConfirm });
  }

  function commitSave(cleanItems: OrderItem[], keepDoFiles: Order['doFiles'], keepInvoiceFiles: Order['invoiceFiles']) {
    setUnapprovePrompt(null);
    setState((prev) => {
      const total = calcTotal(cleanItems);
      const linkedSupplier = form.supplierId
        ? prev.suppliers.find((s) => s.id === form.supplierId)
        : supplierByName(form.supplier);
      const linkedItems = cleanItems.map((item) => {
        if (item.itemId) return item;
        const selected = itemByName(item.description);
        return selected ? { ...item, itemId: selected.id, unit: item.unit || selected.unit } : item;
      });
      const record: Order = {
        id: editing?.id ?? Date.now(),
        poNo: form.poNo,
        date: form.date,
        supplier: form.supplier,
        supplierId: linkedSupplier?.id ?? form.supplierId,
        email: form.email || linkedSupplier?.email || '',
        fax: form.fax || linkedSupplier?.fax || '',
        section: form.section,
        remarks: form.remarks,
        status: editing?.status ?? 'Ordered',
        total,
        items: linkedItems,
        deliveryOrderNo: editing?.deliveryOrderNo ?? '',
        deliveryOrderDate: editing?.deliveryOrderDate ?? '',
        deliveryOrderFileName: editing?.deliveryOrderFileName ?? '',
        deliveryOrderFileData: editing?.deliveryOrderFileData ?? '',
        doFiles: keepDoFiles,
        invoiceFiles: keepInvoiceFiles,
        receivedQuantity: editing?.receivedQuantity ?? 0,
        verifiedBy: editing?.verifiedBy ?? '',
        verifiedDate: editing?.verifiedDate ?? '',
        approvedBy: '',
        approvedDate: '',
        goodsDeliveredBy: editing?.goodsDeliveredBy ?? '',
        goodsDeliveredDate: editing?.goodsDeliveredDate ?? '',
      };
      const ordersUpdated = editing
        ? prev.orders.map((o) => o.id === editing.id ? record : o)
        : [record, ...prev.orders];
      const rfqsUpdated = ccrLink
        ? prev.rfqs.map((r) => {
            if (r.id !== ccrLink.rfqId || !r.ccr) return r;
            const newItems = r.ccr.items.map((ci, i) =>
              ccrLink.ccrItemIdxs.includes(i) ? { ...ci, poRef: form.poNo } : ci
            );
            return { ...r, ccr: { ...r.ccr, items: newItems } };
          })
        : prev.rfqs;
      return appendAudit(
        { ...prev, orders: ordersUpdated, rfqs: rfqsUpdated },
        currentUser, 'PO', editing ? 'Edit' : 'Create', {
          recordRef: record.poNo, recordId: record.id,
          details: `${linkedItems.length} item(s), supplier ${record.supplier}, total ${money(total)}`,
        },
      );
    });

    const queueRaw = sessionStorage.getItem('pendingPoQueue');
    if (queueRaw) {
      try {
        const queue = JSON.parse(queueRaw) as Array<{
          supplier: string; supplierId?: number; email?: string; fax?: string; remarks: string; items: OrderItem[];
          rfqId?: number; ccrItemIdxs?: number[];
        }>;
        if (queue.length) {
          const [next, ...rest] = queue;
          if (rest.length) sessionStorage.setItem('pendingPoQueue', JSON.stringify(rest));
          else sessionStorage.removeItem('pendingPoQueue');
          navigate(location.pathname, { state: { fromCcr: next } });
          return;
        }
        sessionStorage.removeItem('pendingPoQueue');
      } catch {
        sessionStorage.removeItem('pendingPoQueue');
      }
    }
    setView('list');
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveConfirm(true);
  }

  function doActualSave() {
    setSaveConfirm(false);
    const cleanItems = items.filter((it) => !isBlankOrderItem(it));
    if (!cleanItems.length) { alert('At least one item is required before saving this PO.'); return; }
    const missingItemIdx = items.findIndex((it) => !isBlankOrderItem(it) && !hasOrderItemName(it));
    if (missingItemIdx >= 0) {
      alert(`Item row ${missingItemIdx + 1} needs an item description. Delete the row if it was added accidentally.`);
      return;
    }
    if (!form.supplier.trim()) { alert('Supplier is required.'); return; }
    const dupPoNo = state.orders.some(
      (o) => o.poNo.trim().toLowerCase() === form.poNo.trim().toLowerCase() && o.id !== editing?.id
    );
    if (dupPoNo) { alert(`PO No. "${form.poNo.trim()}" is already in use. Please use a different PO No.`); return; }

    if (editing?.approvedBy && !!(editing.doFiles?.length || editing.invoiceFiles?.length)) {
      setUnapprovePrompt({ cleanItems });
      return;
    }
    commitSave(cleanItems, editing?.doFiles, editing?.invoiceFiles);
  }

  function handleDelete(id: number) {
    if (!confirm('Delete this PO?')) return;
    const target = state.orders.find((o) => o.id === id);
    setState((prev) => {
      const t = prev.orders.find((o) => o.id === id);
      const poNo = t?.poNo;
      const rfqsCleared = poNo
        ? prev.rfqs.map((r) => {
            if (!r.ccr?.items?.some((ci) => ci.poRef === poNo)) return r;
            const newItems = r.ccr.items.map((ci) =>
              ci.poRef === poNo ? { ...ci, poRef: undefined } : ci
            );
            return { ...r, ccr: { ...r.ccr, items: newItems } };
          })
        : prev.rfqs;
      return appendAudit(
        { ...prev, orders: prev.orders.filter((o) => o.id !== id), rfqs: rfqsCleared },
        currentUser, 'PO', 'Delete', { recordRef: target?.poNo, recordId: id },
      );
    });
  }

  function handleVerify(o: Order) {
    if (currentUser && !currentUser.isAdmin && !hasPerm(currentUser, 'manageProcurementUsers')) {
      const limit = getPoVerifyLimit(currentUser, o);
      const total = calcTotal(o.items ?? []);
      if (limit === null) {
        alert('You do not have a verify limit set. Contact your administrator.');
        return;
      }
      if (total > limit) {
        alert(`PO total ${money(total)} exceeds your verify limit of ${money(limit)}.`);
        return;
      }
    }
    const name = currentUser?.username ?? 'Authorized User';
    const updated = { ...o, verifiedBy: name, verifiedDate: today() };
    setState((prev) => appendAudit(
      { ...prev, orders: prev.orders.map((x) => x.id === o.id ? updated : x) },
      currentUser, 'PO', 'Verify', { recordRef: o.poNo, recordId: o.id },
    ));
    setDetail(updated);
  }

  function handleApprove(o: Order) {
    if (currentUser && !currentUser.isAdmin && !hasPerm(currentUser, 'manageProcurementUsers')) {
      const limit = getPoApprovalLimit(currentUser, o);
      const total = calcTotal(o.items ?? []);
      if (limit === null) {
        alert('You do not have an approval limit set. Contact your administrator.');
        return;
      }
      if (total > limit) {
        alert(`PO total ${money(total)} exceeds your approval limit of ${money(limit)}.`);
        return;
      }
    }
    const name = currentUser?.username ?? 'Authorized User';
    const updated = { ...o, approvedBy: name, approvedDate: today() };
    setState((prev) => appendAudit(
      { ...prev, orders: prev.orders.map((x) => x.id === o.id ? updated : x) },
      currentUser, 'PO', 'Approve', { recordRef: o.poNo, recordId: o.id },
    ));
    setDetail(updated);
  }

  function handleGoodsDelivered(o: Order) {
    if (!o.approvedBy) {
      alert('Approve this PO before marking goods delivered.');
      return;
    }
    const name = currentUser?.username ?? 'Authorized User';
    const updated = { ...o, goodsDeliveredBy: name, goodsDeliveredDate: today() };
    setState((prev) => appendAudit(
      { ...prev, orders: prev.orders.map((x) => x.id === o.id ? updated : x) },
      currentUser, 'PO', 'Goods Delivered', { recordRef: o.poNo, recordId: o.id },
    ));
    setDetail(updated);
  }

  function handleCancel(o: Order) {
    const updated = { ...o, status: 'Cancelled' };
    setState((prev) => appendAudit(
      { ...prev, orders: prev.orders.map((x) => x.id === o.id ? updated : x) },
      currentUser, 'PO', 'Cancel', { recordRef: o.poNo, recordId: o.id },
    ));
    setDetail(updated);
  }

  // ── item row helpers ──
  function updateItem(idx: number, patch: Partial<OrderItem>) {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }
  function updateItemDescription(idx: number, description: string, selected?: InventoryItem) {
    updateItem(idx, selected
      ? { itemId: selected.id, description: selected.item, unit: selected.unit }
      : { itemId: undefined, description }
    );
  }
  function linkPoRowToItem(idx: number, item: InventoryItem) {
    updateItem(idx, { itemId: item.id, description: item.item, unit: item.unit });
  }
  function linkOrderRowToItem(orderId: number, idx: number, item: InventoryItem) {
    let updatedOrder: Order | null = null;
    setState((prev) => {
      const orders = prev.orders.map((order) => {
        if (order.id !== orderId) return order;
        const linkedItems = (order.items ?? []).map((line, i) =>
          i === idx ? { ...line, itemId: item.id, description: item.item, unit: line.unit || item.unit } : line
        );
        updatedOrder = { ...order, items: linkedItems };
        return updatedOrder;
      });
      return appendAudit(
        { ...prev, orders },
        currentUser, 'PO', 'Link Item File', {
          recordRef: updatedOrder?.poNo,
          recordId: orderId,
          details: `Line ${idx + 1} linked to Item File ${item.item}`,
        },
      );
    });
    if (detail?.id === orderId && updatedOrder) setDetail(updatedOrder);
  }
  function openCreateItem(idx: number) {
    const line = items[idx];
    const name = line.description.trim();
    if (!name) {
      alert('Enter an item description first.');
      return;
    }
    const existing = itemByName(name);
    if (existing) {
      if (confirm(`Item "${name}" already exists in Item File as "${existing.item}". Link this PO row to that existing item?`)) {
        linkPoRowToItem(idx, existing);
      }
      return;
    }
    const defaultCategory = state.categories[0];
    setCreateItemDraft({
      idx,
      existingItemId: '',
      item: name,
      partNo: '',
      category: defaultCategory ? `${defaultCategory.code} - ${defaultCategory.name}` : '',
      stockId: defaultCategory ? nextStockId(state, defaultCategory.code) : '',
      unit: line.unit || 'pcs',
      reorder: 0,
      location: '',
    });
  }
  function openCreateItemFromOrder(order: Order, idx: number) {
    const line = order.items?.[idx];
    const name = line?.description.trim() ?? '';
    if (!name) {
      alert('This PO row has no item description.');
      return;
    }
    const existing = itemByName(name);
    if (existing) {
      if (confirm(`Item "${name}" already exists in Item File as "${existing.item}". Link this PO row to that existing item?`)) {
        linkOrderRowToItem(order.id, idx, existing);
      }
      return;
    }
    const defaultCategory = state.categories[0];
    setCreateItemDraft({
      orderId: order.id,
      idx,
      existingItemId: '',
      item: name,
      partNo: '',
      category: defaultCategory ? `${defaultCategory.code} - ${defaultCategory.name}` : '',
      stockId: defaultCategory ? nextStockId(state, defaultCategory.code) : '',
      unit: line?.unit || 'pcs',
      reorder: 0,
      location: '',
    });
  }
  function updateCreateItemDraft(patch: Partial<NonNullable<typeof createItemDraft>>) {
    setCreateItemDraft((draft) => {
      if (!draft) return draft;
      const next = { ...draft, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, 'category')) {
        const category = resolveCategory(next.category, state.categories);
        next.stockId = category ? nextStockId(state, category.code) : '';
      }
      return next;
    });
  }
  function handleCreateItemFromPo(e: React.FormEvent) {
    e.preventDefault();
    if (!createItemDraft) return;
    const name = createItemDraft.item.trim();
    if (!name) {
      alert('Part Name is required.');
      return;
    }
    const existing = itemByName(name);
    if (existing) {
      if (confirm(`Item "${name}" already exists in Item File as "${existing.item}". Link this PO row to that existing item?`)) {
        if (createItemDraft.orderId) linkOrderRowToItem(createItemDraft.orderId, createItemDraft.idx, existing);
        else linkPoRowToItem(createItemDraft.idx, existing);
        setCreateItemDraft(null);
      }
      return;
    }
    const category = resolveCategory(createItemDraft.category, state.categories);
    if (!category) {
      alert('Select a valid Item File category.');
      return;
    }
    const newItem: InventoryItem = {
      id: nextId(state.inventory),
      stockId: nextStockId(state, category.code),
      item: name,
      partNo: createItemDraft.partNo.trim(),
      category: category.name,
      quantity: 0,
      unit: createItemDraft.unit.trim() || 'pcs',
      reorder: Number(createItemDraft.reorder || 0),
      location: createItemDraft.location.trim(),
    };
    setState((prev) => appendAudit(
      { ...prev, inventory: [newItem, ...prev.inventory] },
      currentUser, 'Item File', 'Create', {
        recordRef: newItem.item,
        recordId: newItem.id,
        details: `Created from PO ${createItemDraft.orderId ? state.orders.find((o) => o.id === createItemDraft.orderId)?.poNo ?? 'view' : form.poNo || 'draft'} line ${createItemDraft.idx + 1}`,
      },
    ));
    if (createItemDraft.orderId) linkOrderRowToItem(createItemDraft.orderId, createItemDraft.idx, newItem);
    else linkPoRowToItem(createItemDraft.idx, newItem);
    setCreateItemDraft(null);
  }
  function handleLinkExistingItemFromPo() {
    if (!createItemDraft) return;
    const selected = state.inventory.find((item) => item.id === Number(createItemDraft.existingItemId));
    if (!selected) {
      alert('Select an existing Item File item to link.');
      return;
    }
    if (createItemDraft.orderId) linkOrderRowToItem(createItemDraft.orderId, createItemDraft.idx, selected);
    else linkPoRowToItem(createItemDraft.idx, selected);
    setCreateItemDraft(null);
  }
  function addItem() { setItems((prev) => [...prev, blankItem()]); }
  function removeItem(idx: number) {
    setItems((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);
  }

  function rowClass(o: Order): string {
    if (o.status === 'Cancelled') return 'po-row-cancelled';
    if (o.approvedBy) return 'po-row-approved';
    if (o.verifiedBy) return 'po-row-verified';
    return 'po-row-pending';
  }

  // ─────────────────────────────────────────────────────────
  // LIST VIEW
  // ─────────────────────────────────────────────────────────
  if (view === 'list') return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileSelected}
      />
      <div><h2>Purchase Orders</h2></div>
      <div className="listing-actions">
        <button className="btn" onClick={() => navigate('/procurement')}>Back</button>
        {canCreate && <button className="btn primary" onClick={openNew}>Create PO</button>}
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
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'pending' | 'date')}>
            <option value="pending">Pending / Verified First</option>
            <option value="date">Show Latest First</option>
          </select>
          <label className="search-control">
            Search:&nbsp;
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="PO No., supplier or remarks" />
          </label>
        </div>
      </div>
      <div className="table-wrap">
        <table className="listing-table">
          <thead>
            <tr>
              <th>PO No.</th>
              <th>Date</th>
              <th>Supplier</th>
              <th>Remarks</th>
              <th>Total</th>
              <th>Verified</th>
              <th>Approved</th>
              <th style={{ textAlign: 'center' }}>Item Link</th>
              <th style={{ textAlign: 'center' }}>DO/Invoice</th>
              <th style={{ textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={10} className="empty">No purchase orders found.</td></tr>
            ) : shown.map((o) => (
              <tr key={o.id} className={rowClass(o)}>
                <td>{o.poNo}</td>
                <td>{o.date}</td>
                <td>{o.supplier || '-'}</td>
                <td>{o.remarks || '-'}</td>
                <td>{money(o.total ?? 0)}</td>
                <td>{o.verifiedBy ? `${o.verifiedBy} @ ${o.verifiedDate || '-'}` : '-'}</td>
                <td>{o.approvedBy ? `${o.approvedBy} @ ${o.approvedDate || '-'}` : '-'}</td>
                <td style={{ textAlign: 'center' }}>{itemLinkBadge(o)}</td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                  {(() => {
                    const approved = !!o.approvedBy;
                    const doFiles = o.doFiles ?? [];
                    const invFiles = o.invoiceFiles ?? [];
                    const doLabel = doFiles.length ? `DO (${doFiles.length})` : 'DO';
                    const invLabel = invFiles.length ? `Inv (${invFiles.length})` : 'Invoice';
                    const doHasContent = !!doFiles.length;
                    const invHasContent = !!invFiles.length;
                    return (
                      <>
                        <button
                          className="btn"
                          style={{ fontSize: 11, padding: '3px 8px', marginRight: 4, opacity: approved ? 1 : 0.45, cursor: approved ? 'pointer' : 'not-allowed' }}
                          title={!approved ? 'PO must be approved before uploading DO' : doHasContent ? 'Click to view / manage DO' : 'Upload DO (image/PDF)'}
                          disabled={!approved}
                          onClick={(e) => doHasContent ? openFilePopover(e, o.id, 'do') : triggerUpload(o.id, 'do')}
                        >{doLabel}</button>
                        <button
                          className="btn"
                          style={{ fontSize: 11, padding: '3px 8px', opacity: approved ? 1 : 0.45, cursor: approved ? 'pointer' : 'not-allowed' }}
                          title={!approved ? 'PO must be approved before uploading Invoice' : invHasContent ? 'Click to view / manage Invoice' : 'Upload Invoice (image/PDF)'}
                          disabled={!approved}
                          onClick={(e) => invHasContent ? openFilePopover(e, o.id, 'invoice') : triggerUpload(o.id, 'invoice')}
                        >{invLabel}</button>
                      </>
                    );
                  })()}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn" style={{ fontSize: 12, padding: '4px 10px', marginRight: 4 }} onClick={() => openDetail(o)}>View</button>
                  {canEdit && <button className="btn" style={{ fontSize: 12, padding: '4px 10px', marginRight: 4 }} onClick={() => openEdit(o)}>Edit</button>}
                  {canDelete && <button className="btn danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete(o.id)}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {popover && (() => {
        const po = state.orders.find((o) => o.id === popover.orderId);
        const files = popover.type === 'do' ? (po?.doFiles ?? []) : (po?.invoiceFiles ?? []);
        const label = popover.type === 'do' ? 'Delivery Order' : 'Invoice';
        const placeholder = popover.type === 'do' ? 'e.g. DO-2024-001' : 'e.g. INV-2024-001';
        const popoverWidth = 360;
        const estimatedHeight = 60 + files.length * 36;
        const spaceBelow = window.innerHeight - popover.y;
        const flipUp = spaceBelow < estimatedHeight + 16;
        const posTop = flipUp ? Math.max(8, popover.buttonTop - estimatedHeight - 8) : popover.y;
        const posLeft = Math.min(popover.x, window.innerWidth - popoverWidth - 12);
        return createPortal(
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setPopover(null)} />
            <div style={{
              position: 'fixed', left: posLeft, top: posTop, zIndex: 9999,
              background: 'var(--panel-bg, #fff)', border: '1px solid var(--border, #ddd)',
              borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.18)', padding: 12, minWidth: 320, maxWidth: 420,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13 }}>{label} Files</div>
              {files.length === 0 && <div style={{ fontSize: 12, color: '#aaa', marginBottom: 8 }}>No files uploaded yet.</div>}
              {files.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr auto', gap: '4px 6px', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>Ref / Number</div>
                  <div style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>File</div>
                  <div />
                  {files.map((f, i) => (
                    <>
                      <input
                        key={`ref-${i}`}
                        type="text"
                        value={f.refNo ?? ''}
                        placeholder={placeholder}
                        style={{ fontSize: 11, padding: '3px 6px', border: '1px solid var(--border, #ccc)', borderRadius: 4, minWidth: 0 }}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setFileRefNo(popover.orderId, popover.type, i, e.target.value)}
                      />
                      <button
                        key={`file-${i}`}
                        className="btn"
                        style={{ fontSize: 11, padding: '3px 8px', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
                        title={`Open ${f.name}`}
                        onClick={() => openFileInTab(f.data)}
                      >{f.name}</button>
                      <button
                        key={`del-${i}`}
                        className="btn danger"
                        style={{ fontSize: 11, padding: '3px 7px' }}
                        title="Remove file"
                        onClick={() => removeFile(popover.orderId, popover.type, i)}
                      >×</button>
                    </>
                  ))}
                </div>
              )}
              <button
                className="btn primary"
                style={{ fontSize: 11, padding: '4px 10px', width: '100%', marginTop: 6 }}
                onClick={() => { setPopover(null); triggerUpload(popover.orderId, popover.type); }}
              >+ Add files</button>
            </div>
          </>, document.body
        );
      })()}
    </>
  );

  // ─────────────────────────────────────────────────────────
  // FORM VIEW
  // ─────────────────────────────────────────────────────────
  if (view === 'form') {
    const totalLive = calcTotal(items);
    return (
      <>
      <Modal open={saveConfirm} onClose={() => setSaveConfirm(false)} title="Confirm Save" hideClose>
        <p style={{ margin: '0 0 20px', fontSize: 14 }}>Do you want to save this Purchase Order?</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn" type="button" onClick={() => setSaveConfirm(false)}>Cancel</button>
          <button className="btn primary" type="button" onClick={doActualSave}>Save</button>
        </div>
      </Modal>
      {unapprovePrompt && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 28, maxWidth: 400, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Unapprove PO</div>
            <div style={{ fontSize: 13, color: '#333', marginBottom: 24 }}>
              Saving will unapprove this PO. Do you also want to delete the uploaded DO / Invoice files?
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                className="btn primary"
                type="button"
                style={{ minWidth: 130 }}
                onClick={() => commitSave(unapprovePrompt.cleanItems, editing?.doFiles, editing?.invoiceFiles)}
              >Keep DO &amp; Invoice</button>
              <button
                className="btn danger"
                type="button"
                style={{ minWidth: 130 }}
                onClick={() => commitSave(unapprovePrompt.cleanItems, undefined, undefined)}
              >Delete Files</button>
            </div>
          </div>
        </div>
      )}
      <form className="irf-editor" onSubmit={handleSave}>
        <h2 className="irf-title">
          {editing ? `Purchase Order - Edit (${form.poNo})` : 'Purchase Order - Create'}
        </h2>
        <div className="irf-toolbar">
          <button className="btn" type="button" onClick={() => setView('list')}>Back</button>
          <button className="btn primary" type="submit">Save</button>
        </div>

        <div className="irf-card">
          <div className="irf-grid">
            <label>
              Supplier
              <input list="po-supplier-list" placeholder="Type supplier name..." value={form.supplier}
                onChange={(e) => updateSupplierName(e.target.value)} required />
            </label>
            <label>
              Email
              <input type="email" placeholder="supplier@email.com" value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </label>
            <label>
              Fax
              <input placeholder="Fax number" value={form.fax}
                onChange={(e) => setForm((f) => ({ ...f, fax: e.target.value }))} />
            </label>
            <label>
              Date
              <input type="date" value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
            </label>
            <label>
              PO No.
              <input value={form.poNo} onChange={(e) => setForm((f) => ({ ...f, poNo: e.target.value }))} required />
            </label>
            <label>
              Section
              <input placeholder="e.g. Engineering, Admin" value={form.section}
                onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))} />
            </label>
            <label className="full">
              Remarks
              <input placeholder="Quotation ref, urgency…" value={form.remarks}
                onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
            </label>
            <label className="full">
              Total LPO Value (RM)
              <input readOnly value={money(totalLive)} />
            </label>
          </div>
          <datalist id="po-supplier-list">
            {state.suppliers.map((s) => <option key={s.id} value={s.name} />)}
          </datalist>
        </div>

        <div className="irf-card">
          <div className="table-wrap">
            <table className="listing-table" style={{ minWidth: 1320 }}>
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Item Description</th>
                  <th>Item File</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>U'Price</th>
                  <th>Gross</th>
                  <th>SST %</th>
                  <th>SST (RM)</th>
                  <th>Total</th>
                  <th>Purpose</th>
                  <th>Remarks</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const gross = Number(it.quantity || 0) * Number(it.unitPrice || 0);
                  const sstAmt = gross * Number(it.sstPercent || 0) / 100;
                  const rowTotal = gross + sstAmt;
                  return (
                    <tr key={idx}>
                      <td><input style={{ width: 55 }} value={it.reqNo} onChange={(e) => updateItem(idx, { reqNo: e.target.value })} /></td>
                      <td>
                        <ItemDescriptionInput
                          value={it.description}
                          inventory={state.inventory}
                          onChange={(desc, selected) => updateItemDescription(idx, desc, selected)}
                        />
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {it.itemId ? (
                          <span className="badge ok">Linked</span>
                        ) : (
                          <button
                            className="btn"
                            type="button"
                            style={{ fontSize: 12, padding: '4px 10px' }}
                            disabled={!it.description.trim()}
                            title="Create or link Item File"
                            onClick={() => openCreateItem(idx)}
                          >
                            Create / Link
                          </button>
                        )}
                      </td>
                      <td><input style={{ width: 65 }} type="number" step="1" min="0" value={it.quantity || ''} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} /></td>
                      <td><input style={{ width: 50 }} value={it.unit} onChange={(e) => updateItem(idx, { unit: e.target.value })} /></td>
                      <td><input style={{ width: 75 }} type="number" step="0.01" min="0" value={it.unitPrice || ''} onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })} /></td>
                      <td><input style={{ width: 75 }} readOnly value={money(gross)} /></td>
                      <td><input style={{ width: 55 }} type="number" step="0.01" min="0" value={it.sstPercent || ''} onChange={(e) => updateItem(idx, { sstPercent: Number(e.target.value) })} /></td>
                      <td><input style={{ width: 75 }} readOnly value={money(sstAmt)} /></td>
                      <td><input style={{ width: 75 }} readOnly value={money(rowTotal)} /></td>
                      <td><input style={{ width: 90 }} value={it.purpose} onChange={(e) => updateItem(idx, { purpose: e.target.value })} /></td>
                      <td><input style={{ width: 90 }} value={it.remarks} onChange={(e) => updateItem(idx, { remarks: e.target.value })} /></td>
                      <td><button className="square-btn danger" type="button" onClick={() => removeItem(idx)}>×</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 10 }}>
            <button className="btn primary" type="button" onClick={addItem}>+ Add Row</button>
          </div>
        </div>
      </form>
      <Modal open={!!createItemDraft} onClose={() => setCreateItemDraft(null)} title="Link or Create Item File from PO">
        {createItemDraft && (
          <form className="form-grid" onSubmit={handleCreateItemFromPo}>
            <label className="full">
              Link Existing Item File
              <select value={createItemDraft.existingItemId} onChange={(e) => updateCreateItemDraft({ existingItemId: e.target.value ? Number(e.target.value) : '' })}>
                <option value="">Select existing item...</option>
                {state.inventory.map((item) => (
                  <option key={item.id} value={item.id}>
                    {[item.stockId, item.item, item.partNo].filter(Boolean).join(' - ')}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn full" type="button" onClick={handleLinkExistingItemFromPo}>Link Existing Item</button>
            <label>
              Stock ID
              <input value={createItemDraft.stockId} readOnly placeholder="Auto-generated from category" style={{ background: 'var(--muted-bg, #f1f5f9)' }} />
            </label>
            <label>
              Part Name <span style={{ color: 'red' }}>*</span>
              <input value={createItemDraft.item} onChange={(e) => updateCreateItemDraft({ item: e.target.value })} required />
            </label>
            <label>
              Part No.
              <input value={createItemDraft.partNo} onChange={(e) => updateCreateItemDraft({ partNo: e.target.value })} />
            </label>
            <label>
              Category <span style={{ color: 'red' }}>*</span>
              <input
                list="po-item-category-list"
                value={createItemDraft.category}
                onChange={(e) => updateCreateItemDraft({ category: e.target.value })}
                placeholder="Type code (C001) or name"
                required
              />
              <datalist id="po-item-category-list">
                {state.categories.map((c) => (
                  <option key={c.id} value={`${c.code} - ${c.name}`} />
                ))}
              </datalist>
            </label>
            <label>
              Unit
              <input value={createItemDraft.unit} onChange={(e) => updateCreateItemDraft({ unit: e.target.value })} required />
            </label>
            <label>
              Reorder Level
              <input type="number" step="1" min="0" value={createItemDraft.reorder} onChange={(e) => updateCreateItemDraft({ reorder: Number(e.target.value) })} />
            </label>
            <label className="full">
              Store Location
              <input
                list="po-item-location-list"
                value={createItemDraft.location}
                onChange={(e) => updateCreateItemDraft({ location: e.target.value })}
                placeholder="Select or type store location"
              />
              <datalist id="po-item-location-list">
                {state.locations.map((l) => (
                  <option key={l.id} value={l.name} />
                ))}
              </datalist>
            </label>
            <button className="btn primary full" type="submit" disabled={!canCreateInventoryItem} title={!canCreateInventoryItem ? 'No permission to create Item File' : undefined}>Create Item</button>
          </form>
        )}
      </Modal>
      </>
    );
  }

  // ─────────────────────────────────────────────────────────
  // DETAIL VIEW
  // ─────────────────────────────────────────────────────────
  const d = state.orders.find((o) => o.id === detail?.id) ?? detail!;
  const cancelled = d.status === 'Cancelled';
  const total = calcTotal(d.items ?? []);
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
      <h2 className="irf-title">Purchase Order - View ({d.poNo})</h2>
      <div className="irf-toolbar">
        <button className="btn" type="button" onClick={() => setView('list')}>Back</button>
        {!cancelled && canEdit && (
          <button className="btn primary" type="button" onClick={() => confirmAction('Open this PO for editing? The approval will be cleared upon saving.', 'Edit', 'btn primary', () => openEdit(d))}>Edit</button>
        )}
        {!cancelled && canVerify && (
          <button className="btn primary" type="button" disabled={!!d.verifiedBy} onClick={() => confirmAction('Verify this Purchase Order?', 'Verify', 'btn primary', () => handleVerify(d))}>
            {d.verifiedBy ? 'Verified' : 'Verify'}
          </button>
        )}
        {!cancelled && canApprove && (
          <button className="btn primary" type="button" disabled={!!d.approvedBy} onClick={() => confirmAction('Approve this Purchase Order?', 'Approve', 'btn primary', () => handleApprove(d))}>
            {d.approvedBy ? 'Approved' : 'Approve'}
          </button>
        )}
        {!cancelled && canEdit && d.approvedBy && (
          <button className="btn primary" type="button" disabled={!!d.goodsDeliveredBy} onClick={() => confirmAction('Mark this PO goods delivered?', 'Goods Delivered', 'btn primary', () => handleGoodsDelivered(d))}>
            {d.goodsDeliveredBy ? 'Goods Delivered' : 'Goods Delivered'}
          </button>
        )}
        {!cancelled && canDelete && (
          <button className="btn danger" type="button" onClick={() => confirmAction('Cancel this PO? This cannot be undone.', 'Cancel PO', 'btn danger', () => handleCancel(d))}>Cancel PO</button>
        )}
      </div>

      <div className="panel">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: 16 }}>
          <div>
            <div><strong>SUPPLIER:</strong> {d.supplier || '-'}</div>
            <div><strong>EMAIL:</strong> {d.email || '-'}</div>
            <div><strong>FAX:</strong> {d.fax || '-'}</div>
            <div><strong>REMARKS:</strong> {d.remarks || '-'}</div>
            <div><strong>STATUS:</strong> {d.status || 'Ordered'}</div>
            <div><strong>DO NO.:</strong> {d.deliveryOrderNo || '-'}</div>
          </div>
          <div>
            <div><strong>PO NO.:</strong> {d.poNo}</div>
            <div><strong>PO DATE:</strong> {d.date}</div>
            <div><strong>SECTION:</strong> {d.section || '-'}</div>
            <div><strong>VERIFIED BY:</strong> {d.verifiedBy ? `${d.verifiedBy} @ ${d.verifiedDate}` : '-'}</div>
            <div><strong>APPROVED BY:</strong> {d.approvedBy ? `${d.approvedBy} @ ${d.approvedDate}` : '-'}</div>
            <div><strong>GOODS DELIVERED:</strong> {d.goodsDeliveredBy ? `${d.goodsDeliveredBy} @ ${d.goodsDeliveredDate}` : '-'}</div>
            <div style={{ marginTop: 8, fontWeight: 700 }}>
              TOTAL LPO VALUE: {money(total)}
            </div>
          </div>
        </div>
      </div>

      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table className="listing-table">
          <thead>
            <tr>
              <th>No.</th>
              <th style={{ textAlign: 'left' }}>Item Description</th>
              <th>Item File</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>U'Price (RM)</th>
              <th>SST %</th>
              <th>SST (RM)</th>
              <th>Total (RM)</th>
              <th>Remarks</th>
              <th>DO No.</th>
            </tr>
          </thead>
          <tbody>
            {(d.items ?? []).map((it, i) => {
              const gross = Number(it.quantity || 0) * Number(it.unitPrice || 0);
              const sstAmt = gross * Number(it.sstPercent || 0) / 100;
              const rowTotal = gross + sstAmt;
              return (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td style={{ textAlign: 'left' }}>{it.description || '-'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {it.itemId ? (
                      <span className="badge ok">Linked</span>
                    ) : (
                      <button
                        className="btn"
                        type="button"
                        style={{ fontSize: 12, padding: '4px 10px' }}
                        disabled={!it.description.trim()}
                        title="Create or link Item File"
                        onClick={() => openCreateItemFromOrder(d, i)}
                      >
                        Create / Link
                      </button>
                    )}
                  </td>
                  <td>{formatNumber(it.quantity, 2)}</td>
                  <td>{it.unit || '-'}</td>
                  <td>{money(it.unitPrice)}</td>
                  <td>{formatNumber(it.sstPercent || 0, 2)}</td>
                  <td>{money(sstAmt)}</td>
                  <td>{money(rowTotal)}</td>
                  <td>{it.remarks || '-'}</td>
                  <td>{d.deliveryOrderNo || '-'}</td>
                </tr>
              );
            })}
            {!d.items?.length && <tr><td colSpan={11} className="empty">No items.</td></tr>}
          </tbody>
        </table>
      </div>
      <Modal open={!!createItemDraft} onClose={() => setCreateItemDraft(null)} title="Link or Create Item File from PO">
        {createItemDraft && (
          <form className="form-grid" onSubmit={handleCreateItemFromPo}>
            <label className="full">
              Link Existing Item File
              <select value={createItemDraft.existingItemId} onChange={(e) => updateCreateItemDraft({ existingItemId: e.target.value ? Number(e.target.value) : '' })}>
                <option value="">Select existing item...</option>
                {state.inventory.map((item) => (
                  <option key={item.id} value={item.id}>
                    {[item.stockId, item.item, item.partNo].filter(Boolean).join(' - ')}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn full" type="button" onClick={handleLinkExistingItemFromPo} disabled={!canEdit} title={!canEdit ? 'No permission to update PO item link' : undefined}>Link Existing Item</button>
            <label>
              Stock ID
              <input value={createItemDraft.stockId} readOnly placeholder="Auto-generated from category" style={{ background: 'var(--muted-bg, #f1f5f9)' }} />
            </label>
            <label>
              Part Name <span style={{ color: 'red' }}>*</span>
              <input value={createItemDraft.item} onChange={(e) => updateCreateItemDraft({ item: e.target.value })} required />
            </label>
            <label>
              Part No.
              <input value={createItemDraft.partNo} onChange={(e) => updateCreateItemDraft({ partNo: e.target.value })} />
            </label>
            <label>
              Category <span style={{ color: 'red' }}>*</span>
              <input
                list="po-detail-item-category-list"
                value={createItemDraft.category}
                onChange={(e) => updateCreateItemDraft({ category: e.target.value })}
                placeholder="Type code (C001) or name"
                required
              />
              <datalist id="po-detail-item-category-list">
                {state.categories.map((c) => (
                  <option key={c.id} value={`${c.code} - ${c.name}`} />
                ))}
              </datalist>
            </label>
            <label>
              Unit
              <input value={createItemDraft.unit} onChange={(e) => updateCreateItemDraft({ unit: e.target.value })} required />
            </label>
            <label>
              Reorder Level
              <input type="number" step="1" min="0" value={createItemDraft.reorder} onChange={(e) => updateCreateItemDraft({ reorder: Number(e.target.value) })} />
            </label>
            <label className="full">
              Store Location
              <input
                list="po-detail-item-location-list"
                value={createItemDraft.location}
                onChange={(e) => updateCreateItemDraft({ location: e.target.value })}
                placeholder="Select or type store location"
              />
              <datalist id="po-detail-item-location-list">
                {state.locations.map((l) => (
                  <option key={l.id} value={l.name} />
                ))}
              </datalist>
            </label>
            <button className="btn primary full" type="submit" disabled={!canCreateInventoryItem} title={!canCreateInventoryItem ? 'No permission to create Item File' : undefined}>Create Item</button>
          </form>
        )}
      </Modal>
    </div>
    </>
  );
}
