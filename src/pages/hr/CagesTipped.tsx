import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { NoPermission } from '../../components/NoPermission';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { hasPerm } from '../../utils/permissions';

// Shift starts at 07:00. Slots run 0700→…→2300→0000→…→0600→0700 (24 rows).
const SLOT_HOURS = [7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,0,1,2,3,4,5,6];

const MAX_FILE_MB = 10;
const MAX_DIM = 1280;   // longest side in pixels after resize
const JPEG_QUALITY = 0.82;

function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width >= height) { height = Math.round((height / width) * MAX_DIM); width = MAX_DIM; }
        else                 { width  = Math.round((width / height) * MAX_DIM); height = MAX_DIM; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load failed')); };
    img.src = url;
  });
}

function slotLabel(h: number): string {
  const s = String(h).padStart(2, '0') + '00';
  const e = String((h + 1) % 24).padStart(2, '0') + '00';
  return `${s} - ${e}`;
}

// Hours 0000–0659 belong to the previous calendar day's shift.
function shiftDateOf(date: Date): string {
  const d = new Date(date);
  if (d.getHours() < 7) d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function formatTime(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return ''; }
}

export default function CagesTipped() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { currentUser } = useAuth();
  const { state, setState } = useApp();

  const shift = pathname.includes('shift-b') ? 'B' : 'A';
  const backPath = shift === 'B'
    ? '/human-resources/payroll/shift-b'
    : '/human-resources/payroll/shift-a';

  const [date, setDate] = useState(() => shiftDateOf(new Date()));
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ src: string; name: string; capturedAt: string } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreview(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // Row-level warning messages: slotHour → message string
  const [rowWarnings, setRowWarnings] = useState<Record<number, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const warningTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  if (!hasPerm(currentUser, 'viewCagesTipped')) return <NoPermission backPath={backPath} />;

  const canUpload = hasPerm(currentUser, 'createCagesTipped');
  const canDelete = hasPerm(currentUser, 'deleteCagesTipped');

  const allPhotos = state.cagesTippedPhotos ?? [];

  const photosForSlot = (slotHour: number) =>
    allPhotos
      .filter((p) => p.shift === shift && p.date === date && p.slotHour === slotHour)
      .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

  const showWarning = useCallback((slotHour: number, msg: string) => {
    setRowWarnings((prev) => ({ ...prev, [slotHour]: msg }));
    if (warningTimers.current[slotHour]) clearTimeout(warningTimers.current[slotHour]);
    warningTimers.current[slotHour] = setTimeout(() => {
      setRowWarnings((prev) => {
        const next = { ...prev };
        delete next[slotHour];
        return next;
      });
    }, 6000);
  }, []);

  const handleRowUpload = (slotHour: number) => {
    setUploadingSlot(slotHour);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const slot = uploadingSlot;
    if (slot === null) return;

    const files = Array.from(e.target.files ?? []);
    const rejected: string[] = [];

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        rejected.push(`"${file.name}" is not an image file`);
        continue;
      }
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        rejected.push(`"${file.name}" exceeds ${MAX_FILE_MB} MB`);
        continue;
      }

      const taken = new Date(file.lastModified);
      const fileHour = taken.getHours();
      const fileDate = shiftDateOf(taken);

      if (fileDate !== date || fileHour !== slot) {
        const takenTime = taken.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        rejected.push(`"${file.name}" taken at ${fileDate} ${takenTime} (expected ${date} ${slotLabel(slot)})`);
        continue;
      }

      const capturedAt = taken.toISOString();
      try {
        const photoData = await resizeImage(file);
        setState((prev) => {
          const maxId = (prev.cagesTippedPhotos ?? []).reduce((m, p) => Math.max(m, p.id), 0);
          return {
            ...prev,
            cagesTippedPhotos: [
              ...(prev.cagesTippedPhotos ?? []),
              { id: maxId + 1, shift, date, slotHour: slot, photoName: file.name, photoData, capturedAt },
            ],
          };
        });
      } catch {
        rejected.push(`"${file.name}" could not be processed`);
      }
    }

    if (rejected.length > 0) {
      showWarning(slot, rejected.length === 1
        ? rejected[0]
        : `${rejected.length} photos rejected`
      );
    }

    e.target.value = '';
    setUploadingSlot(null);
  };

  const handleDelete = (id: number) => {
    if (!confirm('Delete this photo?')) return;
    setState((prev) => ({
      ...prev,
      cagesTippedPhotos: (prev.cagesTippedPhotos ?? []).filter((p) => p.id !== id),
    }));
  };

  const totalPhotos = allPhotos.filter((p) => p.shift === shift && p.date === date).length;

  return (
    <article className="panel">
      <div className="panel-header">
        <h3>Cages Tipped – Shift {shift}</h3>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px 0', flexWrap: 'wrap' }}>
        <button className="btn" onClick={() => navigate(backPath)}>Back</button>
        <input
          type="date"
          className="form-control"
          style={{ width: 160 }}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <div className="panel-body" style={{ padding: '12px 0 0' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ width: 130, whiteSpace: 'nowrap', position: 'sticky', left: 0, zIndex: 2, background: '#f8fafc' }}>Time</th>
                {canUpload && <th style={{ width: 90 }}>Upload</th>}
                <th>Photos</th>
                <th style={{ width: 160, textAlign: 'center', whiteSpace: 'nowrap' }}>No. of Cages Tipped<br />(≤ 4 cages)</th>
                <th style={{ width: 160, textAlign: 'center', whiteSpace: 'nowrap' }}>No. of Cages Tipped<br />(≥ 5 cages)</th>
                <th style={{ width: 80, textAlign: 'center' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {SLOT_HOURS.map((h) => {
                const photos = photosForSlot(h);
                const warning = rowWarnings[h];
                const count = photos.length;
                const lte4 = Math.min(count, 4);
                const gte5 = Math.max(0, count - 4);
                return (
                  <tr key={h}>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap', fontSize: 13, position: 'sticky', left: 0, background: '#fff', zIndex: 1, boxShadow: '2px 0 4px rgba(0,0,0,0.06)' }}>
                      {slotLabel(h)}
                    </td>
                    {canUpload && (
                      <td>
                        <button
                          className="btn"
                          style={{ fontSize: 12, padding: '3px 10px' }}
                          onClick={() => handleRowUpload(h)}
                        >
                          + Photo
                        </button>
                      </td>
                    )}
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 10 }}>
                        {/* Inline warning when uploaded photo timestamp doesn't match this slot */}
                        {warning && (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            background: 'rgba(234,179,8,0.12)',
                            border: '1px solid rgba(234,179,8,0.4)',
                            borderRadius: 6, padding: '4px 10px',
                            fontSize: 12, color: '#ca8a04',
                            alignSelf: 'center',
                          }}>
                            ⚠ {warning}
                          </div>
                        )}
                        {photos.length === 0 && !warning && (
                          <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
                        )}
                        {photos.map((photo, idx) => (
                          <div key={photo.id} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            gap: 4, padding: 6,
                            background: 'var(--surface-2)',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                          }}>
                            {photo.photoData ? (
                              <img
                                src={photo.photoData}
                                alt={photo.photoName}
                                title="Click to preview"
                                style={{ width: 90, height: 68, objectFit: 'cover', borderRadius: 4, display: 'block', cursor: 'pointer' }}
                                onClick={() => setPreview({ src: photo.photoData, name: photo.photoName, capturedAt: photo.capturedAt })}
                              />
                            ) : (
                              <div style={{
                                width: 90, height: 68, borderRadius: 4,
                                background: 'var(--surface)', display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                                fontSize: 10, color: 'var(--muted)',
                              }}>No image</div>
                            )}
                            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>
                              #{idx + 1} · {formatTime(photo.capturedAt)}
                            </span>
                            {canDelete && (
                              <button
                                className="btn btn-danger"
                                style={{ fontSize: 10, padding: '2px 8px' }}
                                onClick={() => handleDelete(photo.id)}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', fontSize: 14, fontWeight: lte4 > 0 ? 600 : 400, color: lte4 > 0 ? 'var(--text)' : 'var(--muted)' }}>
                      {lte4}
                    </td>
                    <td style={{ textAlign: 'center', fontSize: 14, fontWeight: gte5 > 0 ? 600 : 400, color: gte5 > 0 ? '#22c55e' : 'var(--muted)' }}>
                      {gte5}
                    </td>
                    <td style={{ textAlign: 'center', fontSize: 14, fontWeight: count > 0 ? 600 : 400, color: count > 0 ? 'var(--text)' : 'var(--muted)' }}>
                      {count}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {(() => {
                const dayPhotos = allPhotos.filter((p) => p.shift === shift && p.date === date);
                const grandTotal = dayPhotos.length;
                const grandLte4  = SLOT_HOURS.reduce((sum, h) => {
                  const c = dayPhotos.filter((p) => p.slotHour === h).length;
                  return sum + Math.min(c, 4);
                }, 0);
                const grandGte5  = SLOT_HOURS.reduce((sum, h) => {
                  const c = dayPhotos.filter((p) => p.slotHour === h).length;
                  return sum + Math.max(0, c - 4);
                }, 0);
                return (
                  <tr style={{ borderTop: '2px solid var(--line)', background: '#f8fafc' }}>
                    <td style={{ fontWeight: 700, fontSize: 13, position: 'sticky', left: 0, background: '#f8fafc', zIndex: 1 }}>
                      Grand Total
                    </td>
                    {canUpload && <td />}
                    <td />
                    <td style={{ textAlign: 'center', fontWeight: 700, fontSize: 15 }}>{grandLte4}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700, fontSize: 15, color: grandGte5 > 0 ? '#22c55e' : undefined }}>{grandGte5}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700, fontSize: 15 }}>{grandTotal}</td>
                  </tr>
                );
              })()}
            </tfoot>
          </table>
        </div>
      </div>
      {/* Lightbox preview */}
      {preview && (
        <div
          onClick={() => setPreview(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          <img
            src={preview.src}
            alt={preview.name}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '90vw', maxHeight: '80vh',
              borderRadius: 8, boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
              cursor: 'default',
            }}
          />
          <div style={{ marginTop: 14, textAlign: 'center', color: '#e2e8f0' }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{preview.name}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{formatTime(preview.capturedAt)}</div>
            <button
              className="btn"
              style={{ marginTop: 12, fontSize: 12 }}
              onClick={() => setPreview(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
