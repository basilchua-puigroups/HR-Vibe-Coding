import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../../components/Modal';
import { HR_MODULES, hasPerm } from '../../utils/permissions';
import { nextId } from '../../utils/codes';
import { adminUsers, supabaseConfigured } from '../../utils/supabase';
import { appendAudit } from '../../utils/audit';
import type { UserSetting } from '../../types/index';

const SYNTHETIC_DOMAIN = '@millparts.local';

function resolveEmail(email: string, username: string): string {
  const trimmed = email.trim();
  return trimmed || `${username.trim().toLowerCase()}${SYNTHETIC_DOMAIN}`;
}

function samePermissions(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((k) => set.has(k));
}

const HR_PERM_KEYS = HR_MODULES.flatMap((m) => m.perms.map((p) => p.key));

export default function HrUserSettings() {
  const { state, setState } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UserSetting | null>(null);
  const [form, setForm] = useState({ username: '', email: '', password: '', isAdmin: false });
  const [saving, setSaving] = useState(false);

  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<string[]>([]);

  const canManage = !!currentUser?.isAdmin || hasPerm(currentUser, 'manageHumanResourcesUsers');
  const selectedUser = state.userSettings.find((u) => u.id === selectedUserId) ?? null;
  const permissionsChanged = selectedUser
    ? !samePermissions(draftPermissions, selectedUser.permissions ?? [])
    : false;

  useEffect(() => {
    setDraftPermissions(selectedUser?.permissions ?? []);
  }, [selectedUser?.id]);

  if (!canManage) {
    return (
      <div className="topbar">
        <div>
          <h2>HR User Settings</h2>
          <p>This page is restricted to administrators and users with the "User Settings" permission.</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => navigate('/human-resources')}>Back</button>
        </div>
      </div>
    );
  }

  // ── User CRUD ─────────────────────────────────────────────────────────────

  function openAdd() {
    setEditing(null);
    setForm({ username: '', email: '', password: '', isAdmin: false });
    setModalOpen(true);
  }

  function openEdit(u: UserSetting) {
    setEditing(u);
    setForm({
      username: u.username,
      email: (u.email ?? '').toLowerCase().endsWith(SYNTHETIC_DOMAIN) ? '' : (u.email ?? ''),
      password: '',
      isAdmin: u.isAdmin,
    });
    setModalOpen(true);
  }

  function buildEditDetails(prior: UserSetting, email: string): string {
    const changes: string[] = [];
    if (form.username.trim() !== prior.username) changes.push(`username: "${prior.username}" → "${form.username.trim()}"`);
    if (email.toLowerCase() !== (prior.email ?? '').toLowerCase()) changes.push('email changed');
    if (form.password.trim()) changes.push('password reset');
    if (form.isAdmin !== prior.isAdmin) changes.push(`admin: ${form.isAdmin ? 'granted' : 'revoked'}`);
    return changes.length ? changes.join('; ') : 'no changes';
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!form.username.trim()) { alert('Username is required.'); return; }

    const email = resolveEmail(form.email, form.username);
    const isSynthetic = email.toLowerCase().endsWith(SYNTHETIC_DOMAIN);

    const emailClash = state.userSettings.some(
      (u) => u.id !== editing?.id && (u.email ?? '').toLowerCase() === email.toLowerCase(),
    );
    if (emailClash) {
      alert(isSynthetic
        ? `A user named "${form.username.trim()}" already exists. Pick a different username or enter a unique email.`
        : `That email (${email}) is already used by another user.`);
      return;
    }

    if (!supabaseConfigured) {
      if (!editing && !form.password.trim()) { alert('Password is required.'); return; }
      setState((prev) => {
        if (editing) {
          const password = form.password.trim() ? form.password : editing.password;
          const next = {
            ...prev,
            userSettings: prev.userSettings.map((u) =>
              u.id === editing.id
                ? { ...editing, ...form, email, password, canAccessHumanResources: true }
                : u,
            ),
          };
          return appendAudit(next, currentUser, 'User Settings', 'Edit User', {
            recordType: 'User', recordRef: form.username.trim(), details: buildEditDetails(editing, email),
          });
        }
        const newUser: UserSetting = {
          id: nextId(prev.userSettings), permissions: [], ...form, email,
          canAccessHumanResources: true,
        };
        const next = { ...prev, userSettings: [...prev.userSettings, newUser] };
        return appendAudit(next, currentUser, 'User Settings', 'Create User', {
          recordType: 'User', recordRef: form.username.trim(),
          details: `Created user "${form.username.trim()}"${form.isAdmin ? ' (admin)' : ''}`,
        });
      });
      setModalOpen(false);
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        let authUserId = editing.authUserId;
        if (authUserId && email.toLowerCase() !== (editing.email ?? '').toLowerCase()) {
          await adminUsers('updateEmail', { uid: authUserId, email });
        }
        if (form.password.trim()) {
          if (!authUserId) {
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
                ? { ...editing, ...form, email, password: '', authUserId, canAccessHumanResources: true }
                : u,
            ),
          };
          return appendAudit(next, currentUser, 'User Settings', 'Edit User', {
            recordType: 'User', recordRef: form.username.trim(), details: editDetails,
          });
        });
      } else {
        if (!form.password.trim()) { alert('Password is required.'); setSaving(false); return; }
        if (isSynthetic) {
          if (!confirm('No email entered — this user will get a placeholder login and cannot self-reset their password. Continue?')) {
            setSaving(false);
            return;
          }
        }
        const { uid } = await adminUsers('create', { email, password: form.password });
        setState((prev) => {
          const newUser: UserSetting = {
            id: nextId(prev.userSettings), permissions: [], ...form,
            email, password: '', authUserId: uid, canAccessHumanResources: true,
          };
          const next = { ...prev, userSettings: [...prev.userSettings, newUser] };
          return appendAudit(next, currentUser, 'User Settings', 'Create User', {
            recordType: 'User', recordRef: form.username.trim(),
            details: `Created user "${form.username.trim()}"${form.isAdmin ? ' (admin)' : ''}`,
          });
        });
      }
      setModalOpen(false);
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
    if (selectedUserId === id) setSelectedUserId(null);
    setState((prev) => {
      const next = { ...prev, userSettings: prev.userSettings.filter((u) => u.id !== id) };
      return appendAudit(next, currentUser, 'User Settings', 'Delete User', {
        recordType: 'User', recordRef: deletedUsername,
        details: `Deleted user "${deletedUsername}"`,
      });
    });
  }

  // ── Permissions ───────────────────────────────────────────────────────────

  function setDraftPerm(key: string, value: boolean) {
    setDraftPermissions((prev) => {
      const set = new Set(prev);
      if (value) set.add(key); else set.delete(key);
      return Array.from(set);
    });
  }

  function setDraftPermsBulk(keys: string[], value: boolean) {
    setDraftPermissions((prev) => {
      const set = new Set(prev);
      keys.forEach((k) => { if (value) set.add(k); else set.delete(k); });
      return Array.from(set);
    });
  }

  function savePermissions() {
    if (!selectedUser) return;
    setState((prev) => ({
      ...prev,
      userSettings: prev.userSettings.map((u) =>
        u.id !== selectedUser.id ? u : { ...u, permissions: draftPermissions },
      ),
    }));
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit User' : 'Add User'}>
        <form className="form-grid" onSubmit={handleSave}>
          <label>
            Username <span style={{ color: 'red' }}>*</span>
            <input
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              required
            />
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
              checked={form.isAdmin}
              onChange={(e) => setForm((f) => ({ ...f, isAdmin: e.target.checked }))}
            />
            Administrator (bypasses all permission checks)
          </label>
          <button className="btn primary full" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save User'}
          </button>
        </form>
      </Modal>

      <div className="topbar">
        <div>
          <h2>HR User Settings</h2>
          <p>Manage user accounts and HR module permissions.</p>
        </div>
      </div>

      <div className="panel">
        <div className="listing-actions" style={{ padding: '12px 16px 0', marginBottom: 12 }}>
          <button className="btn" onClick={() => navigate('/human-resources')}>Back</button>
          <button className="btn primary" onClick={openAdd}>+ New User</button>
        </div>

        <div className="table-wrap">
          <table className="listing-table">
            <thead>
              <tr>
                <th>Username</th>
                <th style={{ textAlign: 'center' }}>Admin</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.userSettings.length === 0 ? (
                <tr>
                  <td colSpan={3} className="empty">No users yet. Click + New User to begin.</td>
                </tr>
              ) : state.userSettings.map((u) => (
                <tr
                  key={u.id}
                  style={{ background: selectedUserId === u.id ? 'var(--highlight, #f0f7ff)' : undefined }}
                >
                  <td>
                    <button
                      type="button"
                      onClick={() => setSelectedUserId(selectedUserId === u.id ? null : u.id)}
                      title="Click to manage permissions"
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
                    <input type="checkbox" checked={u.isAdmin} disabled readOnly />
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      className="btn"
                      style={{ fontSize: 12, padding: '4px 10px', marginRight: 4 }}
                      onClick={() => openEdit(u)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn danger"
                      style={{ fontSize: 12, padding: '4px 10px', marginRight: 4 }}
                      onClick={() => handleDelete(u.id)}
                    >
                      Delete
                    </button>
                    <button
                      className={`btn${selectedUserId === u.id ? ' primary' : ''}`}
                      style={{ fontSize: 12, padding: '4px 10px' }}
                      onClick={() => setSelectedUserId(selectedUserId === u.id ? null : u.id)}
                    >
                      Permissions
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedUser && (
        <div className="panel" style={{ padding: 20, marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>
              Permissions —{' '}
              <span style={{ color: '#2563eb' }}>{selectedUser.username}</span>
            </h3>
            {selectedUser.isAdmin && (
              <span style={{
                fontSize: 12, background: '#e7f6ed', color: '#155724',
                border: '1px solid #c3e6cb', borderRadius: 4, padding: '2px 8px',
              }}>
                Admin — all permissions granted automatically
              </span>
            )}
          </div>

          {!selectedUser.isAdmin && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <button className="btn" type="button" onClick={() => setDraftPermsBulk(HR_PERM_KEYS, true)}>
                Select all
              </button>
              <button className="btn" type="button" onClick={() => setDraftPermsBulk(HR_PERM_KEYS, false)}>
                Deselect all
              </button>
              <button
                className="btn primary"
                type="button"
                disabled={!permissionsChanged}
                onClick={savePermissions}
              >
                Save
              </button>
              {permissionsChanged && (
                <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--gold)', fontWeight: 700 }}>
                  Unsaved changes
                </span>
              )}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {HR_MODULES.map((mod) => {
              const modKeys = mod.perms.map((p) => p.key);
              const allChecked = modKeys.every((k) => draftPermissions.includes(k));
              return (
                <div
                  key={mod.key}
                  style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 14, background: '#fff' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <strong style={{ fontSize: 14 }}>{mod.label}</strong>
                    {!selectedUser.isAdmin && (
                      <button
                        type="button"
                        className="btn"
                        style={{ fontSize: 11, padding: '2px 8px' }}
                        onClick={() => setDraftPermsBulk(modKeys, !allChecked)}
                      >
                        {allChecked ? 'Clear' : 'All'}
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {mod.perms.map((p, pIdx) => {
                      const isViewPerm = pIdx === 0 && mod.perms.length > 1;
                      const viewKey = mod.perms[0].key;
                      const viewChecked = selectedUser.isAdmin || draftPermissions.includes(viewKey);
                      const checked = selectedUser.isAdmin ? true : draftPermissions.includes(p.key);
                      const disabledByNoView = !isViewPerm && !viewChecked && mod.perms.length > 1;
                      const disabled = selectedUser.isAdmin || disabledByNoView;
                      return (
                        <label
                          key={p.key}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                            color: disabled ? '#bbb' : 'var(--ink)',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={(e) => {
                              setDraftPerm(p.key, e.target.checked);
                              if (isViewPerm && !e.target.checked) {
                                setDraftPermsBulk(mod.perms.slice(1).map((x) => x.key), false);
                              }
                            }}
                            style={{ width: 'auto', minHeight: 'auto', margin: 0 }}
                          />
                          {p.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
