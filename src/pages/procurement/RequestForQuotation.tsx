import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../../components/Modal';
import { today, formatNumber, money } from '../../utils/format';
import { nextRfqNo } from '../../utils/codes';
import { hasPerm } from '../../utils/permissions';
import { appendAudit } from '../../utils/audit';
import { NoPermission } from '../../components/NoPermission';
import { ItemDescriptionInput } from '../../components/ItemDescriptionInput';
import type { RFQ, RFQSupplier, RFQItem, ItemRequest, CcrData, CcrItem, InventoryItem } from '../../types';

type View = 'list' | 'form' | 'detail' | 'ccr';

function blankCcrItem(supplierCount: number): CcrItem {
  return {
    supplierPrices: Array.from({ length: supplierCount }, () => ({ price: '', remark: '' })),
    supplierOptions: Array.from({ length: supplierCount }, () => [{ price: '', remark: '' }]),
    remarks: '',
    lastPrice: '',
    lastPriceDate: '',
    selectedSupplier: null,
    selectedOption: null,
  };
}

const blankSupplier = (): RFQSupplier => ({ name: '', email: '', fax: '' });
const blankItem = (): RFQItem => ({
  description: '', quantity: '', unit: '', unitPrice: '', amount: '', remarks: '', fileName: '', fileData: '',
});

function hasRfqItemName(item: RFQItem): boolean {
  return !!item.itemId || item.description.trim() !== '';
}

function isBlankRfqItem(item: RFQItem): boolean {
  return !item.itemId &&
    item.description.trim() === '' &&
    item.quantity.trim() === '' &&
    item.unit.trim() === '' &&
    item.unitPrice.trim() === '' &&
    item.amount.trim() === '' &&
    item.remarks.trim() === '' &&
    item.fileName.trim() === '' &&
    item.fileData.trim() === '' &&
    !item.srcIrf &&
    item.srcItemIdx === undefined;
}

export default function RequestForQuotation() {
  const { state, setState } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const canView = hasPerm(currentUser, 'viewRfq');
  const canCreate = hasPerm(currentUser, 'createRfq');
  const canEdit = hasPerm(currentUser, 'editRfq');
  const canDelete = hasPerm(currentUser, 'deleteRfq');
  const canPrint = hasPerm(currentUser, 'printRfq');
  const canCreatePo = hasPerm(currentUser, 'createPo');
  const canViewCcr         = hasPerm(currentUser, 'viewCcr');
  const canSelectCcrSupplier = hasPerm(currentUser, 'selectCcrSupplier');
  const canCreatePoFromCcr = hasPerm(currentUser, 'createPoFromCcr');

  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<RFQ | null>(null);
  const [detail, setDetail] = useState<RFQ | null>(null);
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState<string>('10');
  const [selected, setSelected] = useState<number[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [browsingIrf, setBrowsingIrf] = useState<ItemRequest | null>(null);
  const [pickedItemIdxs, setPickedItemIdxs] = useState<number[]>([]);

  const [form, setForm] = useState({ rfqNo: '', date: today(), type: '', remarks: '' });
  const [suppliers, setSuppliers] = useState<RFQSupplier[]>([blankSupplier()]);
  const [items, setItems] = useState<RFQItem[]>([blankItem()]);

  // CCR state
  const [ccrRfq, setCcrRfq] = useState<RFQ | null>(null);
  const [ccrItems, setCcrItems] = useState<CcrItem[]>([]);
  const [ccrDirty, setCcrDirty] = useState(false);
  const [saveConfirm, setSaveConfirm] = useState(false);
  const quotFileInputRef = useRef<HTMLInputElement>(null);
  const [quotPending, setQuotPending] = useState<{ rfqId: number; supplierIdx: number } | null>(null);
  const [quotPopover, setQuotPopover] = useState<{ rfqId: number; supplierIdx: number; x: number; y: number } | null>(null);

  function triggerQuotUpload(rfqId: number, supplierIdx: number) {
    setQuotPending({ rfqId, supplierIdx });
    quotFileInputRef.current?.click();
  }

  function handleQuotFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !quotPending) { e.target.value = ''; return; }
    const { rfqId, supplierIdx } = quotPending;
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
        rfqs: prev.rfqs.map((r) => {
          if (r.id !== rfqId) return r;
          const updatedSuppliers = r.suppliers.map((s, i) =>
            i !== supplierIdx ? s : { ...s, quotFiles: [...(s.quotFiles ?? []), ...newFiles] }
          );
          return { ...r, suppliers: updatedSuppliers };
        }),
      }));
      setQuotPending(null);
      e.target.value = '';
    });
  }

  function openQuotInTab(dataUrl: string) {
    const [header, base64] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)?.[1] ?? 'application/octet-stream';
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const blob = new Blob([arr], { type: mime });
    window.open(URL.createObjectURL(blob), '_blank');
  }

  function removeQuotFile(rfqId: number, supplierIdx: number, fileIdx: number) {
    setState((prev) => ({
      ...prev,
      rfqs: prev.rfqs.map((r) => {
        if (r.id !== rfqId) return r;
        const updatedSuppliers = r.suppliers.map((s, i) =>
          i !== supplierIdx ? s : { ...s, quotFiles: (s.quotFiles ?? []).filter((_, j) => j !== fileIdx) }
        );
        return { ...r, suppliers: updatedSuppliers };
      }),
    }));
  }

  function setQuotFileRefNo(rfqId: number, supplierIdx: number, fileIdx: number, refNo: string) {
    setState((prev) => ({
      ...prev,
      rfqs: prev.rfqs.map((r) => {
        if (r.id !== rfqId) return r;
        const updatedSuppliers = r.suppliers.map((s, i) =>
          i !== supplierIdx ? s : { ...s, quotFiles: (s.quotFiles ?? []).map((f, j) => j === fileIdx ? { ...f, refNo } : f) }
        );
        return { ...r, suppliers: updatedSuppliers };
      }),
    }));
  }

  if (!canView) return <NoPermission backPath="/procurement" />;

  // Keys of IRF items already in another RFQ (or already added to the current form).
  // Format: `${irfRefNo}#${irfItemIdx}`.
  const consumedItemKeys = (() => {
    const keys = new Set<string>();
    state.rfqs.forEach((rfq) => {
      if (editing && rfq.id === editing.id) return;
      const trackedRefs = new Set<string>();
      rfq.items?.forEach((it) => {
        if (it.srcIrf !== undefined && it.srcItemIdx !== undefined) {
          keys.add(`${it.srcIrf}#${it.srcItemIdx}`);
          trackedRefs.add(it.srcIrf);
        }
      });
      // Legacy fallback: RFQ predates per-item tracking → treat all items of its IRFs as consumed
      (rfq.irfRef ?? '').split(';').map((s) => s.trim()).filter(Boolean).forEach((refNo) => {
        if (trackedRefs.has(refNo)) return;
        const irf = state.requests.find((r) => r.refNo === refNo);
        irf?.items.forEach((_, idx) => keys.add(`${refNo}#${idx}`));
      });
    });
    items.forEach((it) => {
      if (it.srcIrf !== undefined && it.srcItemIdx !== undefined) {
        keys.add(`${it.srcIrf}#${it.srcItemIdx}`);
      }
    });
    return keys;
  })();

  function irfHasAvailableItems(irf: ItemRequest): boolean {
    return irf.items.some((it, idx) =>
      (it.description || it.quantity || it.unit || it.remarks || it.location) &&
      !consumedItemKeys.has(`${irf.refNo}#${idx}`)
    );
  }

  const availableIrfs = state.requests.filter((r) =>
    r.approvalStatus === 'Approved' && irfHasAvailableItems(r)
  );

  const currentIrfRefs = Array.from(new Set(
    items.map((it) => it.srcIrf).filter((s): s is string => !!s)
  ));

  function openBrowseIrf(irf: ItemRequest) {
    setBrowsingIrf(irf);
    setPickedItemIdxs([]);
  }

  function togglePickedItem(idx: number) {
    setPickedItemIdxs((prev) => prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]);
  }

  function importPickedItems() {
    if (!browsingIrf || !pickedItemIdxs.length) {
      alert('Select at least one item to import.');
      return;
    }
    const irf = browsingIrf;
    const itemsFromIrf: RFQItem[] = pickedItemIdxs
      .map((idx) => ({ it: irf.items[idx], idx }))
      .filter(({ it }) => it && (it.description || it.quantity || it.unit || it.remarks || it.location))
      .map(({ it, idx }) => ({
        description: it.description || irf.remarks || '',
        itemId: it.itemId,
        quantity: it.quantity || '',
        unit: it.unit || '',
        unitPrice: '',
        amount: '',
        remarks: it.remarks || it.purpose || '',
        fileName: it.fileName || '',
        fileData: it.fileData || '',
        srcIrf: irf.refNo,
        srcItemIdx: idx,
      }));

    if (!itemsFromIrf.length) {
      alert(`IRF ${irf.refNo} has no selectable item rows.`);
      return;
    }

    setItems((prev) => {
      const meaningful = prev.filter((it) => it.description || it.quantity || it.unit || it.remarks);
      return [...meaningful, ...itemsFromIrf];
    });
    setForm((f) => ({ ...f, remarks: f.remarks || `Imported from IRF ${irf.refNo}` }));
    setBrowsingIrf(null);
    setPickedItemIdxs([]);
    setImportOpen(false);
  }

  function closeImportModal() {
    setImportOpen(false);
    setBrowsingIrf(null);
    setPickedItemIdxs([]);
  }

  const filtered = state.rfqs
    .filter((r) => {
      const text = `${r.rfqNo} ${r.date} ${r.supplier} ${r.remarks}`.toLowerCase();
      return text.includes(search.toLowerCase());
    })
    .sort((a, b) => b.rfqNo.localeCompare(a.rfqNo));
  const shown = entries === 'all' ? filtered : filtered.slice(0, Number(entries));

  const supplierByName = (name: string) =>
    state.suppliers.find((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase());
  const itemByName = (name: string) =>
    state.inventory.find((item) => item.item.trim().toLowerCase() === name.trim().toLowerCase());

  function openNew() {
    setEditing(null);
    setForm({ rfqNo: nextRfqNo(state), date: today(), type: '', remarks: '' });
    setSuppliers([blankSupplier()]);
    setItems([blankItem()]);
    setView('form');
  }

  function openEdit(r: RFQ) {
    setEditing(r);
    setForm({ rfqNo: r.rfqNo, date: r.date, type: r.type, remarks: r.remarks });
    setSuppliers(r.suppliers?.length ? r.suppliers.map((s) => ({ ...s })) : [blankSupplier()]);
    setItems(r.items?.length ? r.items.map((i) => ({ ...i })) : [blankItem()]);
    setView('form');
  }

  function openDetail(r: RFQ) {
    setDetail(r);
    setView('detail');
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveConfirm(true);
  }

  function doSave() {
    setSaveConfirm(false);
    const cleanItems = items.filter((it) => !isBlankRfqItem(it));
    if (!cleanItems.length) {
      alert('At least one item is required before saving this RFQ.');
      return;
    }
    const missingItemIdx = items.findIndex((it) => !isBlankRfqItem(it) && !hasRfqItemName(it));
    if (missingItemIdx >= 0) {
      alert(`Item row ${missingItemIdx + 1} needs an item description. Delete the row if it was added accidentally.`);
      return;
    }
    const linkedSuppliers = suppliers.map((s) => {
      if (s.supplierId) return s;
      const selected = supplierByName(s.name);
      return selected
        ? { ...s, supplierId: selected.id, email: s.email || selected.email || '', fax: s.fax || selected.fax || '' }
        : s;
    });
    const supplierNames = linkedSuppliers.map((s) => s.name).filter(Boolean).join('; ');
    const linkedItems = cleanItems.map((it) => {
      if (it.itemId) return it;
      const selected = itemByName(it.description);
      return selected ? { ...it, itemId: selected.id, unit: it.unit || selected.unit } : it;
    });
    const savedIrfRefs = Array.from(new Set(
      linkedItems.map((it) => it.srcIrf).filter((s): s is string => !!s)
    ));
    setState((prev) => {
      const record: RFQ = {
        id: editing?.id ?? Date.now(),
        rfqNo: form.rfqNo || nextRfqNo(prev),
        date: form.date,
        type: form.type,
        supplier: supplierNames,
        suppliers: linkedSuppliers,
        remarks: form.remarks,
        total: editing?.total ?? 0,
        items: linkedItems,
        ccr: editing?.ccr,
        irfRef: savedIrfRefs.length ? savedIrfRefs.join('; ') : (editing?.irfRef || ''),
      };
      const next = editing
        ? { ...prev, rfqs: prev.rfqs.map((r) => r.id === editing.id ? record : r) }
        : { ...prev, rfqs: [record, ...prev.rfqs] };
      return appendAudit(next, currentUser, 'RFQ', editing ? 'Edit' : 'Create', {
        recordRef: record.rfqNo, recordId: record.id,
        details: `${linkedSuppliers.length} supplier(s), ${linkedItems.length} item(s)`,
      });
    });
    setView('list');
  }

  function handleDelete(ids: number[]) {
    const blocked = ids
      .map((id) => state.rfqs.find((r) => r.id === id))
      .filter((r) => r && r.ccr?.items?.some((ci) => !!ci.poRef));
    if (blocked.length) {
      const nos = blocked.map((r) => r!.rfqNo).join(', ');
      alert(`Cannot delete ${nos} — it has a PO linked to it. Delete the PO first.`);
      return;
    }
    if (!confirm(`Delete ${ids.length} RFQ(s)?`)) return;
    const targets = state.rfqs.filter((r) => ids.includes(r.id));
    setState((prev) => {
      let next: typeof prev = { ...prev, rfqs: prev.rfqs.filter((r) => !ids.includes(r.id)) };
      for (const r of targets) {
        next = appendAudit(next, currentUser, 'RFQ', 'Delete', { recordRef: r.rfqNo, recordId: r.id });
      }
      return next;
    });
    setSelected([]);
  }

  // ── CCR (Comparative Cost Report) ──
  function openCcr(r: RFQ) {
    if (!r.suppliers?.length) { alert('Add at least one supplier to this RFQ first.'); return; }
    if (!r.items?.length) { alert('Add at least one item to this RFQ first.'); return; }
    setCcrRfq(r);
    // Seed CCR rows from saved data, or create blanks sized to current supplier list
    const supplierCount = r.suppliers.length;
    const fromSaved = r.ccr?.items ?? [];
    const seeded: CcrItem[] = r.items.map((_item, iIdx) => {
      const saved = fromSaved[iIdx];
      if (saved) {
        const sp = Array.from({ length: supplierCount }, (_, sIdx) =>
          saved.supplierPrices?.[sIdx] ?? { price: '', remark: '' }
        );
        // Migrate legacy single-price into supplierOptions if not already present
        const so = Array.from({ length: supplierCount }, (_, sIdx) => {
          const existing = saved.supplierOptions?.[sIdx];
          if (existing?.length) return existing;
          return [sp[sIdx]];
        });
        return { ...saved, supplierPrices: sp, supplierOptions: so, selectedOption: saved.selectedOption ?? null };
      }
      return blankCcrItem(supplierCount);
    });
    setCcrItems(seeded);
    setCcrDirty(false);
    setView('ccr');
  }

  function addCcrOption(itemIdx: number, supplierIdx: number) {
    setCcrItems((prev) => prev.map((ci, i) => {
      if (i !== itemIdx) return ci;
      const so = (ci.supplierOptions ?? []).map((opts, j) =>
        j === supplierIdx ? [...opts, { price: '', remark: '' }] : opts
      );
      return { ...ci, supplierOptions: so };
    }));
    setCcrDirty(true);
  }

  function removeCcrOption(itemIdx: number, supplierIdx: number, optionIdx: number) {
    setCcrItems((prev) => prev.map((ci, i) => {
      if (i !== itemIdx) return ci;
      const so = (ci.supplierOptions ?? []).map((opts, j) =>
        j === supplierIdx ? opts.filter((_, k) => k !== optionIdx) : opts
      );
      const deselect = ci.selectedSupplier === supplierIdx && ci.selectedOption === optionIdx;
      return { ...ci, supplierOptions: so, selectedSupplier: deselect ? null : ci.selectedSupplier, selectedOption: deselect ? null : ci.selectedOption };
    }));
    setCcrDirty(true);
  }

  function updateCcrOptionPrice(itemIdx: number, supplierIdx: number, optionIdx: number, price: string) {
    setCcrItems((prev) => prev.map((ci, i) => {
      if (i !== itemIdx) return ci;
      const so = (ci.supplierOptions ?? []).map((opts, j) =>
        j === supplierIdx ? opts.map((opt, k) => k === optionIdx ? { ...opt, price } : opt) : opts
      );
      return { ...ci, supplierOptions: so };
    }));
    setCcrDirty(true);
  }

  function updateCcrOptionRemark(itemIdx: number, supplierIdx: number, optionIdx: number, remark: string) {
    setCcrItems((prev) => prev.map((ci, i) => {
      if (i !== itemIdx) return ci;
      const so = (ci.supplierOptions ?? []).map((opts, j) =>
        j === supplierIdx ? opts.map((opt, k) => k === optionIdx ? { ...opt, remark } : opt) : opts
      );
      return { ...ci, supplierOptions: so };
    }));
    setCcrDirty(true);
  }

  function selectCcrOption(itemIdx: number, supplierIdx: number, optionIdx: number) {
    setCcrItems((prev) => prev.map((ci, i) => {
      if (i !== itemIdx) return ci;
      const same = ci.selectedSupplier === supplierIdx && ci.selectedOption === optionIdx;
      return { ...ci, selectedSupplier: same ? null : supplierIdx, selectedOption: same ? null : optionIdx };
    }));
    setCcrDirty(true);
    // Audit the supplier-pick choice on the CCR
    if (ccrRfq) {
      const supName = ccrRfq.suppliers[supplierIdx]?.name ?? `Supplier ${supplierIdx + 1}`;
      const itemDesc = ccrRfq.items[itemIdx]?.description ?? `Item ${itemIdx + 1}`;
      setState((prev) => appendAudit(prev, currentUser, 'RFQ', 'CCR Select Supplier', {
        recordType: 'CCR', recordRef: ccrRfq.rfqNo, recordId: ccrRfq.id,
        details: `Item "${itemDesc}" → ${supName} (option ${optionIdx + 1})`,
      }));
    }
  }

  function updateCcrItemRemarks(itemIdx: number, remarks: string) {
    setCcrItems((prev) => prev.map((ci, i) => i === itemIdx ? { ...ci, remarks } : ci));
    setCcrDirty(true);
  }

  function handleCcrSave() {
    if (!ccrRfq) return;
    const ccrData: CcrData = { savedAt: new Date().toISOString(), items: ccrItems };
    const selectedCount = ccrItems.filter((ci) => ci.selectedSupplier !== null && ci.selectedSupplier !== undefined).length;
    setState((prev) => appendAudit(
      { ...prev, rfqs: prev.rfqs.map((r) => r.id === ccrRfq.id ? { ...r, ccr: ccrData } : r) },
      currentUser, 'RFQ', 'CCR Save', {
        recordType: 'CCR', recordRef: ccrRfq.rfqNo, recordId: ccrRfq.id,
        details: `${ccrItems.length} item(s), ${selectedCount} supplier pick(s)`,
      },
    ));
    setCcrDirty(false);
    alert('CCR saved successfully.');
  }

  function handleCcrCreatePo() {
    if (!ccrRfq) return;

    if (ccrDirty) {
      alert('Please Save the CCR before creating a PO. Your latest changes are not saved yet.');
      return;
    }

    const picks = ccrItems
      .map((ci, idx) => ({ ci, item: ccrRfq.items[idx], idx }))
      .filter(({ ci }) => ci.selectedSupplier !== null && ci.selectedSupplier !== undefined && !ci.poRef);

    if (!picks.length) {
      const anySelected = ccrItems.some((ci) => ci.selectedSupplier !== null && ci.selectedSupplier !== undefined);
      alert(anySelected
        ? 'All selected items already have a PO. Select a different item or unselect the existing ones.'
        : 'Please select a supplier for at least one item using the radio buttons before creating a PO.');
      return;
    }

    // Group picks by selected supplier — one PO per supplier
    const bySupplier = new Map<number, typeof picks>();
    picks.forEach((p) => {
      const sIdx = p.ci.selectedSupplier!;
      if (!bySupplier.has(sIdx)) bySupplier.set(sIdx, []);
      bySupplier.get(sIdx)!.push(p);
    });

    const batches = Array.from(bySupplier.entries()).map(([sIdx, group]) => {
      const rfqSupplier = ccrRfq.suppliers[sIdx];
      const linkedSupplier = rfqSupplier?.supplierId
        ? state.suppliers.find((s) => s.id === rfqSupplier.supplierId)
        : supplierByName(rfqSupplier?.name ?? '');
      return {
        rfqId: ccrRfq.id,
        ccrItemIdxs: group.map((p) => p.idx),
        supplier: rfqSupplier?.name ?? '',
        supplierId: linkedSupplier?.id ?? rfqSupplier?.supplierId,
        email: linkedSupplier?.email ?? rfqSupplier?.email ?? '',
        fax: linkedSupplier?.fax ?? rfqSupplier?.fax ?? '',
        remarks: `From RFQ ${ccrRfq.rfqNo}`,
        items: group.map(({ ci, item }) => {
          const optIdx = ci.selectedOption ?? 0;
          const sp = ci.supplierOptions?.[sIdx]?.[optIdx] ?? ci.supplierPrices[sIdx] ?? { price: '', remark: '' };
          return {
            reqNo: '',
            itemId: item.itemId,
            description: item.description || '',
            quantity: Number(item.quantity || 0),
            unit: item.unit || '',
            unitPrice: Number(sp.price || 0),
            sstPercent: 0,
            purpose: '',
            quotations: '',
            remarks: sp.remark || '',
            fileName: '',
            fileData: '',
          };
        }),
      };
    });

    // First batch goes via location.state. Remaining batches queue in sessionStorage,
    // and will be consumed one-by-one by the PO form after each save.
    const [first, ...rest] = batches;
    if (rest.length) {
      sessionStorage.setItem('pendingPoQueue', JSON.stringify(rest));
    } else {
      sessionStorage.removeItem('pendingPoQueue');
    }

    // Audit: one entry per supplier batch
    setState((prev) => {
      let next = prev;
      for (const b of batches) {
        next = appendAudit(next, currentUser, 'RFQ', 'CCR Create PO', {
          recordType: 'CCR', recordRef: ccrRfq.rfqNo, recordId: ccrRfq.id,
          details: `Drafting PO for ${b.supplier} — ${b.items.length} item(s)`,
        });
      }
      return next;
    });

    navigate('/procurement/orders', { state: { fromCcr: first } });
  }

  // ── supplier row helpers ──
  function updateSupplier(idx: number, patch: Partial<RFQSupplier>) {
    setSuppliers((prev) => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }
  function updateSupplierName(idx: number, name: string) {
    const selected = supplierByName(name);
    setSuppliers((prev) => prev.map((s, i) => i === idx
      ? {
          ...s,
          name,
          supplierId: selected?.id,
          email: selected ? selected.email ?? '' : s.email,
          fax: selected ? selected.fax ?? '' : s.fax,
        }
      : s
    ));
  }
  function addSupplier() { setSuppliers((prev) => [...prev, blankSupplier()]); }
  function removeSupplier(idx: number) {
    setSuppliers((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);
  }
  function clearSupplier(idx: number) {
    setSuppliers((prev) => prev.map((s, i) => i === idx ? blankSupplier() : s));
  }

  // ── item row helpers ──
  function updateItemDescription(idx: number, description: string, selected?: InventoryItem) {
    updateItem(idx, selected
      ? { itemId: selected.id, description: selected.item, unit: selected.unit }
      : { itemId: undefined, description }
    );
  }
  function updateItem(idx: number, patch: Partial<RFQItem>) {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }
  function addItem() { setItems((prev) => [...prev, blankItem()]); }
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

  // ─────────────────────────────────────────────────────────
  // LIST VIEW
  // ─────────────────────────────────────────────────────────
  if (view === 'list') return (
    <>
      <div><h2>Request For Quotation (RFQ) Listing</h2></div>
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
              <th>RFQ No.</th>
              <th>Date</th>
              <th>Supplier</th>
              <th>Remarks</th>
              <th>CCR</th>
              <th>PO</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={7} className="empty">No records found.</td></tr>
            ) : shown.map((r) => {
              const allCcrItems = r.ccr?.items ?? [];
              const rfqItemCount = r.items?.length ?? 0;
              const ccrComplete = rfqItemCount > 0
                && allCcrItems.length === rfqItemCount
                && allCcrItems.every((ci) => ci.selectedSupplier !== null && ci.selectedSupplier !== undefined);
              const poComplete = allCcrItems.length > 0 && allCcrItems.every((ci) => !!ci.poRef);
              return (
              <tr key={r.id}>
                <td>{r.rfqNo}</td>
                <td>{r.date}</td>
                <td>{r.supplier || '-'}</td>
                <td>{r.remarks || '-'}</td>
                <td style={{ textAlign: 'center' }} title={ccrComplete ? 'All items selected in CCR' : 'CCR not completed'}>
                  {ccrComplete ? <span style={{ color: '#28a745', fontSize: 18, fontWeight: 700 }}>&#10003;</span> : ''}
                </td>
                <td style={{ textAlign: 'center' }} title={poComplete ? 'All PO created' : 'PO not completed'}>
                  {poComplete ? <span style={{ color: '#28a745', fontSize: 18, fontWeight: 700 }}>&#10003;</span> : ''}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn" style={{ fontSize: 12, padding: '4px 10px', marginRight: 4 }} onClick={() => openDetail(r)}>View</button>
                  {canEdit && <button className="btn" style={{ fontSize: 12, padding: '4px 10px', marginRight: 4 }} onClick={() => openEdit(r)}>Edit</button>}
                  {canDelete && <button className="btn danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete([r.id])}>Delete</button>}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </>
  );

  // ─────────────────────────────────────────────────────────
  // FORM VIEW
  // ─────────────────────────────────────────────────────────
  if (view === 'form') return (
    <>
    <Modal open={saveConfirm} onClose={() => setSaveConfirm(false)} title="Confirm Save" hideClose>
      <p style={{ margin: '0 0 20px', fontSize: 14 }}>Do you want to save this Request For Quotation?</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button className="btn" type="button" onClick={() => setSaveConfirm(false)}>Cancel</button>
        <button className="btn primary" type="button" onClick={doSave}>Save</button>
      </div>
    </Modal>
    <form className="irf-editor" onSubmit={handleSave}>
      <h2 className="irf-title">
        {editing ? `Edit Request For Quotation ${form.rfqNo}` : 'New Request For Quotation'}
      </h2>
      <div className="irf-toolbar">
        <button className="btn" type="button" onClick={() => setView('list')}>Back</button>
        <button className="btn primary" type="submit">Save</button>
      </div>

      <div className="irf-card">
        <div className="irf-grid">
          <label>
            Date
            <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
          </label>
          <label>
            Type
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} required>
              <option value="">Please Select One</option>
              <option value="Parts">Parts</option>
              <option value="Service">Service</option>
              <option value="General">General</option>
            </select>
          </label>
          <label className="full">
            Remarks
            <input placeholder="Remarks" value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
          </label>
        </div>

        <div className="table-wrap">
          <table className="irf-item-table">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Email <small>(semicolon ; to separate multiple email addresses)</small></th>
                <th>Fax</th>
                <th>Options</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s, idx) => (
                <tr key={idx}>
                  <td>
                    <input list="rfq-supplier-list" placeholder="Type supplier name..." value={s.name}
                      onChange={(e) => updateSupplierName(idx, e.target.value)} />
                  </td>
                  <td><input placeholder="Email" value={s.email} onChange={(e) => updateSupplier(idx, { email: e.target.value })} /></td>
                  <td><input placeholder="Fax" value={s.fax} onChange={(e) => updateSupplier(idx, { fax: e.target.value })} /></td>
                  <td>
                    <button className="square-btn gold" type="button" title="Clear row" onClick={() => clearSupplier(idx)}>x</button>
                    <button className="square-btn danger" type="button" onClick={() => removeSupplier(idx)}>-</button>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={4}><button className="square-btn primary" type="button" onClick={addSupplier}>+</button></td>
              </tr>
            </tbody>
          </table>
          <datalist id="rfq-supplier-list">
            {state.suppliers.map((s) => <option key={s.id} value={s.name} />)}
          </datalist>
        </div>
      </div>

      <div className="irf-card">
        <div className="irf-item-actions">
          <button className="btn primary" type="button" onClick={() => setImportOpen(true)}>Import From IRF</button>
          {currentIrfRefs.length > 0 && (
            <small style={{ marginLeft: 12, color: '#28a745', fontWeight: 600 }}>
              Imported from IRF {currentIrfRefs.join(', ')}
            </small>
          )}
        </div>
        <div className="table-wrap">
          <table className="irf-item-table">
            <thead>
              <tr>
                <th></th>
                <th>Item Description</th>
                <th>Quantity</th>
                <th>Unit</th>
                <th>Remarks</th>
                <th>Attachment</th>
                <th>Options</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx}>
                  <td><button className="square-btn danger" type="button" onClick={() => removeItem(idx)}>-</button></td>
                  <td><ItemDescriptionInput value={it.description} inventory={state.inventory} onChange={(desc, sel) => updateItemDescription(idx, desc, sel)} /></td>
                  <td><input type="number" step="1" min="1" placeholder="Quantity" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: e.target.value })} /></td>
                  <td><input placeholder="Unit" value={it.unit} onChange={(e) => updateItem(idx, { unit: e.target.value })} /></td>
                  <td><input placeholder="Remarks" value={it.remarks} onChange={(e) => updateItem(idx, { remarks: e.target.value })} /></td>
                  <td>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,image/*,application/pdf" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) updateItem(idx, { fileName: file.name });
                    }} />
                    {it.fileName && <small>{it.fileName}</small>}
                  </td>
                  <td>
                    <button className="square-btn gold" type="button" title="Clear row" onClick={() => clearItem(idx)}>x</button>
                    <button className="square-btn danger" type="button" onClick={() => removeItem(idx)}>-</button>
                  </td>
                </tr>
              ))}
              <tr>
                <td><button className="square-btn primary" type="button" onClick={addItem}>+</button></td>
                <td colSpan={6}></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={importOpen} onClose={closeImportModal} title={browsingIrf ? `Select items from IRF ${browsingIrf.refNo}` : 'Import From IRF'} wide>
        {!browsingIrf ? (
          <>
            <p style={{ fontSize: 13, color: '#555', marginTop: 0 }}>
              Only <strong>approved</strong> IRFs with items not yet imported elsewhere are shown.
            </p>
            {availableIrfs.length === 0 ? (
              <p className="empty" style={{ padding: 20, textAlign: 'center' }}>
                No approved IRFs available. Go to <strong>Item Request Form</strong>, open a request, and click <strong>Approve</strong> first.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="listing-table">
                  <thead>
                    <tr>
                      <th>IRF No.</th>
                      <th>Date</th>
                      <th>Requested By</th>
                      <th>Remarks</th>
                      <th>Available Items</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {availableIrfs.map((r) => {
                      const availableCount = r.items.filter((it, idx) =>
                        (it.description || it.quantity || it.unit || it.remarks || it.location) &&
                        !consumedItemKeys.has(`${r.refNo}#${idx}`)
                      ).length;
                      return (
                        <tr key={r.id}>
                          <td>{r.refNo}</td>
                          <td>{r.date}</td>
                          <td>{r.requestedBy}</td>
                          <td>{r.remarks || '-'}</td>
                          <td>{availableCount} / {r.items.length}</td>
                          <td>
                            <button className="btn primary" type="button" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => openBrowseIrf(r)}>
                              Select Items
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (() => {
          const rows = browsingIrf.items
            .map((it, idx) => ({ it, idx }))
            .filter(({ it, idx }) =>
              (it.description || it.quantity || it.unit || it.remarks || it.location) &&
              !consumedItemKeys.has(`${browsingIrf.refNo}#${idx}`)
            );
          const allChecked = rows.length > 0 && rows.every((row) => pickedItemIdxs.includes(row.idx));
          return (
            <>
              <p style={{ fontSize: 13, color: '#555', marginTop: 0 }}>
                Tick the items you want to import. Only items not yet used in another RFQ are shown.
              </p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button className="btn" type="button" onClick={() => { setBrowsingIrf(null); setPickedItemIdxs([]); }}>
                  &laquo; Back to IRF list
                </button>
                <button className="btn primary" type="button" onClick={importPickedItems} disabled={!pickedItemIdxs.length}>
                  Import Selected ({pickedItemIdxs.length})
                </button>
              </div>
              {rows.length === 0 ? (
                <p className="empty" style={{ padding: 20, textAlign: 'center' }}>
                  No items available — all of this IRF's items are already in use.
                </p>
              ) : (
                <div className="table-wrap">
                  <table className="listing-table">
                    <thead>
                      <tr>
                        <th style={{ width: 32 }}>
                          <input
                            type="checkbox"
                            checked={allChecked}
                            onChange={(e) => setPickedItemIdxs(e.target.checked ? rows.map((row) => row.idx) : [])}
                          />
                        </th>
                        <th>Description</th>
                        <th>Quantity</th>
                        <th>Unit</th>
                        <th>Purpose</th>
                        <th>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ it, idx }) => (
                        <tr key={idx}>
                          <td>
                            <input
                              type="checkbox"
                              checked={pickedItemIdxs.includes(idx)}
                              onChange={() => togglePickedItem(idx)}
                            />
                          </td>
                          <td>{it.description || '-'}</td>
                          <td>{it.quantity || '-'}</td>
                          <td>{it.unit || '-'}</td>
                          <td>{it.purpose || '-'}</td>
                          <td>{it.remarks || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          );
        })()}
      </Modal>
    </form>
    </>
  );

  // ─────────────────────────────────────────────────────────
  // CCR VIEW (Comparative Cost Report)
  // ─────────────────────────────────────────────────────────
  if (view === 'ccr' && ccrRfq) {
    const r = ccrRfq;
    const supplierTotal = (sIdx: number) =>
      ccrItems.reduce((sum, ci, iIdx) => {
        if (ci.selectedSupplier !== sIdx) return sum;
        const optIdx = ci.selectedOption ?? 0;
        const price = Number(ci.supplierOptions?.[sIdx]?.[optIdx]?.price ?? ci.supplierPrices[sIdx]?.price ?? 0);
        const qty = Number(r.items[iIdx]?.quantity || 0);
        return sum + price * qty;
      }, 0);

    const supplierGrandTotal = (sIdx: number) =>
      ccrItems.reduce((sum, ci, iIdx) => {
        const price = Number(ci.supplierOptions?.[sIdx]?.[0]?.price ?? ci.supplierPrices[sIdx]?.price ?? 0);
        const qty = Number(r.items[iIdx]?.quantity || 0);
        return sum + price * qty;
      }, 0);

    return (
      <>
        <div className="listing-actions">
          <button className="btn" type="button" onClick={() => setView('detail')}>Back</button>
          {canSelectCcrSupplier && (
            <button className="btn primary" type="button" onClick={handleCcrSave}>
              {ccrDirty ? 'Save *' : 'Save'}
            </button>
          )}
          {canPrint && <button className="btn primary" type="button" onClick={() => window.print()}>Print</button>}
          {canCreatePoFromCcr && (
            <button className="btn primary" type="button" disabled={ccrDirty} onClick={handleCcrCreatePo} title={ccrDirty ? 'Save CCR before creating PO' : ''}>
              Create PO
            </button>
          )}
          <span style={{ marginLeft: 12, fontSize: 14 }}>
            RFQ No.: <strong>{r.rfqNo}</strong> &nbsp; Type: <strong>{r.type || '-'}</strong>
            {ccrDirty && (
              <span style={{ marginLeft: 12, color: '#dc3545', fontWeight: 600 }}>
                Unsaved changes — click Save before Create PO
              </span>
            )}
          </span>
        </div>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="listing-table">
            <thead>
              <tr>
                <th rowSpan={2}>No.</th>
                <th rowSpan={2}>Description</th>
                <th rowSpan={2}>Qty</th>
                <th rowSpan={2}>Last Price</th>
                {r.suppliers.map((_, i) => <th key={i}>Supplier {i + 1}</th>)}
                <th rowSpan={2}>Remarks</th>
                <th rowSpan={2}>Total (RM)</th>
              </tr>
              <tr>
                {r.suppliers.map((s, i) => <th key={i}>{s.name || '-'}</th>)}
              </tr>
            </thead>
            <tbody>
              {r.items.map((item, iIdx) => {
                const ci = ccrItems[iIdx] ?? blankCcrItem(r.suppliers.length);
                const qty = Number(item.quantity || 0);
                const hasPo = !!ci.poRef;
                return (
                  <tr key={iIdx} style={hasPo ? { background: '#f4faf6' } : undefined}>
                    <td>{iIdx + 1}</td>
                    <td style={{ textAlign: 'left' }}>
                      {item.description || '-'}
                      {hasPo && (
                        <div style={{ marginTop: 4, fontSize: 11, color: '#28a745', fontWeight: 600 }}>
                          &#10003; PO {ci.poRef} created
                        </div>
                      )}
                    </td>
                    <td>{item.quantity || '-'} {item.unit || ''}</td>
                    <td>{ci.lastPrice ? money(Number(ci.lastPrice)) : '—'}</td>
                    {r.suppliers.map((_s, sIdx) => {
                      const options = ci.supplierOptions?.[sIdx] ?? [ci.supplierPrices[sIdx] ?? { price: '', remark: '' }];
                      const supplierSelected = ci.selectedSupplier === sIdx;
                      return (
                        <td
                          key={sIdx}
                          style={{
                            verticalAlign: 'top',
                            background: supplierSelected ? '#e7f6ed' : undefined,
                            borderLeft: supplierSelected ? '2px solid #28a745' : undefined,
                            minWidth: 160,
                          }}
                        >
                          {options.map((opt, optIdx) => {
                            const price = Number(opt.price || 0);
                            const ciValue = price * qty;
                            const isSelected = ci.selectedSupplier === sIdx && ci.selectedOption === optIdx;
                            return (
                              <div
                                key={optIdx}
                                style={{
                                  marginBottom: 6,
                                  paddingBottom: 6,
                                  borderBottom: optIdx < options.length - 1 ? '1px dashed #ccc' : 'none',
                                }}
                              >
                                {options.length > 1 && (
                                  <div style={{ fontSize: 10, fontWeight: 700, color: '#888', marginBottom: 2 }}>
                                    Option {optIdx + 1}
                                  </div>
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                  <label
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: 4, fontSize: 12,
                                      cursor: hasPo ? 'not-allowed' : 'pointer',
                                      color: hasPo ? '#888' : undefined,
                                    }}
                                    title={hasPo ? `Locked — PO ${ci.poRef} already created` : undefined}
                                  >
                                    <input
                                      type="radio"
                                      name={`ccr-select-${iIdx}`}
                                      checked={isSelected}
                                      onChange={() => {}}
                                      onClick={() => !hasPo && canSelectCcrSupplier && selectCcrOption(iIdx, sIdx, optIdx)}
                                      disabled={hasPo || !canSelectCcrSupplier}
                                      style={{ margin: 0 }}
                                    />
                                    Select
                                  </label>
                                  {options.length > 1 && !hasPo && (
                                    <button
                                      type="button"
                                      className="square-btn danger"
                                      style={{ fontSize: 10, padding: '1px 5px', lineHeight: '14px', height: 18 }}
                                      title="Remove this option"
                                      onClick={() => removeCcrOption(iIdx, sIdx, optIdx)}
                                    >×</button>
                                  )}
                                </div>
                                <div style={{ fontSize: 12, marginBottom: 4 }}>
                                  RM&nbsp;
                                  <input
                                    type="number" step="0.01" min="0" placeholder="0.00"
                                    style={{ width: 80 }}
                                    value={opt.price}
                                    onChange={(e) => updateCcrOptionPrice(iIdx, sIdx, optIdx, e.target.value)}
                                  />
                                </div>
                                <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>
                                  C.I: <strong style={{ color: '#1a5c38' }}>{money(ciValue)}</strong>
                                </div>
                                <div style={{ fontSize: 11 }}>
                                  Remark:<br />
                                  <textarea
                                    rows={2}
                                    style={{ width: '100%', fontSize: 11, resize: 'vertical' }}
                                    value={opt.remark}
                                    onChange={(e) => updateCcrOptionRemark(iIdx, sIdx, optIdx, e.target.value)}
                                  />
                                </div>
                              </div>
                            );
                          })}
                          {!hasPo && (
                            <button
                              type="button"
                              className="btn"
                              style={{ fontSize: 11, padding: '2px 8px', marginTop: 2, width: '100%' }}
                              onClick={() => addCcrOption(iIdx, sIdx)}
                            >+ Option</button>
                          )}
                        </td>
                      );
                    })}
                    <td>
                      <textarea
                        rows={4}
                        style={{ width: '100%', fontSize: 12 }}
                        value={ci.remarks}
                        onChange={(e) => updateCcrItemRemarks(iIdx, e.target.value)}
                      />
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                      {ci.selectedSupplier !== null && ci.selectedSupplier !== undefined
                        ? money(Number(ci.supplierOptions?.[ci.selectedSupplier]?.[ci.selectedOption ?? 0]?.price ?? ci.supplierPrices[ci.selectedSupplier]?.price ?? 0) * qty)
                        : '—'}
                    </td>
                  </tr>
                );
              })}
              <tr style={{ background: '#f8f9fa', fontWeight: 700 }}>
                <td colSpan={4} style={{ textAlign: 'right' }}>Total:</td>
                {r.suppliers.map((_, sIdx) => (
                  <td key={sIdx}>{money(supplierGrandTotal(sIdx))}</td>
                ))}
                <td></td>
                <td></td>
              </tr>
              <tr style={{ background: '#e8f5e9', fontWeight: 700 }}>
                <td colSpan={4} style={{ textAlign: 'right' }}>Selected Total:</td>
                {r.suppliers.map((_, sIdx) => (
                  <td key={sIdx}>{money(supplierTotal(sIdx))}</td>
                ))}
                <td></td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </>
    );
  }

  // ─────────────────────────────────────────────────────────
  // DETAIL VIEW
  // ─────────────────────────────────────────────────────────
  const d = state.rfqs.find((r) => r.id === detail?.id) ?? detail!;
  return (
    <>
    <input ref={quotFileInputRef} type="file" accept="image/*,.pdf" multiple style={{ display: 'none' }} onChange={handleQuotFileSelected} />
    {quotPopover && (() => {
      const rfq = state.rfqs.find((r) => r.id === quotPopover.rfqId);
      const supplier = rfq?.suppliers?.[quotPopover.supplierIdx];
      const files = supplier?.quotFiles ?? [];
      return (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setQuotPopover(null)} />
          <div style={{
            position: 'fixed', left: quotPopover.x, top: quotPopover.y, zIndex: 1000,
            background: 'var(--panel-bg, #fff)', border: '1px solid var(--border, #ddd)',
            borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.18)', padding: 12, minWidth: 320, maxWidth: 420,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13 }}>
              Received Quotation Files — {supplier?.name || `Supplier ${quotPopover.supplierIdx + 1}`}
            </div>
            {files.length === 0 && <div style={{ fontSize: 12, color: '#aaa', marginBottom: 8 }}>No files uploaded yet.</div>}
            {files.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr auto', gap: '4px 6px', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>Ref / Number</div>
                <div style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>File</div>
                <div />
                {files.map((f, i) => (
                  <>
                    <input key={`ref-${i}`} type="text" value={f.refNo ?? ''} placeholder="e.g. Q-2024-001"
                      style={{ fontSize: 11, padding: '3px 6px', border: '1px solid var(--border, #ccc)', borderRadius: 4, minWidth: 0 }}
                      onClick={(ev) => ev.stopPropagation()}
                      onChange={(ev) => setQuotFileRefNo(quotPopover.rfqId, quotPopover.supplierIdx, i, ev.target.value)} />
                    <button key={`file-${i}`} className="btn"
                      style={{ fontSize: 11, padding: '3px 8px', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
                      title={`Open ${f.name}`} onClick={() => openQuotInTab(f.data)}>{f.name}</button>
                    <button key={`del-${i}`} className="btn danger"
                      style={{ fontSize: 11, padding: '3px 7px' }}
                      title="Remove file" onClick={() => removeQuotFile(quotPopover.rfqId, quotPopover.supplierIdx, i)}>×</button>
                  </>
                ))}
              </div>
            )}
            <button className="btn primary" style={{ fontSize: 11, padding: '4px 10px', width: '100%', marginTop: 6 }}
              onClick={() => { const p = quotPopover; setQuotPopover(null); triggerQuotUpload(p.rfqId, p.supplierIdx); }}>+ Add files</button>
          </div>
        </>
      );
    })()}
    <div className="irf-editor">
      <h2 className="irf-title">Request For Quotation (RFQ) {d.rfqNo}</h2>
      <div className="irf-toolbar">
        <button className="btn" type="button" onClick={() => setView('list')}>Back</button>
        {canEdit && <button className="btn primary" type="button" onClick={() => openEdit(d)}>Edit</button>}
        {canPrint && <button className="btn primary" type="button" onClick={() => window.print()}>Print</button>}
        {canDelete && <button className="btn danger" type="button" onClick={() => { handleDelete([d.id]); setView('list'); }}>Delete</button>}
        {canViewCcr && <button className="btn primary" type="button" onClick={() => openCcr(d)}>CCR</button>}
      </div>

      <div className="panel">
        <div className="detail-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: 16 }}>
          <div><strong>RFQ No.</strong><br />{d.rfqNo}</div>
          <div><strong>Type</strong><br />{d.type || '-'}</div>
          <div><strong>Date</strong><br />{d.date}</div>
          <div><strong>Remarks</strong><br />{d.remarks || '-'}</div>
          <div><strong>Issued By</strong><br />MJM Purchasing</div>
          <div><strong>Last Edit By</strong><br />MJM Purchasing</div>
        </div>
        <div className="table-wrap">
          <table className="listing-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Supplier</th>
                <th>Email</th>
                <th>Fax</th>
                <th style={{ textAlign: 'center' }}>Quotations</th>
              </tr>
            </thead>
            <tbody>
              {(d.suppliers?.length ? d.suppliers : []).map((s, idx) => {
                const qf = s.quotFiles ?? [];
                return (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    <td>{s.name || '-'}</td>
                    <td>{s.email || '-'}</td>
                    <td>{s.fax || '-'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="btn"
                        style={{ fontSize: 11, padding: '3px 8px' }}
                        title={qf.length ? 'View / manage received quotation files' : 'Upload received quotation (image/PDF)'}
                        onClick={(e) => {
                          if (qf.length) {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setQuotPopover({ rfqId: d.id, supplierIdx: idx, x: rect.left, y: rect.bottom + 4 });
                          } else {
                            triggerQuotUpload(d.id, idx);
                          }
                        }}
                      >{qf.length ? `Quot (${qf.length})` : 'Upload'}</button>
                    </td>
                  </tr>
                );
              })}
              {!d.suppliers?.length && <tr><td colSpan={5} className="empty">No suppliers.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table className="listing-table">
          <thead>
            <tr>
              <th>No.</th>
              <th>Item Description</th>
              <th>Quantity</th>
              <th>Unit</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {(d.items?.length ? d.items : []).map((it, idx) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td>{it.description || '-'}</td>
                <td>{it.quantity || '-'}</td>
                <td>{it.unit || '-'}</td>
                <td>{it.remarks || '-'}</td>
              </tr>
            ))}
            {!d.items?.length && <tr><td colSpan={5} className="empty">No items.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}
