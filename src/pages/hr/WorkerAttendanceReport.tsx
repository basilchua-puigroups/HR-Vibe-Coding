import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NoPermission } from '../../components/NoPermission';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { hasPerm } from '../../utils/permissions';

const SLOT_HOURS = [7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,0,1,2,3,4,5,6];

function slotLabel(h: number): string {
  return String(h).padStart(2, '0') + '00';
}

function shiftDateOf(date: Date): string {
  const d = new Date(date);
  if (d.getHours() < 7) d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function formatTime(iso: string): string {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

export default function WorkerAttendanceReport() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { state } = useApp();

  const [date, setDate]   = useState(() => shiftDateOf(new Date()));
  const [shift, setShift] = useState<'All' | 'A' | 'B'>('All');
  const [preview, setPreview] = useState<{ src: string; name: string; capturedAt: string; workerName: string } | null>(null);

  if (!hasPerm(currentUser, 'viewWorkerAttendance')) return <NoPermission backPath="/human-resources" />;

  const workers = (state.workers ?? []).filter((w) => {
    if (w.status !== 'Active') return false;
    if (shift !== 'All' && w.shift !== shift) return false;
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name));

  const attendance = (state.workerAttendance ?? []).filter((a) => a.date === date);

  const getPhoto = (workerId: number, slotHour: number) =>
    attendance.find((a) => a.workerId === workerId && a.slotHour === slotHour) ?? null;

  return (
    <article className="panel">
      <div className="panel-header">
        <h3>Worker Attendance Report</h3>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px 0', flexWrap: 'wrap' }}>
        <button className="btn" onClick={() => navigate('/human-resources')}>Back</button>
        <input
          type="date"
          className="form-control"
          style={{ width: 160 }}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <select
          className="form-control"
          style={{ width: 120 }}
          value={shift}
          onChange={(e) => setShift(e.target.value as 'All' | 'A' | 'B')}
        >
          <option value="All">All Shifts</option>
          <option value="A">Shift A</option>
          <option value="B">Shift B</option>
        </select>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          {workers.length} worker{workers.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="panel-body" style={{ padding: '12px 0 0' }}>
        {workers.length === 0 ? (
          <p className="empty">No active workers found.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, zIndex: 2, background: '#f8fafc', whiteSpace: 'nowrap', minWidth: 140 }}>Worker</th>
                  <th style={{ background: '#f8fafc', width: 40, textAlign: 'center' }}>Shift</th>
                  {SLOT_HOURS.map((h) => (
                    <th key={h} style={{ background: '#f8fafc', textAlign: 'center', padding: '8px 4px', minWidth: 44, fontSize: 10 }}>
                      {slotLabel(h)}
                    </th>
                  ))}
                  <th style={{ background: '#f8fafc', textAlign: 'center', minWidth: 50 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((worker) => {
                  const workerPhotos = attendance.filter((a) => a.workerId === worker.id);
                  const total = workerPhotos.length;
                  return (
                    <tr key={worker.id}>
                      <td style={{ position: 'sticky', left: 0, background: '#fff', zIndex: 1, boxShadow: '2px 0 4px rgba(0,0,0,0.04)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {worker.name}
                        <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>{worker.staffId || worker.workerId}</div>
                      </td>
                      <td style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 11 }}>{worker.shift}</td>
                      {SLOT_HOURS.map((h) => {
                        const photo = getPhoto(worker.id, h);
                        return (
                          <td key={h} style={{ textAlign: 'center', padding: '6px 2px' }}>
                            {photo ? (
                              <button
                                title={`${slotLabel(h)} — ${formatTime(photo.capturedAt)}`}
                                onClick={() => photo.photoData && setPreview({
                                  src: photo.photoData,
                                  name: photo.photoName,
                                  capturedAt: photo.capturedAt,
                                  workerName: worker.name,
                                })}
                                style={{
                                  background: 'none', border: 'none', cursor: photo.photoData ? 'pointer' : 'default',
                                  color: '#16a34a', fontSize: 16, fontWeight: 700, padding: 0,
                                }}
                              >✓</button>
                            ) : (
                              <span style={{ color: '#e2e8f0', fontSize: 14 }}>—</span>
                            )}
                          </td>
                        );
                      })}
                      <td style={{ textAlign: 'center', fontWeight: 700, color: total > 0 ? 'var(--text)' : 'var(--muted)' }}>
                        {total}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--line)', background: '#f8fafc' }}>
                  <td style={{ position: 'sticky', left: 0, background: '#f8fafc', fontWeight: 700, zIndex: 1 }} colSpan={2}>
                    Total
                  </td>
                  {SLOT_HOURS.map((h) => {
                    const count = workers.filter((w) => getPhoto(w.id, h)).length;
                    return (
                      <td key={h} style={{ textAlign: 'center', fontWeight: 600, fontSize: 12, color: count > 0 ? 'var(--text)' : 'var(--muted)' }}>
                        {count > 0 ? count : '—'}
                      </td>
                    );
                  })}
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>
                    {attendance.length}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {preview && (
        <div
          onClick={() => setPreview(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
        >
          <img
            src={preview.src} alt={preview.name}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '75vh', borderRadius: 8, boxShadow: '0 8px 40px rgba(0,0,0,0.6)', cursor: 'default' }}
          />
          <div style={{ marginTop: 14, textAlign: 'center', color: '#e2e8f0' }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{preview.workerName}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{preview.name} · {formatTime(preview.capturedAt)}</div>
            <button className="btn" style={{ marginTop: 12, fontSize: 12 }} onClick={() => setPreview(null)}>Close</button>
          </div>
        </div>
      )}
    </article>
  );
}
