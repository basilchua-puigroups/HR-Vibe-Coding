import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import type { AppState } from '../types';
import { loadState, saveState } from '../utils/storage';
import { fetchRemoteState, pushRemoteState, subscribeToChanges, supabaseConfigured } from '../utils/supabase';

export type SyncStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error' | 'offline';

interface AppContextValue {
  state: AppState;
  setState: (updater: (prev: AppState) => AppState) => void;
  syncStatus: SyncStatus;
  syncError: string | null;
}

const AppContext = createContext<AppContextValue | null>(null);

const DEBOUNCE_MS = 600;

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setStateRaw] = useState<AppState>(loadState);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(supabaseConfigured ? 'loading' : 'offline');
  const [syncError, setSyncError] = useState<string | null>(null);
  const pendingState = useRef<AppState | null>(null);
  const saveTimer = useRef<number | null>(null);
  const initialLoadDone = useRef(false);
  // Timestamp of the last push WE sent — used to suppress our own realtime echo.
  const lastPushedAt = useRef<string>('');

  // ── Apply a remote snapshot without triggering another remote save ──────────
  // Preserve fields that are not yet synced to Supabase so a remote fetch
  // doesn't wipe locally-accumulated data (mechanics, PM schedules). Production
  // keeps the same empty-remote guard for the first migration to its new table.
  const applyRemote = useCallback((remote: AppState) => {
    setStateRaw((prev) => {
      const merged: AppState = {
        ...remote,
        auditLogs:          remote.auditLogs?.length          ? remote.auditLogs          : prev.auditLogs          ?? [],
        mechanics:          remote.mechanics?.length           ? remote.mechanics           : prev.mechanics           ?? [],
        pmSchedules:        remote.pmSchedules?.length         ? remote.pmSchedules         : prev.pmSchedules         ?? [],
        production:         remote.production         ?? prev.production         ?? [],
        cagesTippedPhotos:  remote.cagesTippedPhotos  ?? prev.cagesTippedPhotos  ?? [],
        workers:            remote.workers            ?? prev.workers            ?? [],
        workerAttendance:   remote.workerAttendance   ?? prev.workerAttendance   ?? [],
        pieceRateSettings:  prev.pieceRateSettings,
      };
      saveState(merged);
      return merged;
    });
    setSyncStatus('saved');
    setSyncError(null);
  }, []);

  // ── Initial load from Supabase ───────────────────────────────────────────────
  useEffect(() => {
    if (!supabaseConfigured) {
      initialLoadDone.current = true;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchRemoteState();
        if (cancelled) return;
        if (result) {
          applyRemote(result.state);
          lastPushedAt.current = result.updatedAt;
        } else {
          // First run on a fresh DB — push current local state up.
          const ts = await pushRemoteState(state);
          lastPushedAt.current = ts;
          setSyncStatus('saved');
        }
      } catch (err) {
        if (cancelled) return;
        setSyncStatus('error');
        setSyncError(err instanceof Error ? err.message : String(err));
      } finally {
        initialLoadDone.current = true;
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Realtime subscription — pick up changes from other users/tabs ───────────
  useEffect(() => {
    if (!supabaseConfigured) return;
    const channel = subscribeToChanges((remoteState, updatedAt) => {
      // Suppress our own echo: if this timestamp matches what we just pushed, skip it.
      if (updatedAt && updatedAt === lastPushedAt.current) return;
      if (!initialLoadDone.current) return;
      applyRemote(remoteState);
    });
    return () => { channel?.unsubscribe(); };
  }, [applyRemote]);

  // ── Refetch when the browser tab becomes visible again ──────────────────────
  useEffect(() => {
    if (!supabaseConfigured) return;
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      if (!initialLoadDone.current) return;
      (async () => {
        try {
          const result = await fetchRemoteState();
          if (!result) return;
          // Only apply if remote is strictly newer than our last push.
          if (result.updatedAt && result.updatedAt > lastPushedAt.current) {
            applyRemote(result.state);
            lastPushedAt.current = result.updatedAt;
          }
        } catch {
          // silent — status bar will still show stale 'saved'
        }
      })();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [applyRemote]);

  // ── Debounced remote save ────────────────────────────────────────────────────
  const flushRemote = useCallback(async () => {
    if (!supabaseConfigured || !pendingState.current) return;
    const snapshot = pendingState.current;
    pendingState.current = null;
    setSyncStatus('saving');
    try {
      const ts = await pushRemoteState(snapshot);
      lastPushedAt.current = ts;
      setSyncStatus('saved');
      setSyncError(null);
    } catch (err) {
      setSyncStatus('error');
      setSyncError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const scheduleRemoteSave = useCallback((next: AppState) => {
    if (!supabaseConfigured) return;
    pendingState.current = next;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      void flushRemote();
    }, DEBOUNCE_MS);
  }, [flushRemote]);

  const setState = useCallback((updater: (prev: AppState) => AppState) => {
    setStateRaw((prev) => {
      const next = updater(prev);
      saveState(next);
      if (initialLoadDone.current) scheduleRemoteSave(next);
      return next;
    });
  }, [scheduleRemoteSave]);

  // ── Flush on tab close so the last edit isn't lost ──────────────────────────
  useEffect(() => {
    function onBeforeUnload() {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
        void flushRemote();
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [flushRemote]);

  return (
    <AppContext.Provider value={{ state, setState, syncStatus, syncError }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
