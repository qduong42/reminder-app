import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Household, Member } from '../api';

export function HouseholdManager() {
  const navigate = useNavigate();
  const [households, setHouseholds] = useState<Household[]>([]);
  const [selected, setSelected] = useState<Household | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [newName, setNewName] = useState('');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadHouseholds = useCallback(async () => {
    try {
      setHouseholds(await api.getHouseholds());
    } catch {
      navigate('/login');
    }
  }, [navigate]);

  useEffect(() => { loadHouseholds(); }, [loadHouseholds]);

  async function selectHousehold(h: Household) {
    if (h.status !== 'active') return;
    setSelected(h);
    setInviteUrl(null);
    setMembers(await api.getMembers(h.id));
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      await api.createHousehold(newName.trim());
      setNewName('');
      await loadHouseholds();
    } catch {
      setError('Failed to create household.');
    }
  }

  async function handleGenerateInvite() {
    if (!selected) return;
    const { url } = await api.generateInvite(selected.id);
    setInviteUrl(url);
  }

  async function handleAccept(userId: string) {
    if (!selected) return;
    await api.acceptMember(selected.id, userId);
    setMembers(prev => prev.map(m => m.userId === userId ? { ...m, status: 'active' as const } : m));
  }

  async function handleRemove(userId: string) {
    if (!selected) return;
    await api.removeMember(selected.id, userId);
    await loadHouseholds();
    setSelected(null);
    setMembers([]);
  }

  async function handleDeleteHousehold() {
    if (!selected || !confirm(`Delete "${selected.name}"? This cannot be undone.`)) return;
    await api.deleteHousehold(selected.id);
    setSelected(null);
    setMembers([]);
    await loadHouseholds();
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Households</h1>
        <button onClick={() => navigate('/')}>← Dashboard</button>
      </div>

      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="New household name"
          style={{ flex: 1, padding: '6px 10px' }}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
        />
        <button onClick={handleCreate}>Create</button>
      </div>

      {households.length === 0 && <p style={{ color: '#6b7280' }}>No households yet.</p>}

      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ width: 200 }}>
          {households.map(h => (
            <div
              key={h.id}
              onClick={() => selectHousehold(h)}
              style={{
                padding: '8px 12px',
                cursor: h.status === 'active' ? 'pointer' : 'default',
                background: selected?.id === h.id ? '#e0f2fe' : 'transparent',
                borderRadius: 4,
                marginBottom: 4,
              }}
            >
              <div>{h.name}</div>
              {h.status === 'pending' && (
                <div style={{ fontSize: 11, color: '#d97706' }}>Pending approval</div>
              )}
            </div>
          ))}
        </div>

        {selected && (
          <div style={{ flex: 1 }}>
            <h2 style={{ marginTop: 0 }}>{selected.name}</h2>
            <button onClick={handleGenerateInvite} style={{ marginBottom: 12 }}>
              Generate Invite Link
            </button>
            {inviteUrl && (
              <div style={{ padding: 8, background: '#f0fdf4', borderRadius: 4, marginBottom: 12, wordBreak: 'break-all' }}>
                <strong>Invite link (24h):</strong><br />
                <a href={inviteUrl}>{inviteUrl}</a>
                <button onClick={() => navigator.clipboard.writeText(inviteUrl)} style={{ marginLeft: 8, fontSize: 12 }}>
                  Copy
                </button>
              </div>
            )}
            <h3>Members</h3>
            {members.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ flex: 1 }}>{m.name}</span>
                {m.status === 'pending' && (
                  <>
                    <span style={{ color: '#d97706', fontSize: 12 }}>Pending</span>
                    <button onClick={() => handleAccept(m.userId)} style={{ fontSize: 12 }}>Accept</button>
                  </>
                )}
                <button onClick={() => handleRemove(m.userId)} style={{ fontSize: 12, color: '#dc2626' }}>
                  Remove
                </button>
              </div>
            ))}
            <button onClick={handleDeleteHousehold} style={{ marginTop: 16, color: '#dc2626', fontSize: 12 }}>
              Delete Household
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
