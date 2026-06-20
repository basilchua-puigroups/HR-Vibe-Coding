import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../../components/Modal';
import { nextId, nextPMScheduleNo } from '../../utils/codes';
import { today } from '../../utils/format';
import { appendAudit } from '../../utils/audit';
import type { PMSchedule } from '../../types';

const FREQUENCIES = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annual'] as const;

const BLANK: Omit<PMSchedule, 'id'> = {
  scheduleNo: '', equipment: '', station: '', frequency: 'Monthly',
  lastServiceDate: '', nextServiceDate: '', assignedMechanic: '',
  status: 'Scheduled', remarks: '',
};

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function calcNextDate(lastDate: string, frequency: string): string {
  if (!lastDate) return '';
  const d = new Date(lastDate);
  switch (frequency) {
    case 'Daily':     d.setDate(d.getDate() + 1); break;
    case 'Weekly':    d.setDate(d.getDate() + 7); break;
    case 'Monthly':   d.setMonth(d.getMonth() + 1); break;
    case 'Quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'Annual':    d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toISOString().slice(0, 10);
}

/** Visual badge driven by nextServiceDate — Completed is always honoured as-is. */
function statusBadge(status: string, nextServiceDate: string) {
  let display = status;
  if (status !== 'Completed' && nextServiceDate) {
    const todayStr = today();
    if (nextServiceDate < todayStr)             display = 'Overdue';
    else if (nextServiceDate <= addDays(todayStr, 7)) display = 'Due';
    else                                         display = 'Scheduled';
  }

  const styles: Record<string, { bg: string; color: string }> = {
    Scheduled: { bg: '#dbeafe', color: '#1e40af' },
    Due:       { bg: '#fef9c3', color: '#92400e' },
    Overdue:   { bg: '#fee2e2', color: '#991b1b' },
    Completed: { bg: '#d1fae5', color: '#065f46' },
  };
  const { bg, color } = styles[display] ?? { bg: '#e2e8f0', color: '#475569' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 11, fontWeight: 700, background: bg, color,
    }}>
      {display}
    </span>
  );
}

export default function PMSchedulePage() {
  const { state, setState } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PMSchedule | null>(null);
  const [form, setForm] = useState<Omit<PMSchedule, 'id'>>(BLANK);

  function openAdd() {
    setEditing(null);
    const lastDate = today();
    setForm({
      ...BLANK,
      scheduleNo: nextPMScheduleNo(state),
      lastServiceDate: lastDate,
      nextServiceDate: calcNextDate(lastDate, BLANK.frequency),
    });
    setOpen(true);
  }

  function openEdit(s: PMSchedule) {
    setEditing(s);
    setForm({
      scheduleNo: s.scheduleNo, equipment: s.equipment, station: s.station,
      frequency: s.frequency, lastServiceDate: s.lastServiceDate,
      nextServiceDate: s.nextServiceDate, assignedMechanic: s.assignedMechanic,
      status: s.status, remarks: s.remarks,
    });
    setOpen(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.equipment.trim()) { alert('Equipment is required.'); return; }
    setState((prev) => {
      if (editing) {
        return appendAudit(
          { ...prev, pmSchedules: prev.pmSchedules.map((s) => s.id === editing.id ? { ...editing, ...form } : s) },
          currentUser, 'PM Schedule', 'Edit', {
            recordRef: form.scheduleNo, recordId: editing.id,
            details: `${form.equipment} (${form.frequency})`,
          },
        );
      }
      const newSchedule: PMSchedule = { id: nextId(prev.pmSchedules), ...form };
      return appendAudit(
        { ...prev, pmSchedules: [newSchedule, ...prev.pmSchedules] },
        currentUser, 'PM Schedule', 'Create', {
          recordRef: newSchedule.scheduleNo, recordId: newSchedule.id,
          details: `${newSchedule.equipment} (${newSchedule.frequency})`,
        },
      );
    });
    setOpen(false);
  }

  function handleDelete(id: number) {
    if (!confirm('Delete this PM schedule?')) return;
    const target = state.pmSchedules.find((s) => s.id === id);
    setState((prev) => appendAudit(
      { ...prev, pmSchedules: prev.pmSchedules.filter((s) => s.id !== id) },
      currentUser, 'PM Schedule', 'Delete', {
        recordRef: target?.scheduleNo, recordId: id, details: target?.equipment,
      },
    ));
  }

  /** When frequency OR lastServiceDate changes, auto-recalculate nextServiceDate. */
  function patchFreqOrDate(patch: Partial<Omit<PMSchedule, 'id'>>) {
    setForm((f) => {
      const merged = { ...f, ...patch };
      if ((patch.frequency !== undefined || patch.lastServiceDate !== undefined) && merged.lastServiceDate) {
        merged.nextServiceDate = calcNextDate(merged.lastServiceDate, merged.frequency);
      }
      return merged;
    });
  }

  const activeMechanics = state.mechanics.filter((m) => m.status === 'Active');

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Preventive Maintenance Schedule</h2>
          <p>Plan and track recurring maintenance for equipment.</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => navigate('/maintenance')}>Back</button>
          <button className="btn primary" onClick={openAdd}>+ Add Schedule</button>
        </div>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table className="listing-table">
            <thead>
              <tr>
                <th>Schedule No.</th>
                <th>Equipment</th>
                <th>Station</th>
                <th>Frequency</th>
                <th>Last Service</th>
                <th>Next Service</th>
                <th>Assigned To</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {state.pmSchedules.length === 0 ? (
                <tr><td colSpan={9} className="empty">No PM schedules yet. Click + Add Schedule to begin.</td></tr>
              ) : state.pmSchedules.map((s) => (
                <tr key={s.id}>
                  <td>{s.scheduleNo}</td>
                  <td>{s.equipment}</td>
                  <td>{s.station || '-'}</td>
                  <td>{s.frequency}</td>
                  <td>{s.lastServiceDate || '-'}</td>
                  <td>{s.nextServiceDate || '-'}</td>
                  <td>{s.assignedMechanic || '-'}</td>
                  <td>{statusBadge(s.status, s.nextServiceDate)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn" style={{ fontSize: 12, padding: '4px 10px', marginRight: 4 }} onClick={() => openEdit(s)}>Edit</button>
                    <button className="btn danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete(s.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit PM Schedule' : 'New PM Schedule'} wide>
        <form className="form-grid" onSubmit={handleSave}>
          <label>
            Schedule No.
            <input value={form.scheduleNo} onChange={(e) => setForm((f) => ({ ...f, scheduleNo: e.target.value }))} placeholder="Auto-generated if blank" />
          </label>
          <label>
            Frequency
            <select value={form.frequency} onChange={(e) => patchFreqOrDate({ frequency: e.target.value })}>
              {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label className="full">
            Equipment <span style={{ color: 'red' }}>*</span>
            <input value={form.equipment} onChange={(e) => setForm((f) => ({ ...f, equipment: e.target.value }))} placeholder="e.g. Sterilizer No. 1, Screw Press" required />
          </label>
          <label>
            Station
            <select value={form.station} onChange={(e) => setForm((f) => ({ ...f, station: e.target.value }))}>
              <option value="">-- Select station --</option>
              {state.stations.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </label>
          <label>
            Assigned Mechanic
            <select value={form.assignedMechanic} onChange={(e) => setForm((f) => ({ ...f, assignedMechanic: e.target.value }))}>
              <option value="">-- Not assigned --</option>
              {activeMechanics.map((m) => (
                <option key={m.id} value={m.name}>
                  {m.name}{m.specialization ? ` (${m.specialization})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Last Service Date
            <input type="date" value={form.lastServiceDate} onChange={(e) => patchFreqOrDate({ lastServiceDate: e.target.value })} />
          </label>
          <label>
            Next Service Date
            <input type="date" value={form.nextServiceDate} onChange={(e) => setForm((f) => ({ ...f, nextServiceDate: e.target.value }))} />
          </label>
          <label>
            Status
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              <option value="Scheduled">Scheduled</option>
              <option value="Due">Due</option>
              <option value="Overdue">Overdue</option>
              <option value="Completed">Completed</option>
            </select>
          </label>
          <label className="full">
            Remarks
            <textarea value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
          </label>
          <button className="btn primary full" type="submit">Save Schedule</button>
        </form>
      </Modal>
    </>
  );
}
