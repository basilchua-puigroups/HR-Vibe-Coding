import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { supabaseConfigured, requestPasswordReset, sendUsernameReminder } from '../utils/supabase';

export default function Login() {
  const { login } = useAuth();
  const { state } = useApp();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  // Forgot password / username flow — both keyed off the email the user enters.
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMsg, setResetMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [resetBusy, setResetBusy] = useState<'pw' | 'user' | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const ok = await login(username, password, state.userSettings, state.workers ?? []);
      if (ok) {
        navigate('/', { replace: true });
      } else {
        setError(true);
      }
    } finally {
      setBusy(false);
    }
  }

  function validEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  async function handleResetPassword() {
    if (resetBusy) return;
    setResetMsg(null);
    const email = resetEmail.trim();
    if (!supabaseConfigured) {
      setResetMsg({ kind: 'err', text: 'This feature is unavailable. Please contact your administrator.' });
      return;
    }
    if (!validEmail(email)) {
      setResetMsg({ kind: 'err', text: 'Please enter a valid email address.' });
      return;
    }
    setResetBusy('pw');
    try {
      await requestPasswordReset(email, `${window.location.origin}/reset-password`);
      setResetMsg({ kind: 'ok', text: 'If an account exists for that email, a password reset link has been sent.' });
    } catch {
      setResetMsg({ kind: 'err', text: 'Could not send the email. Please try again or contact your administrator.' });
    } finally {
      setResetBusy(null);
    }
  }

  async function handleForgotUsername() {
    if (resetBusy) return;
    setResetMsg(null);
    const email = resetEmail.trim();
    if (!supabaseConfigured) {
      setResetMsg({ kind: 'err', text: 'This feature is unavailable. Please contact your administrator.' });
      return;
    }
    if (!validEmail(email)) {
      setResetMsg({ kind: 'err', text: 'Please enter a valid email address.' });
      return;
    }
    setResetBusy('user');
    try {
      await sendUsernameReminder(email);
      setResetMsg({ kind: 'ok', text: 'If an account exists for that email, your username has been emailed to you.' });
    } catch {
      setResetMsg({ kind: 'err', text: 'Could not send the email. Please try again or contact your administrator.' });
    } finally {
      setResetBusy(null);
    }
  }

  return (
    <div style={{ display: 'flex', position: 'fixed', inset: 0, zIndex: 9999, background: '#f0f4f8', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 4px 24px rgba(0,0,0,.12)', padding: '40px 36px', width: 340, maxWidth: '94vw' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 52, height: 52, background: '#1a5c38', borderRadius: 12, marginBottom: 12 }}>
            <span style={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>MP</span>
          </div>
          <h2 style={{ margin: 0, fontSize: 20, color: '#1a3c2a' }}>Mill Parts System</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#777' }}>Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off">
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#444', marginBottom: 4 }}>Username</label>
          <input
            type="text"
            autoComplete="username"
            placeholder="Enter username"
            value={username}
            onChange={(e) => { setUsername(e.target.value); setError(false); }}
            style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14, marginBottom: 14 }}
          />
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#444', marginBottom: 4 }}>Password</label>
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(false); }}
            style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14, marginBottom: 6 }}
          />
          {error && (
            <p style={{ color: '#c0392b', fontSize: 13, margin: '0 0 12px' }}>Incorrect username or password.</p>
          )}
          <button
            type="submit"
            disabled={busy}
            style={{ width: '100%', padding: 10, background: '#1a5c38', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}
          >
            {busy ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            type="button"
            onClick={() => { setShowReset((v) => !v); setResetMsg(null); }}
            style={{ background: 'none', border: 'none', color: '#1a5c38', fontSize: 13, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
          >
            Forgot password or username?
          </button>

          {showReset && (
            <div style={{ marginTop: 12, textAlign: 'left' }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#444', marginBottom: 4 }}>
                Enter your email
              </label>
              <input
                type="email"
                placeholder="you@example.com"
                value={resetEmail}
                onChange={(e) => { setResetEmail(e.target.value); setResetMsg(null); }}
                style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '8px 11px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13, marginBottom: 8 }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={resetBusy !== null}
                  style={{ flex: 1, padding: 8, background: '#eef3ee', color: '#1a5c38', border: '1px solid #cfe0d4', borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: resetBusy ? 'wait' : 'pointer' }}
                >
                  {resetBusy === 'pw' ? 'Sending…' : 'Reset password'}
                </button>
                <button
                  type="button"
                  onClick={handleForgotUsername}
                  disabled={resetBusy !== null}
                  style={{ flex: 1, padding: 8, background: '#eef3ee', color: '#1a5c38', border: '1px solid #cfe0d4', borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: resetBusy ? 'wait' : 'pointer' }}
                >
                  {resetBusy === 'user' ? 'Sending…' : 'Email my username'}
                </button>
              </div>
              <p style={{ fontSize: 11.5, color: '#999', margin: '8px 0 0' }}>
                Emails are only sent to addresses on file. No email? Contact your administrator.
              </p>
              {resetMsg && (
                <p style={{ color: resetMsg.kind === 'ok' ? '#1a5c38' : '#c0392b', fontSize: 12.5, lineHeight: 1.5, margin: '10px 0 0' }}>
                  {resetMsg.text}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
