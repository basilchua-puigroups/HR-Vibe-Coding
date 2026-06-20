import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, supabaseConfigured } from '../utils/supabase';

/**
 * Public route reached from a Supabase password-reset email. Supabase parses the
 * recovery token from the URL into a temporary session; this page collects a new
 * password and calls auth.updateUser(), then sends the user to the login screen.
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Wait for Supabase to establish the recovery session from the URL hash.
  useEffect(() => {
    if (!supabase) { setReady(true); return; }

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) setHasSession(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setHasSession(true);
    });
    setReady(true);
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (password.length < 6) { setMsg({ kind: 'err', text: 'Password must be at least 6 characters.' }); return; }
    if (password !== confirm) { setMsg({ kind: 'err', text: 'Passwords do not match.' }); return; }
    if (!supabase) { setMsg({ kind: 'err', text: 'Password reset is unavailable.' }); return; }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) { setMsg({ kind: 'err', text: error.message }); return; }
      // Sign out the temporary recovery session so the user logs in fresh.
      await supabase.auth.signOut();
      setMsg({ kind: 'ok', text: 'Password updated. Redirecting to sign in…' });
      setTimeout(() => navigate('/', { replace: true }), 1500);
    } finally {
      setBusy(false);
    }
  }

  const card: React.CSSProperties = { background: '#fff', borderRadius: 10, boxShadow: '0 4px 24px rgba(0,0,0,.12)', padding: '40px 36px', width: 340, maxWidth: '94vw' };
  const wrap: React.CSSProperties = { display: 'flex', position: 'fixed', inset: 0, zIndex: 9999, background: '#f0f4f8', alignItems: 'center', justifyContent: 'center' };

  if (!ready) return <div style={wrap}><div style={card}>Loading…</div></div>;

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, color: '#1a3c2a' }}>Reset Password</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#777' }}>Choose a new password</p>
        </div>

        {!supabaseConfigured ? (
          <p style={{ color: '#c0392b', fontSize: 13 }}>Password reset is unavailable in this environment.</p>
        ) : !hasSession ? (
          <p style={{ color: '#c0392b', fontSize: 13, lineHeight: 1.5 }}>
            This reset link is invalid or has expired. Please request a new one from the sign-in page.
          </p>
        ) : (
          <form onSubmit={handleSubmit} autoComplete="off">
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#444', marginBottom: 4 }}>New password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setMsg(null); }}
              style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14, marginBottom: 14 }}
            />
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#444', marginBottom: 4 }}>Confirm password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setMsg(null); }}
              style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14, marginBottom: 6 }}
            />
            {msg && (
              <p style={{ color: msg.kind === 'ok' ? '#1a5c38' : '#c0392b', fontSize: 13, margin: '0 0 12px' }}>{msg.text}</p>
            )}
            <button
              type="submit"
              disabled={busy}
              style={{ width: '100%', padding: 10, background: '#1a5c38', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1, marginTop: 6 }}
            >
              {busy ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
