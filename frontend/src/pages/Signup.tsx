import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchAPI } from '../utils/api';
import './Auth.css';

export const Signup: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setInfo('');

    if (password.length < 6) {
      setError('Use at least 6 characters for your password.');
      return;
    }

    setLoading(true);
    try {
      const data = await fetchAPI('/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (data?.user && data?.session?.access_token) {
        login({ ...data.user, session: data.session });
        navigate('/', { replace: true });
        return;
      }

      // Supabase returns a user with no session when email confirmation is on.
      // Storing that user would leave every API call unauthorized, so the
      // account waits for confirmation instead of half-signing them in.
      if (data?.user) {
        setInfo(
          `Account created. Confirm the link sent to ${email}, then sign in.`
        );
        return;
      }

      setError('Signup did not complete. Try again.');
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

        <h1>Create an account</h1>
        <p className="auth-subtitle">Start asking questions that come back sourced.</p>

        {error && (
          <div className="auth-notice error" role="alert">
            {error}
          </div>
        )}
        {info && (
          <div className="auth-notice info" role="status">
            {info}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="signup-email">Email</label>
            <input
              id="signup-email"
              type="email"
              className="field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
              type="password"
              className="field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
            <span className="form-hint">At least 6 characters.</span>
          </div>

          <button type="submit" className="btn-primary auth-submit" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
};
