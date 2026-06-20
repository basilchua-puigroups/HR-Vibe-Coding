import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NoPermission } from '../../components/NoPermission';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { hasPerm } from '../../utils/permissions';
import { adminUsers, supabase, supabaseConfigured } from '../../utils/supabase';
import type { Worker } from '../../types';

const ROLES = ['Station Head', 'Assistant Station Head', 'Operator'] as const;

const EMPTY_WORKER: Omit<Worker, 'id'> = {
  workerId: '', staffId: '', name: '', shift: 'A', role: 'Operator', department: '', email: '', status: 'Active',
};

export default function WorkerList() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { state, setState } = useApp();

  const [modal, setModal]   = useState<{ mode: 'add' | 'edit'; data: Omit<Worker, 'id'> & { id?: number }; err: string | null } | null>(null);
  const [loginModal, setLoginModal] = useState<{ worker: Worker; mode: 'create' | 'reset'; pw: string; busy: boolean; err: string } | null>(null);
  const [resignConfirm, setResignConfirm] = useState<Worker | null>(null);
  const [search, setSearch] = useState('');

  if (!hasPerm(currentUser, 'viewWorkerList')) return <NoPermission backPath="/human-resources" />;

  const canCreate = hasPerm(currentUser, 'createWorker');
  const canEdit   = hasPerm(currentUser, 'editWorker');
  const canDelete = hasPerm(currentUser, 'deleteWorker');
  const canResign = hasPerm(currentUser, 'resignWorker');
  const canLogin  = hasPerm(currentUser, 'manageWorkerLogins');

  const workers = (state.workers ?? [])
    .filter((w) => {
      const q = search.toLowerCase();
      return !q || w.name.toLowerCase().includes(q) || w.workerId.toLowerCase().includes(q) || w.department.toLowerCase().includes(q);
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  function openAdd() {
    setModal({ mode: 'add', data: { ...EMPTY_WORKER }, err: null });
  }

  function openEdit(w: Worker) {
    setModal({ mode: 'edit', data: { ...w }, err: null });
  }

  function saveWorker() {
    if (!modal) return;
    const data = modal.data;
    const missing: string[] = [];
    if (!data.workerId.trim()) missing.push('Username');
    if (!data.name.trim()) missing.push('Name');
    if (missing.length > 0) {
      setModal((m) => m ? { ...m, err: `Please fill in the required fields: ${missing.join(', ')}.` } : m);
      return;
    }
    // Auto-generate email if blank
    const email = data.email.trim() || `${data.workerId.toLowerCase().replace(/\s+/g, '')}@millparts.worker`;

    setState((prev) => {
      const workers = prev.workers ?? [];
      if (modal.mode === 'add') {
        const maxId = workers.reduce((m, w) => Math.max(m, w.id), 0);
        return { ...prev, workers: [...workers, { ...data, id: maxId + 1, email }] };
      } else {
        return { ...prev, workers: workers.map((w) => w.id === data.id ? { ...data, email } as Worker : w) };
      }
    });
    setModal(null);
  }

  function deleteWorker(id: number) {
    if (!confirm('Delete this worker? This cannot be undone.')) return;
    setState((prev) => ({ ...prev, workers: (prev.workers ?? []).filter((w) => w.id !== id) }));
  }

  async function confirmResign(worker: Worker) {
    setState((prev) => ({
      ...prev,
      workers: (prev.workers ?? []).map((w) => w.id === worker.id ? { ...w, status: 'Resigned' } : w),
    }));
    setResignConfirm(null);
    if (supabaseConfigured && supabase) {
      try {
        await supabase.from('workers').update({ status: 'Resigned' }).eq('id', worker.id);
      } catch { /* local state already updated; full push will retry */ }
    }
  }

  async function reinstateWorker(worker: Worker) {
    if (!confirm(`Reinstate ${worker.name} (${worker.workerId}) as Active?`)) return;
    setState((prev) => ({
      ...prev,
      workers: (prev.workers ?? []).map((w) => w.id === worker.id ? { ...w, status: 'Active' } : w),
    }));
    if (supabaseConfigured && supabase) {
      try {
        await supabase.from('workers').update({ status: 'Active' }).eq('id', worker.id);
      } catch { /* local state already updated; full push will retry */ }
    }
  }

  async function handleLoginAction() {
    if (!loginModal) return;
    const { worker, mode, pw } = loginModal;
    if (!pw.trim() || pw.length < 6) {
      setLoginModal((m) => m ? { ...m, err: 'Password must be at least 6 characters.' } : m);
      return;
    }
    setLoginModal((m) => m ? { ...m, busy: true, err: '' } : m);
    try {
      if (mode === 'create') {
        const { uid } = await adminUsers('create', { email: worker.email, password: pw });
        setState((prev) => ({
          ...prev,
          workers: (prev.workers ?? []).map((w) => w.id === worker.id ? { ...w, authUserId: uid } : w),
        }));
      } else {
        await adminUsers('setPassword', { uid: worker.authUserId, password: pw });
      }
      setLoginModal(null);
    } catch (e) {
      setLoginModal((m) => m ? { ...m, busy: false, err: (e as Error).message } : m);
    }
  }

  return (
    <article className="panel">
      <div className="panel-header">
        <h3>Worker List</h3>
        {canCreate && <button className="btn primary" onClick={openAdd}>+ Add Worker</button>}
      </div>

      <div style={{ display: 'flex', gap: 10, padding: '12px 16px 0', flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn" onClick={() => navigate('/human-resources')}>Back</button>
        <input
          className="form-control"
          style={{ width: 220 }}
          placeholder="Search name / ID / department…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{workers.length} worker{workers.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="panel-body" style={{ padding: '12px 0 0' }}>
        {workers.length === 0 ? (
          <p className="empty">No workers found.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table listing-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Staff ID</th>
                  <th>Name</th>
                  <th>Shift</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((w) => (
                  <tr key={w.id}>
                    <td style={{ fontWeight: 600 }}>{w.workerId}</td>
                    <td style={{ color: w.staffId ? undefined : 'var(--muted)' }}>{w.staffId || '—'}</td>
                    <td>{w.name}</td>
                    <td>{w.shift}</td>
                    <td>{w.role ?? '—'}</td>
                    <td>{w.department}</td>
                    <td>
                      <span className={`badge ${w.status === 'Active' ? 'ok' : w.status === 'Resigned' ? 'bad' : 'neutral'}`}>{w.status}</span>
                    </td>
                    <td>
                      {w.status === 'Resigned'
                        ? <span className="badge neutral">Inactive</span>
                        : w.authUserId
                          ? <span className="badge ok">Active</span>
                          : <span className="badge neutral">No login</span>
                      }
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {canEdit && (
                          <button className="btn" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => openEdit(w)}>Edit</button>
                        )}
                        {canLogin && !w.authUserId && (
                          <button className="btn primary" style={{ fontSize: 12, padding: '3px 10px' }}
                            onClick={() => setLoginModal({ worker: w, mode: 'create', pw: '', busy: false, err: '' })}>
                            Create Login
                          </button>
                        )}
                        {canLogin && w.authUserId && (
                          <button className="btn" style={{ fontSize: 12, padding: '3px 10px' }}
                            onClick={() => setLoginModal({ worker: w, mode: 'reset', pw: '', busy: false, err: '' })}>
                            Reset PW
                          </button>
                        )}
                        {canResign && w.status !== 'Resigned' && (
                          <button className="btn" style={{ fontSize: 12, padding: '3px 10px', background: '#f59e0b', color: '#fff', border: 'none' }} onClick={() => setResignConfirm(w)}>Resign</button>
                        )}
                        {canResign && w.status === 'Resigned' && (
                          <button className="btn" style={{ fontSize: 12, padding: '3px 10px', background: '#16a34a', color: '#fff', border: 'none' }} onClick={() => void reinstateWorker(w)}>Reinstate</button>
                        )}
                        {canDelete && (
                          <button className="btn danger" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => deleteWorker(w.id)}>Delete</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      {modal && (
        <div className="modal open" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ width: 'min(480px,100%)' }}>
            <div className="panel-header">
              <h3>{modal.mode === 'add' ? 'Add Worker' : 'Edit Worker'}</h3>
              <button className="btn" onClick={() => setModal(null)}>Close</button>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <label>Username *
                  <input value={modal.data.workerId} onChange={(e) => setModal((m) => m ? { ...m, data: { ...m.data, workerId: e.target.value }, err: null } : m)} placeholder="e.g. W001" />
                  <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, display: 'block' }}>Used to log in to the system</span>
                </label>
                <label>Name *
                  <input value={modal.data.name} onChange={(e) => setModal((m) => m ? { ...m, data: { ...m.data, name: e.target.value }, err: null } : m)} placeholder="Full name" />
                </label>
                <label>Worker / Staff ID
                  <input value={modal.data.staffId ?? ''} onChange={(e) => setModal((m) => m ? { ...m, data: { ...m.data, staffId: e.target.value } } : m)} placeholder="e.g. EMP-001 (optional)" />
                </label>
                <label>Shift
                  <select value={modal.data.shift} onChange={(e) => setModal((m) => m ? { ...m, data: { ...m.data, shift: e.target.value } } : m)}>
                    <option value="A">Shift A</option>
                    <option value="B">Shift B</option>
                  </select>
                </label>
                <label style={{ gridColumn: '1 / -1' }}>Role
                  <div style={{ display: 'flex', gap: 20, marginTop: 8, flexWrap: 'wrap' }}>
                    {ROLES.map((r) => (
                      <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="worker-role"
                          value={r}
                          checked={modal.data.role === r}
                          onChange={() => setModal((m) => m ? { ...m, data: { ...m.data, role: r } } : m)}
                          style={{ accentColor: 'var(--accent)', width: 16, height: 16 }}
                        />
                        {r}
                      </label>
                    ))}
                  </div>
                </label>
                <label>Department
                  <input value={modal.data.department} onChange={(e) => setModal((m) => m ? { ...m, data: { ...m.data, department: e.target.value } } : m)} placeholder="e.g. Production" />
                </label>
                <label>Login Email
                  <input value={modal.data.email} onChange={(e) => setModal((m) => m ? { ...m, data: { ...m.data, email: e.target.value } } : m)} placeholder="Auto: username@millparts.worker" />
                </label>
                <label>Status
                  <select value={modal.data.status} onChange={(e) => setModal((m) => m ? { ...m, data: { ...m.data, status: e.target.value } } : m)}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </label>
              </div>
              {modal.err && (
                <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 12, marginBottom: 0 }}>{modal.err}</p>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button className="btn" onClick={() => setModal(null)}>Cancel</button>
                <button className="btn primary" onClick={saveWorker}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Resign confirmation modal */}
      {resignConfirm && (
        <div className="modal open" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ width: 'min(400px,100%)' }}>
            <div className="panel-header">
              <h3>Mark as Resigned — {resignConfirm.name}</h3>
              <button className="btn" onClick={() => setResignConfirm(null)}>Close</button>
            </div>
            <div className="panel-body">
              <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 0 }}>
                This will set <strong>{resignConfirm.name}</strong> ({resignConfirm.workerId}) status to <strong>Resigned</strong> and block them from logging in. All their data and attendance records will be kept for audit purposes.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button className="btn" onClick={() => setResignConfirm(null)}>Cancel</button>
                <button className="btn danger" onClick={() => void confirmResign(resignConfirm)}>Confirm Resign</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create / Reset login modal */}
      {loginModal && (
        <div className="modal open" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ width: 'min(400px,100%)' }}>
            <div className="panel-header">
              <h3>{loginModal.mode === 'create' ? 'Create Login' : 'Reset Password'} — {loginModal.worker.name}</h3>
              <button className="btn" onClick={() => setLoginModal(null)}>Close</button>
            </div>
            <div className="panel-body">
              <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 0 }}>
                Login email: <strong>{loginModal.worker.email}</strong><br />
                Worker logs in using <strong>Worker ID: {loginModal.worker.workerId}</strong> as the username.
              </p>
              <label>New Password
                <input
                  type="password"
                  value={loginModal.pw}
                  onChange={(e) => setLoginModal((m) => m ? { ...m, pw: e.target.value, err: '' } : m)}
                  placeholder="Min 6 characters"
                />
              </label>
              {loginModal.err && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 8 }}>{loginModal.err}</p>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button className="btn" onClick={() => setLoginModal(null)} disabled={loginModal.busy}>Cancel</button>
                <button className="btn primary" onClick={handleLoginAction} disabled={loginModal.busy}>
                  {loginModal.busy ? 'Processing…' : loginModal.mode === 'create' ? 'Create Login' : 'Reset Password'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
