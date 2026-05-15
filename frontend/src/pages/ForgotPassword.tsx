import { useState, FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';

export function ForgotPassword() {
  const [searchParams] = useSearchParams();
  const errorParam = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.forgotPassword(email);
    } catch {
      // swallow errors — no-enumeration behavior
    } finally {
      setLoading(false);
      setSubmitted(true);
      setBannerDismissed(true);
    }
  }

  const showBanner = !bannerDismissed && (errorParam === 'expired' || errorParam === 'invalid');
  const bannerMessage =
    errorParam === 'expired'
      ? 'Your reset link has expired. Request a new one below.'
      : 'That reset link is invalid. Request a new one below.';

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

        {showBanner && (
          <div style={{
            marginBottom: 16,
            padding: '12px 14px',
            borderRadius: 6,
            background: '#fef3c7',
            border: '1px solid #f59e0b',
            color: '#92400e',
            fontSize: 14,
          }}>
            {bannerMessage}
          </div>
        )}

        {submitted ? (
          <p style={{ fontSize: 15, color: '#374151', lineHeight: 1.5 }}>
            If that address is registered, you'll receive a reset link shortly.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={{
                  width: '100%', padding: '12px', boxSizing: 'border-box',
                  fontSize: 16, borderRadius: 6, border: '1px solid #d1d5db',
                }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '14px', fontSize: 16, borderRadius: 6,
                cursor: loading ? 'not-allowed' : 'pointer', border: 'none',
                background: loading ? '#9ca3af' : '#2563eb', color: 'white', fontWeight: 600,
              }}
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14, color: '#6b7280' }}>
          <Link to="/login" style={{ color: '#2563eb' }}>Back to login</Link>
        </p>
      </div>
    </div>
  );
}
