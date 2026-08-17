import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchAPI } from '../utils/api';
import './Auth.css';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);

    try {
      const data = await fetchAPI('/signin', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (data?.user && data?.session?.access_token) {
        login({ ...data.user, session: data.session });
        navigate('/', { replace: true });
      } else {
        setError('That email and password did not match an account.');
      }
    } catch (err) {
      setError((err as Error)?.message || 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card animate-rise">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">
            §
          </span>
          <span>Cited</span>
        </div>

        <h1>Welcome back</h1>
        <p className="auth-subtitle">Sign in to pick up your threads.</p>

        {error && (
          <div className="auth-notice error" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              className="field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              className="field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button type="submit" className="btn-primary auth-submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="auth-footer">
          No account yet? <Link to="/signup">Create one</Link>
        </p>
      </div>
    </div>
  );
};
