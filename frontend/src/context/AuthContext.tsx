import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface AuthUser {
  id: string;
  email?: string;
  session?: { access_token?: string };
  [key: string]: unknown;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (userData: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: () => {},
  logout: () => {},
});

/** localStorage is synchronous, so the stored session is known on first render. */
const readStoredUser = (): AuthUser | null => {
  const storedUser = localStorage.getItem('user');
  if (!storedUser) return null;
  try {
    const parsed = JSON.parse(storedUser) as AuthUser;
    // A stored user without a token can't call the API, so treat it as signed
    // out rather than letting every request 401.
    if (parsed?.session?.access_token) return parsed;
  } catch {
    // falls through to the cleanup below
  }
  localStorage.removeItem('user');
  return null;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(readStoredUser);
  // Resolved during the first render, so there is no auth flash to wait out.
  const loading = false;

  // Signing out in one tab signs out the others.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'user') return;
      if (!e.newValue) {
        setUser(null);
        return;
      }
      try {
        setUser(JSON.parse(e.newValue) as AuthUser);
      } catch {
        setUser(null);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const login = useCallback((userData: AuthUser) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('user');
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
