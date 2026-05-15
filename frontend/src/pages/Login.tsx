import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api';

export function Login() {
  const navigate = useNavigate();
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.login(usernameOrEmail, password, rememberMe);
      const params = new URLSearchParams(window.location.search);
      navigate(params.get('returnTo') || '/');
    } catch {
      setError('Invalid username/email or password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      boxSizing: 'border-box',
      fontFamily: 'sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <h1 style={{ marginBottom: 24, fontSize: 24 }}>Task Tracker</h1>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Username or Email</label>
            <input
              value={usernameOrEmail}
              onChange={e => setUsernameOrEmail(e.target.value)}
              required
              autoComplete="username"
              style={{ width: '100%', padding: '12px', boxSizing: 'border-box', fontSize: 16, borderRadius: 6, border: '1px solid #d1d5db' }}
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={{ width: '100%', padding: '12px 44px 12px 12px', boxSizing: 'border-box', fontSize: 16, borderRadius: 6, border: '1px solid #d1d5db' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                style={{
                  position: 'absolute', right: 0, top: 0, bottom: 0,
                  width: 44, background: 'none', border: 'none',
                  cursor: 'pointer', fontSize: 16, color: '#6b7280',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          <div style={{ marginBottom: 16, textAlign: 'right' }}>
            <Link to="/forgot-password" style={{ fontSize: 14, color: '#2563eb' }}>Forgot password?</Link>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              Remember me (30 days)
            </label>
          </div>
          {error && <p style={{ color: '#dc2626', margin: '0 0 12px' }}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '14px', fontSize: 16, borderRadius: 6,
              cursor: loading ? 'not-allowed' : 'pointer', border: 'none',
              background: loading ? '#9ca3af' : '#2563eb', color: 'white', fontWeight: 600,
            }}
          >
            {loading ? 'Logging in…' : 'Log in'}
          </button>
          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14, color: '#6b7280' }}>
            Don't have an account?{' '}
            <Link to="/register" style={{ color: '#2563eb' }}>Register</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
