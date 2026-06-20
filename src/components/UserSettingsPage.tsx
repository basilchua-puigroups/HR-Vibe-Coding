import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { MODULES_BY_SECTION, hasPerm, type Section } from '../utils/permissions';
import { ItemDescriptionInput } from './ItemDescriptionInput';
import { Modal } from './Modal';
import type { ApprovalItemLimit } from '../types';

interface Props {
  section: Section;
}

function samePermissions(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((key) => set.has(key));
}

export default function UserSettingsPage({ section }: Props) {
  const { state, setState } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [selectedUserId, setSelectedUserId] = useState<number | ''>('');
  const [draftPermissions, setDraftPermissions] = useState<string[]>([]);
  const [draftApprovalLimit, setDraftApprovalLimit] = useState<string>('');
  const [draftApprovalItemLimits, setDraftApprovalItemLimits] = useState<ApprovalItemLimit[]>([]);
  const [confirmSaveLimits, setConfirmSaveLimits] = useState(false);
  const [draftVerifyLimit, setDraftVerifyLimit] = useState<string>('');
  const [draftVerifyItemLimits, setDraftVerifyItemLimits] = useState<ApprovalItemLimit[]>([]);
  const [confirmSaveVerifyLimits, setConfirmSaveVerifyLimits] = useState(false);

  const modules = MODULES_BY_SECTION[section];
  const sectionLabel =
    section === 'procurement' ? 'Procurement' :
    section === 'inventory' ? 'Inventory' :
    section === 'maintenance' ? 'Maintenance' :
    section === 'process' ? 'Process' :
    'Human Resources';
  const backPath =
    section === 'procurement' ? '/procurement' :
    section === 'inventory' ? '/inventory' :
    section === 'maintenance' ? '/maintenance' :
    section === 'process' ? '/process' :
    '/human-resources';
  const manageKey =
    section === 'procurement' ? 'manageProcurementUsers' :
    section === 'inventory' ? 'manageInventoryUsers' :
    section === 'maintenance' ? 'manageMaintenanceUsers' :
    section === 'process' ? 'manageProcessUsers' :
    'manageHumanResourcesUsers';
  const canAccessSettings = !!currentUser?.isAdmin || hasPerm(currentUser, manageKey);
  const selectedUser = state.userSettings.find((u) => u.id === selectedUserId) ?? null;
  const sectionPermKeys = modules.flatMap((m) => m.perms.map((p) => p.key));
  const permissionsChanged = selectedUser
    ? !samePermissions(draftPermissions, selectedUser.permissions ?? [])
    : false;

  const canManageLimits = !!(
    currentUser?.isAdmin ||
    hasPerm(currentUser, 'manageProcurementUsers') ||
    hasPerm(currentUser, 'managePoApprovalLimits')
  );

  const canManageVerifyLimits = !!(
    currentUser?.isAdmin ||
    hasPerm(currentUser, 'manageProcurementUsers') ||
    hasPerm(currentUser, 'managePoVerifyLimits')
  );

  const savedApprovalLimit = selectedUser?.approvalLimit ?? null;
  const currentLimitValue = draftApprovalLimit.trim() === '' ? null : Number(draftApprovalLimit);
  const approvalLimitsChanged = selectedUser != null && (
    currentLimitValue !== savedApprovalLimit ||
    JSON.stringify(draftApprovalItemLimits) !== JSON.stringify(selectedUser.approvalItemLimits ?? [])
  );

  const savedVerifyLimit = selectedUser?.verifyLimit ?? null;
  const currentVerifyLimitValue = draftVerifyLimit.trim() === '' ? null : Number(draftVerifyLimit);
  const verifyLimitsChanged = selectedUser != null && (
    currentVerifyLimitValue !== savedVerifyLimit ||
    JSON.stringify(draftVerifyItemLimits) !== JSON.stringify(selectedUser.verifyItemLimits ?? [])
  );

  useEffect(() => {
    setDraftPermissions(selectedUser?.permissions ?? []);
    const lim = selectedUser?.approvalLimit;
    setDraftApprovalLimit(lim != null ? String(lim) : '');
    setDraftApprovalItemLimits(selectedUser?.approvalItemLimits ?? []);
    const vlim = selectedUser?.verifyLimit;
    setDraftVerifyLimit(vlim != null ? String(vlim) : '');
    setDraftVerifyItemLimits(selectedUser?.verifyItemLimits ?? []);
  }, [selectedUser?.id]);

  if (!canAccessSettings) {
    return (
      <div className="topbar">
        <div>
          <h2>{sectionLabel} — User Settings</h2>
          <p>This page is restricted. You need the "User Settings" permission for the {sectionLabel.toLowerCase()} module.</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => navigate(backPath)}>Back</button>
        </div>
      </div>
    );
  }

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
      userSettings: prev.userSettings.map((u) => {
        if (u.id !== selectedUser.id) return u;
        const updated = { ...u, permissions: draftPermissions };
        if (!draftPermissions.includes('approvePo')) {
          updated.approvalLimit = null;
          updated.approvalItemLimits = [];
        }
        if (!draftPermissions.includes('verifyPo')) {
          updated.verifyLimit = null;
          updated.verifyItemLimits = [];
        }
        return updated;
      }),
    }));
  }

  function saveApprovalLimits() {
    if (!selectedUser) return;
    const limitValue = draftApprovalLimit.trim() === '' ? null : Number(draftApprovalLimit);
    setState((prev) => ({
      ...prev,
      userSettings: prev.userSettings.map((u) => {
        if (u.id !== selectedUser.id) return u;
        return {
          ...u,
          approvalLimit: limitValue,
          approvalItemLimits: draftApprovalItemLimits.filter((il) => il.itemName && il.limit > 0),
        };
      }),
    }));
  }

  function updateItemLimit(idx: number, patch: Partial<ApprovalItemLimit>) {
    setDraftApprovalItemLimits((prev) => prev.map((il, i) => i === idx ? { ...il, ...patch } : il));
  }

  function saveVerifyLimits() {
    if (!selectedUser) return;
    const limitValue = draftVerifyLimit.trim() === '' ? null : Number(draftVerifyLimit);
    setState((prev) => ({
      ...prev,
      userSettings: prev.userSettings.map((u) => {
        if (u.id !== selectedUser.id) return u;
        return {
          ...u,
          verifyLimit: limitValue,
          verifyItemLimits: draftVerifyItemLimits.filter((il) => il.itemName && il.limit > 0),
        };
      }),
    }));
  }

  function updateVerifyItemLimit(idx: number, patch: Partial<ApprovalItemLimit>) {
    setDraftVerifyItemLimits((prev) => prev.map((il, i) => i === idx ? { ...il, ...patch } : il));
  }

  return (
    <>
      <Modal open={confirmSaveVerifyLimits} onClose={() => setConfirmSaveVerifyLimits(false)} title="Confirm" hideClose>
        <p style={{ margin: '0 0 20px', fontSize: 14 }}>Save verify limits for <strong>{selectedUser?.username}</strong>?</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn" type="button" onClick={() => setConfirmSaveVerifyLimits(false)}>Cancel</button>
          <button className="btn primary" type="button" onClick={() => { saveVerifyLimits(); setConfirmSaveVerifyLimits(false); }}>Save</button>
        </div>
      </Modal>
      <Modal open={confirmSaveLimits} onClose={() => setConfirmSaveLimits(false)} title="Confirm" hideClose>
        <p style={{ margin: '0 0 20px', fontSize: 14 }}>Save approval limits for <strong>{selectedUser?.username}</strong>?</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn" type="button" onClick={() => setConfirmSaveLimits(false)}>Cancel</button>
          <button className="btn primary" type="button" onClick={() => { saveApprovalLimits(); setConfirmSaveLimits(false); }}>Save</button>
        </div>
      </Modal>
      <div className="topbar">
        <div>
          <h2>{sectionLabel} — User Settings</h2>
          <p>Per-action permissions for the {sectionLabel.toLowerCase()} module. Accounts and module-level access are managed in <strong>Administrator</strong>.</p>
        </div>
      </div>

      <div className="panel" style={{ padding: 20 }}>
        <div className="listing-actions" style={{ marginBottom: 16 }}>
          <button className="btn" onClick={() => navigate(backPath)}>Back</button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>
            Select user
          </label>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value ? Number(e.target.value) : '')}
            style={{ maxWidth: 320 }}
          >
            <option value="">-- Select a user --</option>
            {state.userSettings.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username}{u.isAdmin ? ' (admin)' : ''}
              </option>
            ))}
          </select>
          {state.userSettings.length === 0 && (
            <p className="empty" style={{ padding: 12, marginTop: 12 }}>
              No users configured. Open <strong>Administrator</strong> to add users first.
            </p>
          )}
        </div>

        {selectedUser && (() => {
          const lockAll = selectedUser.isAdmin;
          return (
          <>
            {selectedUser.isAdmin && (
              <div style={{
                background: '#e7f6ed', color: '#155724', border: '1px solid #c3e6cb',
                padding: 10, borderRadius: 6, marginBottom: 16, fontSize: 13,
              }}>
                <strong>{selectedUser.username}</strong> is an administrator — all action permissions are granted automatically and the checkboxes below are informational.
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <button
                className="btn"
                type="button"
                disabled={lockAll}
                onClick={() => setDraftPermsBulk(sectionPermKeys, true)}
              >
                Select all
              </button>
              <button
                className="btn"
                type="button"
                disabled={lockAll}
                onClick={() => setDraftPermsBulk(sectionPermKeys, false)}
              >
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {modules.map((mod) => {
                const modKeys = mod.perms.map((p) => p.key);
                const allChecked = modKeys.every((k) => draftPermissions.includes(k));
                const canUseModuleBulk = !selectedUser.isAdmin;
                return (
                  <div key={mod.key} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 14, background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <strong style={{ fontSize: 14 }}>{mod.label}</strong>
                      <button
                        type="button"
                        className="btn"
                        style={{ fontSize: 11, padding: '2px 8px' }}
                        disabled={!canUseModuleBulk}
                        onClick={() => setDraftPermsBulk(modKeys, !allChecked)}
                      >
                        {allChecked ? 'Clear' : 'All'}
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {mod.perms.map((p, pIdx) => {
                        const isManageKey = p.key === manageKey;
                        const isViewPerm = pIdx === 0 && mod.perms.length > 1;
                        const viewKey = mod.perms[0].key;
                        const viewChecked = selectedUser.isAdmin || draftPermissions.includes(viewKey);
                        const checked = selectedUser.isAdmin ? true : draftPermissions.includes(p.key);
                        const disabledByNoView = !isViewPerm && !isManageKey && !viewChecked && mod.perms.length > 1;
                        const disabled = selectedUser.isAdmin || disabledByNoView;
                        return (
                          <label
                            key={p.key}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              fontSize: 13, color: disabled ? '#bbb' : 'var(--ink)', cursor: disabled ? 'not-allowed' : 'pointer',
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

            {section === 'procurement' && canManageVerifyLimits && (draftPermissions.includes('verifyPo') || selectedUser.isAdmin) && (
              <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 16, background: '#fff', marginTop: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>PO Verify Limits — {selectedUser.username}</div>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>
                  Controls how much this user can verify. Admins and Procurement admins bypass all limits.
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Default Verify Limit (RM)</label>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Leave blank = cannot verify any PO regardless of value.</div>
                  <input
                    type="number" min="0" step="0.01" placeholder="e.g. 5000.00"
                    value={draftVerifyLimit}
                    onChange={(e) => setDraftVerifyLimit(e.target.value)}
                    style={{ maxWidth: 200 }}
                  />
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Item-Specific Limits</div>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
                    For special items (e.g. Diesel), set a higher limit that overrides the default when the PO contains that item.
                  </div>
                  {draftVerifyItemLimits.map((il, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                      <div style={{ width: 220 }}>
                        <ItemDescriptionInput
                          value={il.itemName}
                          inventory={state.inventory}
                          onChange={(name, sel) => updateVerifyItemLimit(idx, { itemId: sel?.id ?? il.itemId, itemName: sel?.item ?? name })}
                        />
                      </div>
                      <input
                        type="number" min="0" step="0.01" placeholder="Limit (RM)"
                        value={il.limit || ''}
                        onChange={(e) => updateVerifyItemLimit(idx, { limit: Number(e.target.value) })}
                        style={{ width: 140 }}
                      />
                      <button className="btn danger" type="button" style={{ fontSize: 12, padding: '3px 8px' }}
                        onClick={() => setDraftVerifyItemLimits((prev) => prev.filter((_, i) => i !== idx))}>×</button>
                    </div>
                  ))}
                  <button className="btn" type="button" style={{ fontSize: 12, marginTop: 2 }}
                    onClick={() => setDraftVerifyItemLimits((prev) => [...prev, { itemId: 0, itemName: '', limit: 0 }])}>
                    + Add Item Limit
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button className="btn primary" type="button" disabled={!verifyLimitsChanged} onClick={() => setConfirmSaveVerifyLimits(true)}>
                    Save Limits
                  </button>
                  {verifyLimitsChanged && (
                    <span style={{ fontSize: 13, color: 'var(--gold)', fontWeight: 700 }}>Unsaved changes</span>
                  )}
                </div>
              </div>
            )}

            {section === 'procurement' && canManageLimits && (draftPermissions.includes('approvePo') || selectedUser.isAdmin) && (
              <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 16, background: '#fff', marginTop: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>PO Approval Limits — {selectedUser.username}</div>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>
                  Controls how much this user can approve. Admins and Procurement admins bypass all limits.
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Default Approval Limit (RM)</label>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Leave blank = cannot approve any PO regardless of value.</div>
                  <input
                    type="number" min="0" step="0.01" placeholder="e.g. 5000.00"
                    value={draftApprovalLimit}
                    onChange={(e) => setDraftApprovalLimit(e.target.value)}
                    style={{ maxWidth: 200 }}
                  />
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Item-Specific Limits</div>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
                    For special items (e.g. Diesel), set a higher limit that overrides the default when the PO contains that item.
                  </div>
                  {draftApprovalItemLimits.map((il, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                      <div style={{ width: 220 }}>
                        <ItemDescriptionInput
                          value={il.itemName}
                          inventory={state.inventory}
                          onChange={(name, sel) => updateItemLimit(idx, { itemId: sel?.id ?? il.itemId, itemName: sel?.item ?? name })}
                        />
                      </div>
                      <input
                        type="number" min="0" step="0.01" placeholder="Limit (RM)"
                        value={il.limit || ''}
                        onChange={(e) => updateItemLimit(idx, { limit: Number(e.target.value) })}
                        style={{ width: 140 }}
                      />
                      <button className="btn danger" type="button" style={{ fontSize: 12, padding: '3px 8px' }}
                        onClick={() => setDraftApprovalItemLimits((prev) => prev.filter((_, i) => i !== idx))}>×</button>
                    </div>
                  ))}
                  <button className="btn" type="button" style={{ fontSize: 12, marginTop: 2 }}
                    onClick={() => setDraftApprovalItemLimits((prev) => [...prev, { itemId: 0, itemName: '', limit: 0 }])}>
                    + Add Item Limit
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button className="btn primary" type="button" disabled={!approvalLimitsChanged} onClick={() => setConfirmSaveLimits(true)}>
                    Save Limits
                  </button>
                  {approvalLimitsChanged && (
                    <span style={{ fontSize: 13, color: 'var(--gold)', fontWeight: 700 }}>Unsaved changes</span>
                  )}
                </div>
              </div>
            )}
          </>
          );
        })()}
      </div>
    </>
  );
}
