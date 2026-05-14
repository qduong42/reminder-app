import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, InviteInfo } from '../api';

export function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api.getInviteInfo(token)
      .then(setInfo)
      .catch((err: Error) => {
        if (err.message.includes('410')) setError('This invite link has expired.');
        else if (err.message.includes('404')) setError('Invite link not found.');
        else setError('Something went wrong.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function handleJoin() {
    if (!token) return;
    try {
      await api.me();
    } catch {
      navigate(`/login?returnTo=/invite/${token}`);
      return;
    }
    try {
      await api.joinViaInvite(token);
      setJoined(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('409')) setError('You are already a member of this household.');
      else setError('Failed to join. Please try again.');
    }
  }

  if (loading) return <div style={{ padding: 32 }}>Loading...</div>;

  if (error) return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: 24, fontFamily: 'sans-serif', textAlign: 'center' }}>
      <p style={{ color: '#dc2626' }}>{error}</p>
    </div>
  );

  if (joined) return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: 24, fontFamily: 'sans-serif', textAlign: 'center' }}>
      <h2>Request sent!</h2>
      <p>You've been added as a pending member of <strong>{info?.householdName}</strong>. An active member needs to accept you.</p>
      <button onClick={() => navigate('/')}>Go to Dashboard</button>
    </div>
  );

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: 24, fontFamily: 'sans-serif', textAlign: 'center' }}>
      <h2>You've been invited!</h2>
      <p>Join <strong>{info?.householdName}</strong>?</p>
      <p style={{ fontSize: 12, color: '#6b7280' }}>
        Expires {info ? new Date(info.expiresAt).toLocaleString() : ''}
      </p>
      <button onClick={handleJoin} style={{ padding: '8px 24px', fontSize: 16 }}>
        Join Household
      </button>
    </div>
  );
}
