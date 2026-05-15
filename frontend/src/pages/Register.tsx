import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import PasswordStrengthBar from '../components/PasswordStrengthBar';

export function Register() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [generalError, setGeneralError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setUsernameError('');
    setEmailError('');
    setPasswordError('');
    setGeneralError('');
    setLoading(true);
    try {
      await api.register({ username, email, password });
      navigate('/');
    } catch (err) {
      if (err instanceof ApiError) {
        const bodyError = (err.body as { error?: string } | null)?.error;
        if (err.status === 409 && bodyError === 'username_taken') {
          setUsernameError('Username is already taken');
        } else if (err.status === 409 && bodyError === 'email_taken') {
          setEmailError('Email is already registered');
        } else if (err.status === 400 && bodyError === 'Password too weak') {
          setPasswordError('Password too weak');
        } else {
          setGeneralError('Something went wrong, please try again');
        }
      } else {
        setGeneralError('Something went wrong, please try again');
      }
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
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoComplete="username"
              style={{ width: '100%', padding: '12px', boxSizing: 'border-box', fontSize: 16, borderRadius: 6, border: usernameError ? '1px solid #dc2626' : '1px solid #d1d5db' }}
            />
            {usernameError && <p style={{ color: '#dc2626', margin: '4px 0 0', fontSize: 14 }}>{usernameError}</p>}
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={{ width: '100%', padding: '12px', boxSizing: 'border-box', fontSize: 16, borderRadius: 6, border: emailError ? '1px solid #dc2626' : '1px solid #d1d5db' }}
            />
            {emailError && <p style={{ color: '#dc2626', margin: '4px 0 0', fontSize: 14 }}>{emailError}</p>}
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              style={{ width: '100%', padding: '12px', boxSizing: 'border-box', fontSize: 16, borderRadius: 6, border: passwordError ? '1px solid #dc2626' : '1px solid #d1d5db' }}
            />
            <PasswordStrengthBar password={password} />
            {passwordError && <p style={{ color: '#dc2626', margin: '4px 0 0', fontSize: 14 }}>{passwordError}</p>}
          </div>
          {generalError && <p style={{ color: '#dc2626', margin: '0 0 12px' }}>{generalError}</p>}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '14px', fontSize: 16, borderRadius: 6,
              cursor: loading ? 'not-allowed' : 'pointer', border: 'none',
              background: loading ? '#9ca3af' : '#2563eb', color: 'white', fontWeight: 600,
            }}
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14, color: '#6b7280' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#2563eb' }}>Log in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
