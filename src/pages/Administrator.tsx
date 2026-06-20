import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { Modal } from '../components/Modal';
import { nextId } from '../utils/codes';
import { adminUsers, supabaseConfigured } from '../utils/supabase';
import { appendAudit } from '../utils/audit';
import type { UserSetting } from '../types';

const SYNTHETIC_DOMAIN = '@millparts.local';

/** Resolve the login email for a user: their entered email, or a synthetic fallback. */
function resolveEmail(email: string, username: string): string {
  const trimmed = email.trim();
  return trimmed || `${username.trim().toLowerCase()}${SYNTHETIC_DOMAIN}`;
}

export default function Administrator() {
  const { state, setState } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserSetting | null>(null);
  const [form, setForm] = useState({
    username: '', email: '', password: '', isAdmin: false,
    canAccessProcurement: true, canAccessInventory: true, canAccessMaintenance: true, canAccessProcess: true, canAccessHumanResources: true,
  });
  const [saving, setSaving] = useState(false);

  if (!currentUser?.isAdmin) {
    return (
      <div className="topbar">
        <div>
          <h2>Administrator</h2>
          <p>This page is restricted to administrators.</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => navigate('/')}>Back</button>
        </div>
      </div>
    );
  }

  function openAdd() {
    setEditing(null);
    setForm({ username: '', email: '', password: '', isAdmin: false, canAccessProcurement: true, canAccessInventory: true, canAccessMaintenance: true, canAccessProcess: true, canAccessHumanResources: true });
    setOpen(true);
  }

  function openEdit(u: UserSetting) {
    setEditing(u);
    setForm({
      username: u.username,
      // Show a real email but hide the synthetic placeholder so admins can add one.
      email: (u.email ?? '').toLowerCase().endsWith(SYNTHETIC_DOMAIN) ? '' : (u.email ?? ''),
      password: '', // blank = keep current password
      isAdmin: u.isAdmin,
      canAccessProcurement: u.canAccessProcurement ?? false,
      canAccessInventory: u.canAccessInventory ?? false,
      canAccessMaintenance: u.canAccessMaintenance ?? false,
      canAccessProcess: u.canAccessProcess ?? false,
      canAccessHumanResources: u.canAccessHumanResources ?? false,
    });
    setOpen(true);
  }

  function buildEditDetails(prior: UserSetting, email: string): string {
    const changes: string[] = [];
    if (form.username.trim() !== prior.username) changes.push(`username: "${prior.username}" → "${form.username.trim()}"`);
    if (email.toLowerCase() !== (prior.email ?? '').toLowerCase()) changes.push('email changed');
    if (form.password.trim()) changes.push('password reset');
    const modules: [string, keyof typeof form, keyof UserSetting][] = [
      ['Procurement', 'canAccessProcurement', 'canAccessProcurement'],
      ['Inventory', 'canAccessInventory', 'canAccessInventory'],
      ['Maintenance', 'canAccessMaintenance', 'canAccessMaintenance'],
      ['Process', 'canAccessProcess', 'canAccessProcess'],
      ['HR', 'canAccessHumanResources', 'canAccessHumanResources'],
    ];
    for (const [label, fk, uk] of modules) {
      if (!!form[fk] !== !!(prior[uk] ?? false)) changes.push(`${label}: ${form[fk] ? 'granted' : 'revoked'}`);
    }
    if (form.isAdmin !== prior.isAdmin) changes.push(`admin: ${form.isAdmin ? 'granted' : 'revoked'}`);
    return changes.length ? changes.join('; ') : 'no changes';
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!form.username.trim()) { alert('Username is required.'); return; }

    const email = resolveEmail(form.email, form.username);
    const isSynthetic = email.toLowerCase().endsWith(SYNTHETIC_DOMAIN);

    // Reject a login email already used by another user (catches duplicate usernames
    // with a blank email, which both resolve to the same username@millparts.local).
    const emailClash = state.userSettings.some(
      (u) => u.id !== editing?.id && (u.email ?? '').toLowerCase() === email.toLowerCase(),
    );
    if (emailClash) {
      alert(isSynthetic
        ? `A user with the username "${form.username.trim()}" already exists (its login email "${email}" is taken). Pick a different username, or enter a unique email.`
        : `That email (${email}) is already used by another user.`);
      return;
    }

    // ── Legacy / local mode (no Supabase): keep the old plaintext behaviour ──────
    if (!supabaseConfigured) {
      if (!editing && !form.password.trim()) { alert('Password is required.'); return; }
      setState((prev) => {
        if (editing) {
          const password = form.password.trim() ? form.password : editing.password;
          const next = {
            ...prev,
            userSettings: prev.userSettings.map((u) =>
              u.id === editing.id ? { ...editing, ...form, email, password } : u,
            ),
          };
          return appendAudit(next, currentUser, 'Administrator', 'Edit User', {
            recordType: 'User', recordRef: form.username.trim(),
            details: buildEditDetails(editing, email),
          });
        }
        const newUser: UserSetting = { id: nextId(prev.userSettings), permissions: [], ...form, email };
        const next = { ...prev, userSettings: [...prev.userSettings, newUser] };
        return appendAudit(next, currentUser, 'Administrator', 'Create User', {
          recordType: 'User', recordRef: form.username.trim(),
          details: `Created user "${form.username.trim()}"${form.isAdmin ? ' (admin)' : ''}`,
        });
      });
      setOpen(false);
      return;
    }

    // ── Supabase Auth mode: manage the auth account via the Edge Function ────────
    setSaving(true);
    try {
      if (editing) {
        let authUserId = editing.authUserId;
        // Email changed → update the auth account's email.
        if (authUserId && email.toLowerCase() !== (editing.email ?? '').toLowerCase()) {
          await adminUsers('updateEmail', { uid: authUserId, email });
        }
        // New password entered → reset it on the auth account.
        if (form.password.trim()) {
          if (!authUserId) {
            // No auth account yet (legacy row) — create one now.
            const { uid } = await adminUsers('create', { email, password: form.password });
            authUserId = uid;
          } else {
            await adminUsers('setPassword', { uid: authUserId, password: form.password });
          }
        }
        const updatedId = editing.id;
        const editDetails = buildEditDetails(editing, email);
        setState((prev) => {
          const next = {
            ...prev,
            userSettings: prev.userSettings.map((u) =>
              u.id === updatedId
                ? { ...editing, ...form, email, password: '', authUserId }
                : u,
            ),
          };
          return appendAudit(next, currentUser, 'Administrator', 'Edit User', {
            recordType: 'User', recordRef: form.username.trim(), details: editDetails,
          });
        });
      } else {
        // New user — must have a password to create the auth account.
        if (!form.password.trim()) { alert('Password is required.'); setSaving(false); return; }
        if (isSynthetic) {
          // Allowed, but warn that this user can't self-service reset.
          if (!confirm('No email entered — this user will get a placeholder login and cannot reset their own password. Continue?')) {
            setSaving(false);
            return;
          }
        }
        const { uid } = await adminUsers('create', { email, password: form.password });
        setState((prev) => {
          const newUser: UserSetting = {
            id: nextId(prev.userSettings), permissions: [], ...form, email, password: '', authUserId: uid,
          };
          const next = { ...prev, userSettings: [...prev.userSettings, newUser] };
          return appendAudit(next, currentUser, 'Administrator', 'Create User', {
            recordType: 'User', recordRef: form.username.trim(),
            details: `Created user "${form.username.trim()}"${form.isAdmin ? ' (admin)' : ''}`,
          });
        });
      }
      setOpen(false);
    } catch (err) {
      alert(`Could not save user: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this user?')) return;
    const user = state.userSettings.find((u) => u.id === id);
    if (supabaseConfigured && user?.authUserId) {
      try {
        await adminUsers('delete', { uid: user.authUserId });
      } catch (err) {
        alert(`Could not delete the login account: ${(err as Error).message}`);
        return;
      }
    }
    const deletedUsername = user?.username ?? `id:${id}`;
    setState((prev) => {
      const next = { ...prev, userSettings: prev.userSettings.filter((u) => u.id !== id) };
      return appendAudit(next, currentUser, 'Administrator', 'Delete User', {
        recordType: 'User', recordRef: deletedUsername,
        details: `Deleted user "${deletedUsername}"`,
      });
    });
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Administrator</h2>
          <p>Manage user accounts and high-level module access. Per-action permissions are set inside each module's own User Settings page.</p>
        </div>
      </div>

      <div className="panel">
        <div className="listing-actions" style={{ padding: '12px 16px 0', marginBottom: 12 }}>
          <button className="btn" onClick={() => navigate('/')}>Back</button>
          <button className="btn primary" onClick={openAdd}>+ New User</button>
        </div>
        <div className="table-wrap">
          <table className="listing-table">
            <thead>
              <tr>
                <th>Username</th>
                <th style={{ textAlign: 'center' }}>Procurement</th>
                <th style={{ textAlign: 'center' }}>Inventory</th>
                <th style={{ textAlign: 'center' }}>Maintenance</th>
                <th style={{ textAlign: 'center' }}>Process</th>
                <th style={{ textAlign: 'center' }}>Human Resources</th>
                <th style={{ textAlign: 'center' }}>Admin</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {state.userSettings.length === 0 ? (
                <tr><td colSpan={8} className="empty">No users yet. Click + Add User to begin.</td></tr>
              ) : state.userSettings.map((u) => (
                <tr key={u.id}>
                  <td>
                    <button
                      type="button"
                      onClick={() => openEdit(u)}
                      title="Click to edit this user"
                      style={{
                        background: 'none', border: 'none', padding: 0,
                        color: '#2563eb', font: 'inherit', cursor: 'pointer',
                        textDecoration: 'underline', textAlign: 'left',
                      }}
                    >
                      {u.username}
                    </button>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={!!u.canAccessProcurement || u.isAdmin}
                      disabled
                      title={u.isAdmin ? 'Admins always have access' : 'Open Edit to change procurement access'}
                      readOnly
                    />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={!!u.canAccessInventory || u.isAdmin}
                      disabled
                      title={u.isAdmin ? 'Admins always have access' : 'Open Edit to change inventory access'}
                      readOnly
                    />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={!!u.canAccessMaintenance || u.isAdmin}
                      disabled
                      title={u.isAdmin ? 'Admins always have access' : 'Open Edit to change maintenance access'}
                      readOnly
                    />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={!!u.canAccessProcess || u.isAdmin}
                      disabled
                      title={u.isAdmin ? 'Admins always have access' : 'Open Edit to change process access'}
                      readOnly
                    />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={!!u.canAccessHumanResources || u.isAdmin}
                      disabled
                      title={u.isAdmin ? 'Admins always have access' : 'Open Edit to change human resources access'}
                      readOnly
                    />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={u.isAdmin}
                      disabled
                      title="Open Edit to change administrator status"
                      readOnly
                    />
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn" style={{ fontSize: 12, padding: '4px 10px', marginRight: 4 }} onClick={() => openEdit(u)}>Edit</button>
                    <button className="btn danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete(u.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit User' : 'Add User'}>
        <form className="form-grid" onSubmit={handleSave}>
          <label>
            Username <span style={{ color: 'red' }}>*</span>
            <input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} required />
          </label>
          <label>
            Email
            <input
              type="email"
              value={form.email}
              placeholder="Used for password resets (optional)"
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </label>
          <label>
            Password {!editing && <span style={{ color: 'red' }}>*</span>}
            <input
              type="password"
              autoComplete="new-password"
              value={form.password}
              placeholder={editing ? 'Leave blank to keep current' : ''}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required={!editing}
            />
          </label>
          <label className="full" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              style={{ width: 'auto', minHeight: 'auto', margin: 0 }}
              checked={form.canAccessProcurement}
              onChange={(e) => setForm((f) => ({ ...f, canAccessProcurement: e.target.checked }))}
            />
            Can access Procurement module
          </label>
          <label className="full" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              style={{ width: 'auto', minHeight: 'auto', margin: 0 }}
              checked={form.canAccessInventory}
              onChange={(e) => setForm((f) => ({ ...f, canAccessInventory: e.target.checked }))}
            />
            Can access Inventory module
          </label>
          <label className="full" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              style={{ width: 'auto', minHeight: 'auto', margin: 0 }}
              checked={form.canAccessMaintenance}
              onChange={(e) => setForm((f) => ({ ...f, canAccessMaintenance: e.target.checked }))}
            />
            Can access Maintenance module
          </label>
          <label className="full" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              style={{ width: 'auto', minHeight: 'auto', margin: 0 }}
              checked={form.canAccessProcess}
              onChange={(e) => setForm((f) => ({ ...f, canAccessProcess: e.target.checked }))}
            />
            Can access Process module
          </label>
          <label className="full" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              style={{ width: 'auto', minHeight: 'auto', margin: 0 }}
              checked={form.canAccessHumanResources}
              onChange={(e) => setForm((f) => ({ ...f, canAccessHumanResources: e.target.checked }))}
            />
            Can access Human Resources module
          </label>
          <label className="full" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              style={{ width: 'auto', minHeight: 'auto', margin: 0 }}
              checked={form.isAdmin}
              onChange={(e) => setForm((f) => ({ ...f, isAdmin: e.target.checked }))}
            />
            Administrator (bypasses all checks)
          </label>
          <button className="btn primary full" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save User'}</button>
        </form>
      </Modal>
    </>
  );
}
