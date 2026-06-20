import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { UserSetting, Worker } from '../types';
import { supabase, supabaseConfigured } from '../utils/supabase';

const SESSION_KEY        = 'mp_current_user';
const WORKER_SESSION_KEY = 'mp_current_worker';

interface AuthContextValue {
  currentUser:   UserSetting | null;
  currentWorker: Worker | null;
  login: (username: string, password: string, users: UserSetting[], workers: Worker[]) => Promise<boolean>;
  logout: () => void;
  refreshCurrentUser:   (users: UserSetting[]) => void;
  refreshCurrentWorker: (workers: Worker[]) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function matchByEmail(email: string | null, users: UserSetting[]): UserSetting | null {
  if (!email) return null;
  const lower = email.toLowerCase();
  return users.find((u) => (u.email ?? '').toLowerCase() === lower) ?? null;
}

function matchWorkerByAuthId(authId: string | null, workers: Worker[]): Worker | null {
  if (!authId) return null;
  return workers.find((w) => w.authUserId === authId) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUserState] = useState<UserSetting | null>(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      return stored ? (JSON.parse(stored) as UserSetting) : null;
    } catch { return null; }
  });

  const [currentWorker, setCurrentWorkerState] = useState<Worker | null>(() => {
    try {
      const stored = sessionStorage.getItem(WORKER_SESSION_KEY);
      return stored ? (JSON.parse(stored) as Worker) : null;
    } catch { return null; }
  });

  const authEmailRef  = useRef<string | null>(null);
  const authUidRef    = useRef<string | null>(null);
  const usersRef      = useRef<UserSetting[]>([]);
  const workersRef    = useRef<Worker[]>([]);

  const setCurrentUser = useCallback((user: UserSetting | null) => {
    setCurrentUserState(user);
    if (user) sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    else sessionStorage.removeItem(SESSION_KEY);
  }, []);

  const setCurrentWorker = useCallback((worker: Worker | null) => {
    setCurrentWorkerState(worker);
    if (worker) sessionStorage.setItem(WORKER_SESSION_KEY, JSON.stringify(worker));
    else sessionStorage.removeItem(WORKER_SESSION_KEY);
  }, []);

  // ── Track the Supabase Auth session ──────────────────────────────────────────
  useEffect(() => {
    if (!supabase) return;
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const email = data.session?.user?.email ?? null;
      const uid   = data.session?.user?.id    ?? null;
      authEmailRef.current = email;
      authUidRef.current   = uid;
      if (!email) {
        setCurrentUser(null);
        setCurrentWorker(null);
      } else {
        const staff = matchByEmail(email, usersRef.current);
        if (staff) { setCurrentUser(staff); return; }
        const worker = matchWorkerByAuthId(uid, workersRef.current);
        if (worker) setCurrentWorker(worker);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const email = session?.user?.email ?? null;
      const uid   = session?.user?.id    ?? null;
      authEmailRef.current = email;
      authUidRef.current   = uid;
      if (!email) {
        setCurrentUser(null);
        setCurrentWorker(null);
      } else {
        const staff = matchByEmail(email, usersRef.current);
        if (staff) { setCurrentUser(staff); return; }
        const worker = matchWorkerByAuthId(uid, workersRef.current);
        if (worker) setCurrentWorker(worker);
      }
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [setCurrentUser, setCurrentWorker]);

  async function login(
    username: string,
    password: string,
    users: UserSetting[],
    workers: Worker[],
  ): Promise<boolean> {
    usersRef.current   = users;
    workersRef.current = workers;

    // Legacy / local mode
    if (!supabaseConfigured || !supabase) {
      const user = users.find((u) => u.username === username && u.password === password);
      if (user) { setCurrentUser(user); return true; }
      return false;
    }

    // Check staff first
    const staffMatch = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
    if (staffMatch?.email) {
      const { error } = await supabase.auth.signInWithPassword({ email: staffMatch.email, password });
      if (error) return false;
      setCurrentUser(staffMatch);
      return true;
    }

    // Check workers by workerId
    const workerMatch = workers.find((w) => w.workerId.toLowerCase() === username.toLowerCase());
    if (workerMatch?.status === 'Resigned') return false;
    if (workerMatch?.email) {
      const { data, error } = await supabase.auth.signInWithPassword({ email: workerMatch.email, password });
      if (error) return false;
      // Refresh authUserId in case it was just created
      const freshWorker: Worker = { ...workerMatch, authUserId: data.user?.id ?? workerMatch.authUserId };
      setCurrentWorker(freshWorker);
      return true;
    }

    return false;
  }

  function logout() {
    authEmailRef.current = null;
    authUidRef.current   = null;
    setCurrentUser(null);
    setCurrentWorker(null);
    if (supabase) void supabase.auth.signOut();
  }

  const refreshCurrentUser = useCallback((users: UserSetting[]) => {
    usersRef.current = users;
    setCurrentUserState((prev) => {
      if (supabaseConfigured) {
        const matched = matchByEmail(authEmailRef.current, users);
        if (matched) { sessionStorage.setItem(SESSION_KEY, JSON.stringify(matched)); return matched; }
        return prev;
      }
      if (!prev) return null;
      const fresh = users.find((u) => u.id === prev.id);
      if (!fresh) return prev;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(fresh));
      return fresh;
    });
  }, []);

  const refreshCurrentWorker = useCallback((workers: Worker[]) => {
    workersRef.current = workers;
    setCurrentWorkerState((prev) => {
      if (!prev) return null;
      const fresh = workers.find((w) => w.id === prev.id) ?? prev;
      sessionStorage.setItem(WORKER_SESSION_KEY, JSON.stringify(fresh));
      return fresh;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, currentWorker, login, logout, refreshCurrentUser, refreshCurrentWorker }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
