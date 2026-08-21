import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { MainLayout } from './components/MainLayout';
import { Chat } from './pages/Chat';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';

const Splash: React.FC = () => (
  <div
    style={{
      display: 'flex',
      height: '100dvh',
      justifyContent: 'center',
      alignItems: 'center',
      color: 'var(--paper-faint)',
      fontFamily: 'var(--font-sans)',
      fontSize: '0.75rem',
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
    }}
  >
    Loading
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

/** Signed-in users have no business on the auth screens. */
const GuestRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const AppRoutes = () => (
  <Routes>
    <Route
      path="/login"
      element={
        <GuestRoute>
          <Login />
        </GuestRoute>
      }
    />
    <Route
      path="/signup"
      element={
        <GuestRoute>
          <Signup />
        </GuestRoute>
      }
    />
    <Route
      path="/"
      element={
        <ProtectedRoute>
          <MainLayout>
            <Chat />
          </MainLayout>
        </ProtectedRoute>
      }
    />
    {/* Anything else is a typo, not a page. */}
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
