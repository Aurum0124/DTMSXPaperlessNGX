import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Footer } from '../components/index.js';
import { sessionManager } from '../services/session.js';
import { apiCall } from '../services/api.js';

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  fontSize: '1rem',
  border: '1.5px solid #d1d5db',
  borderRadius: 8,
  background: '#fff',
  color: '#111',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoggingIn(true);
    try {
      const data = await apiCall('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      const { token, user } = data;
      sessionManager.setUserSession(user.username, token, user);
      setIsLoggingIn(false);
      if (user.role === 'admin') {
        navigate('/admin');
      } else {
        navigate(`/${user.username}`);
      }
    } catch (err) {
      setIsLoggingIn(false);
      setError(err.message || 'Invalid username or password');
    }
  };

  return (
    <div className="login-page">
      {/* Header bar - same structure as departments for footer alignment */}
      <div className="bg-bar top login-header" style={{ fontFamily: 'Roboto Condensed, Arial, sans-serif' }}>
        <div className="app-header-inner" style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginRight: 12 }}>
            <img src="/assets/logo.png" alt="PGIN Logo" style={{ height: '60px', width: 'auto' }} />
            <img src="/assets/Bagong%20Pilipinas.png" alt="Bagong Pilipinas" style={{ height: '60px', width: 'auto' }} />
          </div>
        </div>
      </div>

      <div className="login-split">
        <div className="login-split-left">
          <div className="login-form-wrap">
            <div className="login-card-header">
              <h2 className="login-title">Sign in</h2>
              <p className="login-subtitle">Enter your credentials to access DTS</p>
            </div>

              <form onSubmit={handleSubmit} className="login-form">
                <div className="login-field">
                  <label htmlFor="login-username">Username</label>
                  <input
                    id="login-username"
                    type="text"
                    className="login-input"
                    placeholder="Enter username"
                    value={username}
                    onChange={e => { setUsername(e.target.value); setError(''); }}
                    required
                    autoComplete="username"
                    disabled={isLoggingIn}
                    autoFocus
                    aria-invalid={!!error}
                    aria-describedby={error ? 'login-error' : undefined}
                    style={inputStyle}
                  />
                </div>

                <div className="login-field">
                  <label htmlFor="login-password">Password</label>
                  <input
                    id="login-password"
                    type="password"
                    autoComplete="current-password"
                    className="login-input"
                    placeholder="Enter password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(''); }}
                    required
                    disabled={isLoggingIn}
                    aria-invalid={!!error}
                    aria-describedby={error ? 'login-error' : undefined}
                    style={inputStyle}
                  />
                </div>

                {error && (
                  <div id="login-error" className="login-error" role="alert">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="login-submit"
                  disabled={isLoggingIn}
                >
                  {isLoggingIn ? (
                    <>
                      <span className="login-spinner" />
                      Signing in…
                    </>
                  ) : (
                    'Sign in'
                  )}
                </button>
              </form>
          </div>
        </div>
        <div className="login-split-right login-split-logo">
          <img src="/assets/logo.png" alt="PGIN" className="login-hero-logo" />
        </div>
      </div>

      <Footer />
    </div>
  );
}

export default LoginForm; 