const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000';

export const fetchAPI = async (endpoint: string, options: RequestInit = {}) => {
  const token = (() => {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        return user?.session?.access_token || ''; // Supabase auth provides session token
      }
    } catch (e) {
      return '';
    }
    return '';
  })();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      // Clear the invalid session
      localStorage.removeItem('user');
      // Force a reload to the login page
      window.location.href = '/login';
      throw new Error('Session expired. Please log in again.');
    }
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }
  return response.json();
};

export const getSSEEndpoint = (endpoint: string) => `${API_BASE}${endpoint}`;
