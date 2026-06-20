import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import type { Worker } from '../../types';

const SLOT_HOURS = [7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,0,1,2,3,4,5,6];
const TASK_SESSION_KEY = 'mp_worker_task';

const TASK_OPTIONS = [
  { key: 'cagesTipped',           label: 'Cages Tipped',            abbr: 'CT', color: '#16a34a' },
  { key: 'clarificationStation',  label: 'Clarification Station',   abbr: 'CS', color: '#0284c7' },
  { key: 'kernelStation',         label: 'Kernel Station',          abbr: 'KS', color: '#7c3aed' },
  { key: 'boilerStation',         label: 'Boiler Station',          abbr: 'BS', color: '#dc2626' },
  { key: 'waterTreatmentStation', label: 'Water Treatment Station', abbr: 'WT', color: '#0891b2' },
];

function taskOption(key: string | undefined) {
  return TASK_OPTIONS.find((t) => t.key === key) ?? null;
}

function slotLabel(h: number): string {
  const s = String(h).padStart(2, '0') + '00';
  const e = String((h + 1) % 24).padStart(2, '0') + '00';
  return `${s} – ${e}`;
}

function shiftDateOf(date: Date): string {
  const d = new Date(date);
  if (d.getHours() < 7) d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function formatTime(iso: string): string {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return ''; }
}

interface Props { worker: Worker; }

export default function WorkerPortal({ worker }: Props) {
  const { logout } = useAuth();
  const { state, setState } = useApp();

  const [date, setDate] = useState(() => shiftDateOf(new Date()));
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ src: string; name: string; capturedAt: string } | null>(null);
  const [rowWarnings, setRowWarnings] = useState<Record<number, string>>({});
  const [currentTask, setCurrentTask] = useState<string | null>(
    () => sessionStorage.getItem(TASK_SESSION_KEY),
  );
  const [showTaskPicker, setShowTaskPicker] = useState(
    () => !sessionStorage.getItem(TASK_SESSION_KEY),
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const warningTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreview(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const myAttendance = (state.workerAttendance ?? []).filter(
    (a) => a.workerId === worker.id && a.date === date,
  );

  const photoForSlot = (slotHour: number) =>
    myAttendance.find((a) => a.slotHour === slotHour) ?? null;

  const showWarning = useCallback((slotHour: number, msg: string) => {
    setRowWarnings((prev) => ({ ...prev, [slotHour]: msg }));
    if (warningTimers.current[slotHour]) clearTimeout(warningTimers.current[slotHour]);
    warningTimers.current[slotHour] = setTimeout(() => {
      setRowWarnings((prev) => { const next = { ...prev }; delete next[slotHour]; return next; });
    }, 6000);
  }, []);

  const handleRowUpload = (slotHour: number) => {
    setUploadingSlot(slotHour);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const slot = uploadingSlot;
    if (slot === null) return;
    const file = e.target.files?.[0];
    if (!file) { e.target.value = ''; setUploadingSlot(null); return; }

    const taken = new Date(file.lastModified);
    const fileHour = taken.getHours();
    const fileDate = shiftDateOf(taken);

    if (fileDate !== date || fileHour !== slot) {
      const takenTime = taken.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      showWarning(slot, `Photo taken at ${fileDate} ${takenTime} — expected ${date} ${slotLabel(slot)}`);
      e.target.value = '';
      setUploadingSlot(null);
      return;
    }

    const capturedAt = taken.toISOString();
    const task = currentTask ?? undefined;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const photoData = evt.target?.result as string;
      setState((prev) => {
        const existing = (prev.workerAttendance ?? []).find(
          (a) => a.workerId === worker.id && a.date === date && a.slotHour === slot,
        );
        const maxId = (prev.workerAttendance ?? []).reduce((m, a) => Math.max(m, a.id), 0);
        const updated = existing
          ? (prev.workerAttendance ?? []).map((a) =>
              a.id === existing.id ? { ...a, photoName: file.name, photoData, capturedAt, task } : a,
            )
          : [
              ...(prev.workerAttendance ?? []),
              { id: maxId + 1, workerId: worker.id, date, slotHour: slot, photoName: file.name, photoData, capturedAt, task },
            ];
        return { ...prev, workerAttendance: updated };
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
    setUploadingSlot(null);
  };

  const selectTask = (taskKey: string) => {
    setCurrentTask(taskKey);
    sessionStorage.setItem(TASK_SESSION_KEY, taskKey);
    setShowTaskPicker(false);
  };

  const handleLogout = () => {
    sessionStorage.removeItem(TASK_SESSION_KEY);
    logout();
  };

  const clocked = myAttendance.length;
  const activeTask = taskOption(currentTask ?? undefined);
  const isFirstPick = !currentTask;

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      {/* Header */}
      <header style={{
        background: '#0f172a', padding: '0 20px', height: 58,
        display: 'flex', alignItems: 'center', gap: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8, background: '#16a34a',
            display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 14,
          }}>MP</div>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{worker.name}</div>
            <div style={{ color: '#94a3b8', fontSize: 11 }}>Shift {worker.shift} · {worker.workerId}</div>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
              color: '#e2e8f0', borderRadius: 6, padding: '5px 10px', fontSize: 13,
            }}
          />
          <span style={{ fontSize: 12, color: '#64748b' }}>{clocked}/24 slots</span>
          <button
            onClick={handleLogout}
            style={{
              border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
              color: '#94a3b8', borderRadius: 6, padding: '5px 12px',
              fontSize: 12, fontWeight: 500, cursor: 'pointer',
            }}
          >Logout</button>
        </div>
      </header>

      {/* Current Task Banner */}
      {activeTask && (
        <div style={{
          background: activeTask.color, color: '#fff',
          padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Current Task:</span>
            <span style={{ fontSize: 14 }}>{activeTask.label}</span>
          </div>
          <button
            onClick={() => setShowTaskPicker(true)}
            style={{
              background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)',
              color: '#fff', borderRadius: 6, padding: '4px 14px',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >Switch Task</button>
        </div>
      )}

      {/* Table */}
      <div style={{ padding: '20px 16px' }}>
        <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: 600, fontSize: 14 }}>
            Attendance — {date}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ padding: '10px 14px', background: '#f8fafc', color: '#64748b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left', width: 130, position: 'sticky', left: 0, zIndex: 2 }}>Time</th>
                  <th style={{ padding: '10px 14px', background: '#f8fafc', color: '#64748b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left', width: 60 }}>Task</th>
                  <th style={{ padding: '10px 14px', background: '#f8fafc', color: '#64748b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', width: 80 }}>Status</th>
                  <th style={{ padding: '10px 14px', background: '#f8fafc', color: '#64748b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', width: 90 }}>Upload</th>
                  <th style={{ padding: '10px 14px', background: '#f8fafc', color: '#64748b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Photo</th>
                </tr>
              </thead>
              <tbody>
                {SLOT_HOURS.map((h) => {
                  const photo = photoForSlot(h);
                  const warning = rowWarnings[h];
                  const slotTask = taskOption(photo?.task);
                  return (
                    <tr key={h} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#fff', zIndex: 1, boxShadow: '2px 0 4px rgba(0,0,0,0.04)' }}>
                        {slotLabel(h)}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {slotTask
                          ? (
                            <span
                              title={slotTask.label}
                              style={{
                                display: 'inline-block', background: slotTask.color,
                                color: '#fff', borderRadius: 4, padding: '2px 7px',
                                fontSize: 11, fontWeight: 700, letterSpacing: '0.5px',
                              }}
                            >{slotTask.abbr}</span>
                          )
                          : <span style={{ color: '#cbd5e1', fontSize: 12 }}>—</span>
                        }
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        {photo
                          ? <span style={{ color: '#16a34a', fontSize: 18, fontWeight: 700 }}>✓</span>
                          : <span style={{ color: '#cbd5e1', fontSize: 16 }}>—</span>
                        }
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <button
                          className="btn"
                          style={{ fontSize: 12, padding: '4px 10px' }}
                          onClick={() => handleRowUpload(h)}
                        >
                          {photo ? 'Replace' : '+ Photo'}
                        </button>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {warning && (
                          <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.4)',
                            borderRadius: 6, padding: '4px 10px', fontSize: 12, color: '#ca8a04',
                          }}>⚠ {warning}</div>
                        )}
                        {photo && photo.photoData && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <img
                              src={photo.photoData}
                              alt={photo.photoName}
                              title="Click to preview"
                              style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 4, cursor: 'pointer', border: '1px solid #e2e8f0' }}
                              onClick={() => setPreview({ src: photo.photoData, name: photo.photoName, capturedAt: photo.capturedAt })}
                            />
                            <span style={{ fontSize: 11, color: '#64748b' }}>{formatTime(photo.capturedAt)}</span>
                          </div>
                        )}
                        {!photo && !warning && <span style={{ color: '#cbd5e1', fontSize: 12 }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

      {/* Task Picker Modal */}
      {showTaskPicker && (
        <div
          onClick={isFirstPick ? undefined : () => setShowTaskPicker(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.72)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 16, padding: 28,
              width: '100%', maxWidth: 420,
              boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
                {isFirstPick ? 'What task are you doing?' : 'Switch Task'}
              </div>
              {!isFirstPick && (
                <button
                  onClick={() => setShowTaskPicker(false)}
                  style={{
                    background: 'none', border: 'none', fontSize: 20,
                    color: '#94a3b8', cursor: 'pointer', lineHeight: 1, padding: '0 4px',
                  }}
                >✕</button>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 24 }}>
              {worker.name} · Shift {worker.shift} · {date}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {TASK_OPTIONS.map((t) => {
                const isActive = currentTask === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => selectTask(t.key)}
                    style={{
                      width: '100%', padding: '14px 18px',
                      border: `2px solid ${isActive ? t.color : '#e2e8f0'}`,
                      borderRadius: 10, cursor: 'pointer',
                      background: isActive ? t.color : '#fff',
                      color: isActive ? '#fff' : '#0f172a',
                      fontWeight: 600, fontSize: 14, textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: 12,
                    }}
                  >
                    <span style={{
                      width: 34, minWidth: 34, height: 34, borderRadius: 8,
                      background: isActive ? 'rgba(255,255,255,0.25)' : t.color,
                      color: '#fff', fontWeight: 800, fontSize: 11,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{t.abbr}</span>
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {preview && (
        <div
          onClick={() => setPreview(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
        >
          <img
            src={preview.src} alt={preview.name}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '80vh', borderRadius: 8, boxShadow: '0 8px 40px rgba(0,0,0,0.6)', cursor: 'default' }}
          />
          <div style={{ marginTop: 14, textAlign: 'center', color: '#e2e8f0' }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{preview.name}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{formatTime(preview.capturedAt)}</div>
            <button className="btn" style={{ marginTop: 12, fontSize: 12 }} onClick={() => setPreview(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
