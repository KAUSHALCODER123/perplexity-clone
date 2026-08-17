const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000';

export const getToken = (): string => {
  try {
    const userStr = localStorage.getItem('user');
    if (!userStr) return '';
    const user = JSON.parse(userStr);
    return user?.session?.access_token || '';
  } catch {
    return '';
  }
};

const handleExpiredSession = () => {
  localStorage.removeItem('user');
  // Already on an auth screen? Let the page render its own error instead of
  // bouncing the user in a redirect loop.
  const path = window.location.pathname;
  if (path !== '/login' && path !== '/signup') {
    window.location.href = '/login';
  }
};

export const fetchAPI = async (endpoint: string, options: RequestInit = {}) => {
  const token = getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });

  if (!response.ok) {
    if (response.status === 401) {
      handleExpiredSession();
      throw new Error('Your session expired. Sign in again to continue.');
    }
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Request failed (${response.status})`);
  }

  // 204 and other empty bodies would otherwise throw on .json()
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export const getSSEEndpoint = (endpoint: string) => `${API_BASE}${endpoint}`;
