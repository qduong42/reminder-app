import { useState, useEffect, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import PasswordStrengthBar from '../components/PasswordStrengthBar';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  boxSizing: 'border-box',
  fontSize: 16,
  borderRadius: 6,
  border: '1px solid #d1d5db',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  fontWeight: 500,
};

const fieldStyle: React.CSSProperties = {
  marginBottom: 16,
};

const sectionStyle: React.CSSProperties = {
  marginBottom: 32,
  paddingBottom: 32,
  borderBottom: '1px solid #e5e7eb',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  marginBottom: 16,
  marginTop: 0,
};

const submitBtnStyle = (loading: boolean): React.CSSProperties => ({
  padding: '10px 20px',
  fontSize: 15,
  borderRadius: 6,
  cursor: loading ? 'not-allowed' : 'pointer',
  border: 'none',
  background: loading ? '#9ca3af' : '#2563eb',
  color: 'white',
  fontWeight: 600,
});

const errorStyle: React.CSSProperties = {
  color: '#dc2626',
  margin: '0 0 12px',
  fontSize: 14,
};

const successStyle: React.CSSProperties = {
  color: '#16a34a',
  margin: '0 0 12px',
  fontSize: 14,
};

export function Settings() {
  const navigate = useNavigate();

  // Identity section state
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [originalUsername, setOriginalUsername] = useState('');
  const [originalEmail, setOriginalEmail] = useState('');
  const [identityLoading, setIdentityLoading] = useState(false);
  const [identitySuccess, setIdentitySuccess] = useState('');
  const [identityGeneralError, setIdentityGeneralError] = useState('');
  const [identityUsernameError, setIdentityUsernameError] = useState('');
  const [identityEmailError, setIdentityEmailError] = useState('');

  // Password section state
  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [pwdGeneralError, setPwdGeneralError] = useState('');
  const [pwdCurrentError, setPwdCurrentError] = useState('');
  const [pwdNewError, setPwdNewError] = useState('');
  const [pwdConfirmError, setPwdConfirmError] = useState('');

  // Delete section state
  const [deleteExpanded, setDeleteExpanded] = useState(false);
  const [deleteCurrentPassword, setDeleteCurrentPassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const hasIdentityChanges = username !== originalUsername || email !== originalEmail;

  useEffect(() => {
    api.getAccount()
      .then(account => {
        setUsername(account.username);
        setEmail(account.email);
        setOriginalUsername(account.username);
        setOriginalEmail(account.email);
      })
      .catch(err => {
        if (err instanceof ApiError && err.status === 401) {
          navigate('/login');
        }
      });
  }, [navigate]);

  async function handleIdentitySubmit(e: FormEvent) {
    e.preventDefault();
    setIdentityGeneralError('');
    setIdentityUsernameError('');
    setIdentityEmailError('');
    setIdentitySuccess('');
    setIdentityLoading(true);
    try {
      const updated = await api.updateIdentity({ username, email });
      setUsername(updated.username);
      setEmail(updated.email);
      setOriginalUsername(updated.username);
      setOriginalEmail(updated.email);
      setIdentitySuccess('Saved.');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { error?: string } | null;
        if (body?.error === 'username_taken') {
          setIdentityUsernameError('Username is already taken');
        } else if (body?.error === 'email_taken') {
          setIdentityEmailError('Email is already registered');
        } else {
          setIdentityGeneralError('Something went wrong');
        }
      } else {
        setIdentityGeneralError('Something went wrong');
      }
    } finally {
      setIdentityLoading(false);
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPwdGeneralError('');
    setPwdCurrentError('');
    setPwdNewError('');
    setPwdConfirmError('');
    setPwdSuccess('');

    if (pwdNew !== pwdConfirm) {
      setPwdConfirmError('Passwords do not match');
      return;
    }

    setPwdLoading(true);
    try {
      await api.updatePassword({ currentPassword: pwdCurrent, newPassword: pwdNew });
      setPwdCurrent('');
      setPwdNew('');
      setPwdConfirm('');
      setPwdSuccess('Password updated.');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          setPwdCurrentError('Incorrect password');
        } else if (err.status === 400) {
          const body = err.body as { error?: string } | null;
          if (body?.error === 'Password too weak') {
            setPwdNewError('Password too weak');
          } else {
            setPwdGeneralError('Something went wrong');
          }
        } else {
          setPwdGeneralError('Something went wrong');
        }
      } else {
        setPwdGeneralError('Something went wrong');
      }
    } finally {
      setPwdLoading(false);
    }
  }

  async function handleDeleteSubmit(e: FormEvent) {
    e.preventDefault();
    setDeleteError('');
    setDeleteLoading(true);
    try {
      await api.deleteAccount(deleteCurrentPassword);
      navigate('/login');
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setDeleteError('Incorrect password');
      } else {
        setDeleteError('Something went wrong');
      }
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: '32px 16px',
      boxSizing: 'border-box',
      fontFamily: 'sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 500 }}>
        <div style={{ marginBottom: 24 }}>
          <Link to="/" style={{ color: '#2563eb', fontSize: 14, textDecoration: 'none' }}>
            ← Back to Dashboard
          </Link>
        </div>
        <h1 style={{ marginBottom: 32, fontSize: 24 }}>Settings</h1>

        {/* Identity Section */}
        <div style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Identity</h2>
          <form onSubmit={handleIdentitySubmit}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Username</label>
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoComplete="username"
                style={{
                  ...inputStyle,
                  borderColor: identityUsernameError ? '#dc2626' : '#d1d5db',
                }}
              />
              {identityUsernameError && (
                <p style={{ ...errorStyle, margin: '4px 0 0' }}>{identityUsernameError}</p>
              )}
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={{
                  ...inputStyle,
                  borderColor: identityEmailError ? '#dc2626' : '#d1d5db',
                }}
              />
              {identityEmailError && (
                <p style={{ ...errorStyle, margin: '4px 0 0' }}>{identityEmailError}</p>
              )}
            </div>
            {identityGeneralError && <p style={errorStyle}>{identityGeneralError}</p>}
            {identitySuccess && <p style={successStyle}>{identitySuccess}</p>}
            <button
              type="submit"
              disabled={identityLoading || !hasIdentityChanges}
              style={submitBtnStyle(identityLoading || !hasIdentityChanges)}
            >
              {identityLoading ? 'Saving…' : 'Save Changes'}
            </button>
          </form>
        </div>

        {/* Password Section */}
        <div style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Change Password</h2>
          <form onSubmit={handlePasswordSubmit}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Current Password</label>
              <input
                type="password"
                value={pwdCurrent}
                onChange={e => setPwdCurrent(e.target.value)}
                required
                autoComplete="current-password"
                style={{
                  ...inputStyle,
                  borderColor: pwdCurrentError ? '#dc2626' : '#d1d5db',
                }}
              />
              {pwdCurrentError && (
                <p style={{ ...errorStyle, margin: '4px 0 0' }}>{pwdCurrentError}</p>
              )}
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>New Password</label>
              <input
                type="password"
                value={pwdNew}
                onChange={e => setPwdNew(e.target.value)}
                required
                autoComplete="new-password"
                style={{
                  ...inputStyle,
                  borderColor: pwdNewError ? '#dc2626' : '#d1d5db',
                }}
              />
              <PasswordStrengthBar password={pwdNew} />
              {pwdNewError && (
                <p style={{ ...errorStyle, margin: '4px 0 0' }}>{pwdNewError}</p>
              )}
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Confirm New Password</label>
              <input
                type="password"
                value={pwdConfirm}
                onChange={e => setPwdConfirm(e.target.value)}
                required
                autoComplete="new-password"
                style={{
                  ...inputStyle,
                  borderColor: pwdConfirmError ? '#dc2626' : '#d1d5db',
                }}
              />
              {pwdConfirmError && (
                <p style={{ ...errorStyle, margin: '4px 0 0' }}>{pwdConfirmError}</p>
              )}
            </div>
            {pwdGeneralError && <p style={errorStyle}>{pwdGeneralError}</p>}
            {pwdSuccess && <p style={successStyle}>{pwdSuccess}</p>}
            <button type="submit" disabled={pwdLoading} style={submitBtnStyle(pwdLoading)}>
              {pwdLoading ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        </div>

        {/* Delete Account Section */}
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ ...sectionTitleStyle, color: '#dc2626' }}>Danger Zone</h2>
          {!deleteExpanded ? (
            <button
              type="button"
              onClick={() => setDeleteExpanded(true)}
              style={{
                padding: '10px 20px',
                fontSize: 15,
                borderRadius: 6,
                cursor: 'pointer',
                border: '1px solid #dc2626',
                background: 'white',
                color: '#dc2626',
                fontWeight: 600,
              }}
            >
              Delete Account
            </button>
          ) : (
            <div style={{
              border: '1px solid #fca5a5',
              borderRadius: 8,
              padding: 20,
              background: '#fff5f5',
            }}>
              <p style={{ margin: '0 0 16px', color: '#7f1d1d', fontSize: 14 }}>
                This action is permanent and cannot be undone. All your data will be deleted.
              </p>
              <form onSubmit={handleDeleteSubmit}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Current Password</label>
                  <input
                    type="password"
                    value={deleteCurrentPassword}
                    onChange={e => setDeleteCurrentPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    style={{
                      ...inputStyle,
                      borderColor: deleteError ? '#dc2626' : '#d1d5db',
                    }}
                  />
                  {deleteError && (
                    <p style={{ ...errorStyle, margin: '4px 0 0' }}>{deleteError}</p>
                  )}
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>
                    Type <strong>DELETE</strong> to confirm
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={e => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                    style={inputStyle}
                  />
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    type="submit"
                    disabled={deleteLoading || deleteConfirmText !== 'DELETE'}
                    style={{
                      padding: '10px 20px',
                      fontSize: 15,
                      borderRadius: 6,
                      cursor: (deleteLoading || deleteConfirmText !== 'DELETE') ? 'not-allowed' : 'pointer',
                      border: 'none',
                      background: (deleteLoading || deleteConfirmText !== 'DELETE') ? '#9ca3af' : '#dc2626',
                      color: 'white',
                      fontWeight: 600,
                    }}
                  >
                    {deleteLoading ? 'Deleting…' : 'Delete My Account'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteExpanded(false);
                      setDeleteCurrentPassword('');
                      setDeleteConfirmText('');
                      setDeleteError('');
                    }}
                    style={{
                      padding: '10px 20px',
                      fontSize: 15,
                      borderRadius: 6,
                      cursor: 'pointer',
                      border: '1px solid #d1d5db',
                      background: 'white',
                      color: '#374151',
                      fontWeight: 600,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
