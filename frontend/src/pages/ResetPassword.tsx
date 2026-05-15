import { useState, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import PasswordStrengthBar from '../components/PasswordStrengthBar';

export function ResetPassword() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await api.resetPassword(token!, newPassword);
      navigate('/login');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 410) {
          navigate('/forgot-password?error=expired');
        } else if (err.status === 404) {
          navigate('/forgot-password?error=invalid');
        } else if (err.status === 400) {
          setError('Password too weak');
        } else {
          setError('Something went wrong, please try again');
        }
      } else {
        setError('Something went wrong, please try again');
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
        <h2 style={{ marginBottom: 20, fontSize: 18, fontWeight: 600 }}>Set new password</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
              style={{ width: '100%', padding: '12px', boxSizing: 'border-box', fontSize: 16, borderRadius: 6, border: '1px solid #d1d5db' }}
            />
            <PasswordStrengthBar password={newPassword} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              style={{ width: '100%', padding: '12px', boxSizing: 'border-box', fontSize: 16, borderRadius: 6, border: '1px solid #d1d5db' }}
            />
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
            {loading ? 'Resetting…' : 'Reset password'}
          </button>
        </form>
      </div>
    </div>
  );
}
