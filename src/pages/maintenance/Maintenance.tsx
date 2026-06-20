import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../../components/Modal';
import { today } from '../../utils/format';
import { nextJobNo, nextId } from '../../utils/codes';
import { appendAudit } from '../../utils/audit';
import { hasPerm } from '../../utils/permissions';
import { NoPermission } from '../../components/NoPermission';
import { consumeFifo, restoreFifoSource } from '../../utils/fifo';
import type { MaintenanceJob, MaintenanceJobItem, Movement } from '../../types';

type View = 'list' | 'form' | 'detail';

const blankItem = (): MaintenanceJobItem => ({
  itemId: 0, description: '', quantityUsed: 0, unit: '', remarks: '',
});

function statusBadge(status: string | undefined) {
  const s = status || 'Pending';
  const bg = s === 'Approved' ? '#198754' : '#6c757d';
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, color: '#fff', background: bg }}>
      {s}
    </span>
  );
}

/** Build a usable items array from either the new `items` field or legacy `itemId`/`quantityUsed`. */
function legacyToItems(job: MaintenanceJob, inventoryLookup: (id: number) => { item: string; unit: string } | undefined): MaintenanceJobItem[] {
  if (job.items?.length) return job.items;
  if (job.itemId) {
    const inv = inventoryLookup(job.itemId);
    return [{
      itemId: job.itemId,
      description: inv?.item ?? '',
      quantityUsed: job.quantityUsed ?? 0,
      unit: inv?.unit ?? '',
      remarks: '',
    }];
  }
  return [];
}

export default function Maintenance() {
  const { state, setState } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const canView    = hasPerm(currentUser, 'viewMaintLog');
  const canCreate  = hasPerm(currentUser, 'createMaintLog');
  const canEdit    = hasPerm(currentUser, 'editMaintLog');
  const canDelete  = hasPerm(currentUser, 'deleteMaintLog');
  const canApprove = hasPerm(currentUser, 'approveMaintLog');

  if (!canView) return <NoPermission backPath="/maintenance" />;

  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<MaintenanceJob | null>(null);
  const [detail, setDetail] = useState<MaintenanceJob | null>(null);
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState<string>('10');

  const [form, setForm] = useState({
    jobNo: '', date: today(), equipment: '', technician: '', remarks: '',
  });
  const [items, setItems] = useState<MaintenanceJobItem[]>([blankItem()]);
  const [photos, setPhotos] = useState<Array<{ name: string; data: string }>>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightbox, setLightbox] = useState<{ name: string; data: string } | null>(null);
  const [saveConfirm, setSaveConfirm] = useState(false);
  const [actionConfirm, setActionConfirm] = useState<{ message: string; label: string; btnClass: string; onConfirm: () => void } | null>(null);

  const lookupInv = (id: number) => state.inventory.find((i) => i.id === id);
  const partName  = (id: number) => lookupInv(id)?.item ?? '-';

  function openNew() {
    setEditing(null);
    setForm({ jobNo: nextJobNo(state), date: today(), equipment: '', technician: '', remarks: '' });
    setItems([blankItem()]);
    setPhotos([]);
    setView('form');
  }

  function openEdit(job: MaintenanceJob) {
    setEditing(job);
    setForm({
      jobNo: job.jobNo,
      date: job.date,
      equipment: job.equipment,
      technician: job.technician,
      remarks: job.remarks,
    });
    setItems(legacyToItems(job, lookupInv));
    setPhotos(job.photos ?? []);
    setView('form');
  }

  function openDetail(job: MaintenanceJob) {
    setDetail(job);
    setView('detail');
  }

  function backToList() {
    setEditing(null);
    setDetail(null);
    setView('list');
  }

  // ── item row helpers ──
  function updateItem(idx: number, patch: Partial<MaintenanceJobItem>) {
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const merged = { ...it, ...patch };
      if (patch.itemId !== undefined) {
        const inv = lookupInv(patch.itemId);
        merged.description = inv?.item ?? '';
        merged.unit = inv?.unit ?? '';
      }
      return merged;
    }));
  }
  function addItem()    { setItems((prev) => [...prev, blankItem()]); }
  function removeItem(idx: number) { setItems((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev); }

  // ── photo helpers ──
  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) { e.target.value = ''; return; }
    const MAX_BYTES = 2 * 1024 * 1024;
    const oversized = files.filter((f) => f.size > MAX_BYTES);
    if (oversized.length) {
      alert(`Image too large: ${oversized.map((f) => f.name).join(', ')}.\nMax 2 MB per image. Please compress and try again.`);
      e.target.value = '';
      return;
    }
    const notImages = files.filter((f) => !f.type.startsWith('image/'));
    if (notImages.length) {
      alert(`Only image files are allowed: ${notImages.map((f) => f.name).join(', ')}.`);
      e.target.value = '';
      return;
    }
    Promise.all(
      files.map((f) => new Promise<{ name: string; data: string }>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve({ name: f.name, data: r.result as string });
        r.onerror = reject;
        r.readAsDataURL(f);
      }))
    ).then((newPhotos) => setPhotos((prev) => [...prev, ...newPhotos]));
    e.target.value = '';
  }
  function removePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  // ── handlers ──
  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.equipment.trim()) { alert('Equipment is required.'); return; }
    const cleanItems = items.filter((it) => it.itemId && Number(it.quantityUsed) > 0);
    if (!cleanItems.length) { alert('At least one item with quantity > 0 is required.'); return; }
    setSaveConfirm(true);
  }

  function doSave() {
    setSaveConfirm(false);
    const cleanItems = items
      .filter((it) => it.itemId && Number(it.quantityUsed) > 0)
      .map((it) => ({ ...it, quantityUsed: Number(it.quantityUsed) || 0 }));

    setState((prev) => {
      // If we're editing a previously Approved record, reverse its prior inventory
      // deductions and remove its movements so re-approval re-applies cleanly.
      let nextInventory = prev.inventory;
      let nextMovements = prev.movements;
      let nextStockLayers = prev.stockLayers ?? [];
      let nextStockLayerConsumptions = prev.stockLayerConsumptions ?? [];
      if (editing?.status === 'Approved') {
        const restoredFifo = restoreFifoSource(prev, 'Maintenance Log', editing.jobNo);
        nextStockLayers = restoredFifo.stockLayers;
        nextStockLayerConsumptions = restoredFifo.stockLayerConsumptions;
        const oldItems = legacyToItems(editing, (id) => prev.inventory.find((i) => i.id === id));
        nextInventory = prev.inventory.map((inv) => {
          const total = oldItems.reduce((sum, it) => it.itemId === inv.id ? sum + (Number(it.quantityUsed) || 0) : sum, 0);
          return total > 0 ? { ...inv, quantity: inv.quantity + total } : inv;
        });
        nextMovements = prev.movements.filter((m) => !(m.type === 'Issue' && m.reference === editing.jobNo));
      }

      const first = cleanItems[0];
      const record: MaintenanceJob = {
        id: editing?.id ?? nextId(prev.maintenance),
        jobNo: form.jobNo || nextJobNo(prev),
        date: form.date,
        equipment: form.equipment,
        technician: form.technician,
        items: cleanItems,
        remarks: form.remarks,
        photos,
        status: 'Pending',
        createdBy: editing?.createdBy ?? currentUser?.username ?? '',
        createdAt: editing?.createdAt ?? today(),
        approvedBy: '',
        approvedDate: '',
        // Legacy single-item fields — keep populated so Supabase sync (which only
        // knows about itemId/quantityUsed) still has the primary part on record.
        itemId: first?.itemId,
        quantityUsed: first?.quantityUsed,
      };

      const next = editing
        ? { ...prev, inventory: nextInventory, movements: nextMovements, stockLayers: nextStockLayers, stockLayerConsumptions: nextStockLayerConsumptions, maintenance: prev.maintenance.map((m) => m.id === editing.id ? record : m) }
        : { ...prev, inventory: nextInventory, movements: nextMovements, stockLayers: nextStockLayers, stockLayerConsumptions: nextStockLayerConsumptions, maintenance: [record, ...prev.maintenance] };

      return appendAudit(next, currentUser, 'Maintenance Log', editing ? 'Edit' : 'Create', {
        recordRef: record.jobNo, recordId: record.id,
        details: `${form.equipment} — ${cleanItems.length} item(s), ${photos.length} photo(s)`,
      });
    });
    backToList();
  }

  function handleApprove(job: MaintenanceJob) {
    const jobItems = legacyToItems(job, lookupInv);
    // Stock check
    const totals = new Map<number, number>();
    for (const it of jobItems) totals.set(it.itemId, (totals.get(it.itemId) ?? 0) + Number(it.quantityUsed || 0));
    for (const [itemId, qty] of totals) {
      const inv = state.inventory.find((i) => i.id === itemId);
      if (inv && qty > inv.quantity) {
        alert(`Cannot approve — insufficient stock:\n\n${inv.item} — requested ${qty} ${inv.unit} exceeds stock on hand (${inv.quantity} ${inv.unit}).`);
        return;
      }
    }
    const name = currentUser?.username ?? 'Authorized User';
    setState((prev) => {
      const fifo = consumeFifo(
        prev,
        jobItems.map((it) => ({ itemId: it.itemId, quantity: Number(it.quantityUsed || 0) })),
        { sourceType: 'Maintenance Log', sourceRef: job.jobNo, sourceId: job.id, issueDate: job.date },
      );
      if (fifo.error) {
        alert(`Cannot approve — ${fifo.error}`);
        return prev;
      }
      const updatedInventory = [...prev.inventory];
      const baseMovId = nextId(prev.movements);
      const newMovements: Movement[] = jobItems.map((it, i) => {
        const idx = updatedInventory.findIndex((inv) => inv.id === it.itemId);
        if (idx >= 0) {
          updatedInventory[idx] = { ...updatedInventory[idx], quantity: updatedInventory[idx].quantity - Number(it.quantityUsed || 0) };
        }
        return {
          id: baseMovId + i,
          itemId: it.itemId,
          date: job.date,
          type: 'Issue',
          stockType: 'Direct Issue',
          reference: job.jobNo,
          quantity: -Number(it.quantityUsed || 0),
          note: `Maintenance: ${job.equipment}`,
          status: 'Approved',
          approvedBy: name,
        };
      });
      const updated: MaintenanceJob = { ...job, items: jobItems, status: 'Approved', approvedBy: name, approvedDate: today() };
      const next = {
        ...prev,
        inventory: updatedInventory,
        movements: [...newMovements, ...prev.movements],
        stockLayers: fifo.stockLayers,
        stockLayerConsumptions: fifo.stockLayerConsumptions,
        maintenance: prev.maintenance.map((m) => m.id === job.id ? updated : m),
      };
      return appendAudit(next, currentUser, 'Maintenance Log', 'Approve', {
        recordRef: job.jobNo, recordId: job.id,
        details: `${jobItems.length} item(s) deducted from stock`,
      });
    });
    setDetail((d) => d && d.id === job.id ? { ...d, status: 'Approved', approvedBy: name, approvedDate: today() } : d);
  }

  function handleDelete(job: MaintenanceJob) {
    setActionConfirm({
      message: `Delete maintenance record ${job.jobNo}?\n\n${job.status === 'Approved' ? 'Stock will be restored.' : ''}`,
      label: 'Delete',
      btnClass: 'btn danger',
      onConfirm: () => {
        setActionConfirm(null);
        setState((prev) => {
          const jobItems = legacyToItems(job, (id) => prev.inventory.find((i) => i.id === id));
          let nextInventory = prev.inventory;
          let nextStockLayers = prev.stockLayers ?? [];
          let nextStockLayerConsumptions = prev.stockLayerConsumptions ?? [];
          if (job.status === 'Approved') {
            const restoredFifo = restoreFifoSource(prev, 'Maintenance Log', job.jobNo);
            nextStockLayers = restoredFifo.stockLayers;
            nextStockLayerConsumptions = restoredFifo.stockLayerConsumptions;
            nextInventory = prev.inventory.map((inv) => {
              const total = jobItems.reduce((sum, it) => it.itemId === inv.id ? sum + (Number(it.quantityUsed) || 0) : sum, 0);
              return total > 0 ? { ...inv, quantity: inv.quantity + total } : inv;
            });
          }
          const next = {
            ...prev,
            inventory: nextInventory,
            stockLayers: nextStockLayers,
            stockLayerConsumptions: nextStockLayerConsumptions,
            maintenance: prev.maintenance.filter((m) => m.id !== job.id),
            movements: prev.movements.filter((m) => !(m.type === 'Issue' && m.reference === job.jobNo)),
          };
          return appendAudit(next, currentUser, 'Maintenance Log', 'Delete', {
            recordRef: job.jobNo, recordId: job.id,
            details: job.status === 'Approved' ? 'Inventory restored' : 'Pending record',
          });
        });
        if (detail?.id === job.id) backToList();
      },
    });
  }

  // ─────────── DETAIL VIEW ───────────
  if (view === 'detail' && detail) {
    const d = state.maintenance.find((m) => m.id === detail.id) ?? detail;
    const dItems = legacyToItems(d, lookupInv);
    const dPhotos = d.photos ?? [];
    return (
      <>
        <div className="topbar">
          <div>
            <h2>Maintenance Job {d.jobNo}</h2>
            <p>Created by {d.createdBy || '-'} on {d.createdAt || d.date} · Status: {statusBadge(d.status)}</p>
          </div>
          <div className="actions">
            <button className="btn" onClick={backToList}>Back</button>
            {canApprove && d.status !== 'Approved' && (
              <button className="btn primary" onClick={() => handleApprove(d)}>Approve</button>
            )}
            {canEdit && <button className="btn" onClick={() => openEdit(d)}>Edit</button>}
            {canDelete && <button className="btn danger" onClick={() => handleDelete(d)}>Delete</button>}
          </div>
        </div>

        <article className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-header"><h3>Job Details</h3></div>
          <div className="panel-body">
            <div className="form-grid">
              <label>Job No.<input value={d.jobNo} readOnly /></label>
              <label>Date<input value={d.date} readOnly /></label>
              <label>Equipment<input value={d.equipment} readOnly /></label>
              <label>Technician<input value={d.technician || '-'} readOnly /></label>
              {d.status === 'Approved' && (
                <>
                  <label>Approved By<input value={d.approvedBy || '-'} readOnly /></label>
                  <label>Approved Date<input value={d.approvedDate || '-'} readOnly /></label>
                </>
              )}
              <label className="full">Remarks<textarea value={d.remarks || ''} readOnly /></label>
            </div>
          </div>
        </article>

        <article className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-header"><h3>Parts Used</h3></div>
          <div className="table-wrap">
            <table className="listing-table">
              <thead>
                <tr><th>Part</th><th>Qty</th><th>Unit</th><th>Remarks</th></tr>
              </thead>
              <tbody>
                {dItems.length === 0 ? (
                  <tr><td colSpan={4} className="empty">No parts logged.</td></tr>
                ) : dItems.map((it, i) => (
                  <tr key={i}>
                    <td>{it.description || partName(it.itemId)}</td>
                    <td>{it.quantityUsed}</td>
                    <td>{it.unit || '-'}</td>
                    <td>{it.remarks || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header"><h3>Photos ({dPhotos.length})</h3></div>
          <div className="panel-body">
            {dPhotos.length === 0 ? (
              <p className="empty" style={{ padding: 12 }}>No photos attached.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                {dPhotos.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setLightbox(p)}
                    title={p.name}
                    style={{
                      padding: 0, border: '1px solid var(--line)', borderRadius: 6,
                      background: '#f8fafc', cursor: 'pointer', overflow: 'hidden',
                    }}
                  >
                    {p.data ? (
                      <img src={p.data} alt={p.name} style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <div style={{ width: '100%', height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 12, padding: 8, textAlign: 'center' }}>
                        {p.name}<br />(re-syncing…)
                      </div>
                    )}
                    <div style={{ padding: '4px 6px', fontSize: 11, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.name}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </article>

        <Modal open={!!lightbox} onClose={() => setLightbox(null)} title={lightbox?.name ?? 'Photo'} wide>
          {lightbox?.data ? (
            <img src={lightbox.data} alt={lightbox.name} style={{ width: '100%', height: 'auto', display: 'block' }} />
          ) : (
            <p className="empty">Image not available yet — re-fetch from Supabase first.</p>
          )}
        </Modal>
      </>
    );
  }

  // ─────────── FORM VIEW ───────────
  if (view === 'form') {
    return (
      <>
        <Modal open={saveConfirm} onClose={() => setSaveConfirm(false)} title="Confirm Save" hideClose>
          <p style={{ margin: '0 0 20px', fontSize: 14 }}>
            {editing ? `Save changes to ${form.jobNo}?` : `Create maintenance job ${form.jobNo}?`}
            {editing?.status === 'Approved' && <><br /><br /><strong>Note:</strong> editing will revert this record to Pending and restore the stock; it must be Approved again.</>}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn" type="button" onClick={() => setSaveConfirm(false)}>Cancel</button>
            <button className="btn primary" type="button" onClick={doSave}>Save</button>
          </div>
        </Modal>

        <div className="topbar">
          <div>
            <h2>{editing ? `Edit ${editing.jobNo}` : 'New Maintenance Job'}</h2>
            <p>Record parts consumed against an equipment maintenance job.</p>
          </div>
          <div className="actions">
            <button className="btn" onClick={backToList}>Cancel</button>
          </div>
        </div>

        <form onSubmit={handleSave}>
          <article className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-header"><h3>Job Details</h3></div>
            <div className="panel-body">
              <div className="form-grid">
                <label>
                  Job No.
                  <input value={form.jobNo} onChange={(e) => setForm((f) => ({ ...f, jobNo: e.target.value }))} placeholder="Auto-generated if blank" />
                </label>
                <label>
                  Date <span style={{ color: 'red' }}>*</span>
                  <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
                </label>
                <label>
                  Equipment <span style={{ color: 'red' }}>*</span>
                  <input value={form.equipment} onChange={(e) => setForm((f) => ({ ...f, equipment: e.target.value }))} placeholder="Sterilizer, press, boiler…" required />
                </label>
                <label>
                  Technician
                  <input value={form.technician} onChange={(e) => setForm((f) => ({ ...f, technician: e.target.value }))} />
                </label>
                <label className="full">
                  Remarks
                  <textarea value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} placeholder="Work description or issue found" />
                </label>
              </div>
            </div>
          </article>

          <article className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-header">
              <h3>Parts Used</h3>
              <button type="button" className="btn primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={addItem}>+ Add Part</button>
            </div>
            <div className="table-wrap">
              <table style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Part</th>
                    <th style={{ width: 90 }}>Qty</th>
                    <th style={{ width: 70 }}>Unit</th>
                    <th>Remarks</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx}>
                      <td>
                        <select value={it.itemId} style={{ width: '100%', fontSize: 13, border: '1px solid #ccc', borderRadius: 3, padding: '3px 5px' }} onChange={(e) => updateItem(idx, { itemId: Number(e.target.value) })}>
                          <option value={0}>-- Select Part --</option>
                          {state.inventory.map((i) => <option key={i.id} value={i.id}>{i.item}{i.stockId ? ` (${i.stockId})` : ''}</option>)}
                        </select>
                      </td>
                      <td><input type="number" min="0" step="1" value={it.quantityUsed || ''} placeholder="0" style={{ width: 80, fontSize: 13, border: '1px solid #ccc', borderRadius: 3, padding: '3px 5px' }} onChange={(e) => updateItem(idx, { quantityUsed: Number(e.target.value) })} /></td>
                      <td><input value={it.unit} readOnly style={{ width: 60, fontSize: 13, border: '1px solid #ccc', borderRadius: 3, padding: '3px 5px', background: '#f5f5f5' }} /></td>
                      <td><input value={it.remarks ?? ''} style={{ width: '100%', fontSize: 13, border: '1px solid #ccc', borderRadius: 3, padding: '3px 5px' }} onChange={(e) => updateItem(idx, { remarks: e.target.value })} /></td>
                      <td><button type="button" className="square-btn danger" onClick={() => removeItem(idx)}>-</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-header">
              <h3>Photos ({photos.length})</h3>
              <button type="button" className="btn primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => fileInputRef.current?.click()}>+ Add Photos</button>
            </div>
            <div className="panel-body">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={handlePhotoUpload}
              />
              {photos.length === 0 ? (
                <p className="empty" style={{ padding: 12 }}>
                  No photos yet. Click <strong>+ Add Photos</strong> to attach JPG/PNG images (max 2 MB each).
                </p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                  {photos.map((p, i) => (
                    <div key={i} style={{ position: 'relative', border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden', background: '#f8fafc' }}>
                      <img src={p.data} alt={p.name} style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block', cursor: 'pointer' }} onClick={() => setLightbox(p)} />
                      <div style={{ padding: '4px 6px', fontSize: 11, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        style={{
                          position: 'absolute', top: 4, right: 4,
                          background: 'rgba(220, 38, 38, 0.85)', color: '#fff',
                          border: 'none', borderRadius: '50%',
                          width: 22, height: 22, cursor: 'pointer',
                          fontSize: 14, lineHeight: '20px', fontWeight: 700,
                        }}
                        title="Remove photo"
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </article>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn" onClick={backToList}>Cancel</button>
            <button type="submit" className="btn primary">{editing ? 'Save Changes' : 'Create Job'}</button>
          </div>
        </form>

        <Modal open={!!lightbox} onClose={() => setLightbox(null)} title={lightbox?.name ?? 'Photo'} wide>
          {lightbox?.data && <img src={lightbox.data} alt={lightbox.name} style={{ width: '100%', height: 'auto', display: 'block' }} />}
        </Modal>
      </>
    );
  }

  // ─────────── LIST VIEW ───────────
  const filtered = state.maintenance.filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const itemsText = legacyToItems(m, lookupInv).map((it) => it.description || partName(it.itemId)).join(' ');
    const text = `${m.jobNo} ${m.date} ${m.equipment} ${m.technician ?? ''} ${itemsText} ${m.remarks ?? ''} ${m.status ?? ''}`.toLowerCase();
    return text.includes(q);
  });
  const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date));
  const shown = entries === 'all' ? sorted : sorted.slice(0, Number(entries));

  return (
    <>
      <Modal open={!!actionConfirm} onClose={() => setActionConfirm(null)} title="Confirm" hideClose>
        <p style={{ margin: '0 0 20px', fontSize: 14, whiteSpace: 'pre-wrap' }}>{actionConfirm?.message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn" type="button" onClick={() => setActionConfirm(null)}>Cancel</button>
          <button className={actionConfirm?.btnClass ?? 'btn primary'} type="button" onClick={() => actionConfirm?.onConfirm()}>{actionConfirm?.label}</button>
        </div>
      </Modal>

      <div className="topbar">
        <div>
          <h2>Maintenance Log</h2>
          <p>Record parts consumed against equipment maintenance jobs.</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => navigate('/maintenance')}>Back</button>
          {canCreate && <button className="btn primary" onClick={openNew}>+ New Job</button>}
        </div>
      </div>

      <div className="panel">
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
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Job No, equipment, part, technician…" />
          </label>
        </div>

        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="listing-table">
            <thead>
              <tr>
                <th>Job No.</th>
                <th>Date</th>
                <th>Equipment</th>
                <th>Technician</th>
                <th style={{ textAlign: 'center' }}>Items</th>
                <th style={{ textAlign: 'center' }}>Photos</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan={8} className="empty">{search ? 'No records match your search.' : 'No maintenance records yet.'}</td></tr>
              ) : shown.map((m) => {
                const mItems = legacyToItems(m, lookupInv);
                const mPhotos = m.photos ?? [];
                return (
                  <tr key={m.id}>
                    <td>{m.jobNo}</td>
                    <td>{m.date}</td>
                    <td>{m.equipment}</td>
                    <td>{m.technician || '-'}</td>
                    <td style={{ textAlign: 'center' }}>{mItems.length}</td>
                    <td style={{ textAlign: 'center' }}>{mPhotos.length}</td>
                    <td>{statusBadge(m.status)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn" style={{ fontSize: 12, padding: '4px 10px', marginRight: 4 }} onClick={() => openDetail(m)}>View</button>
                      {canApprove && m.status !== 'Approved' && (
                        <button className="btn primary" style={{ fontSize: 12, padding: '4px 10px', marginRight: 4 }} onClick={() => handleApprove(m)}>Approve</button>
                      )}
                      {canEdit && <button className="btn" style={{ fontSize: 12, padding: '4px 10px', marginRight: 4 }} onClick={() => openEdit(m)}>Edit</button>}
                      {canDelete && <button className="btn danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete(m)}>Delete</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
