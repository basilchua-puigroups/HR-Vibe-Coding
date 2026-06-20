import type { AppState, AuditLog, UserSetting } from '../types';
import { nextId } from './codes';

export interface AuditOpts {
  recordType?: string;   // Sub-category — e.g. 'CCR' inside RFQ
  recordRef?: string;    // External reference code — 'PO-1001', 'IRF-000123', stock id, etc.
  recordId?: number;     // Internal id of the affected record
  details?: string;      // Human-readable summary of what changed
}

/**
 * Append an audit log entry to a state snapshot and return the new state.
 * Designed to compose inside `setState((prev) => appendAudit({ ...prev, /* changes *\/ }, user, ...))`.
 *
 * The new log is prepended so the AuditTrail viewer shows newest first by default.
 */
export function appendAudit(
  state: AppState,
  user: UserSetting | null,
  module: string,
  action: string,
  opts?: AuditOpts,
): AppState {
  const existing = state.auditLogs ?? [];
  const log: AuditLog = {
    id: nextId(existing),
    timestamp: new Date().toISOString(),
    username: user?.username ?? 'unknown',
    userId: user?.id ?? 0,
    module,
    action,
    recordType: opts?.recordType,
    recordRef: opts?.recordRef,
    recordId: opts?.recordId,
    details: opts?.details,
  };
  return { ...state, auditLogs: [log, ...existing] };
}
