import React, { useCallback, useEffect, useState } from 'react';
import { Menu, X, SquarePen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import './MainLayout.css';

export const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Escape closes the drawer, and body scroll is locked while it's open so the
  // page behind doesn't scroll under the user's finger.
  useEffect(() => {
    if (!drawerOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    document.addEventListener('keydown', onKeyDown);

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [drawerOpen, closeDrawer]);

  return (
    <div className={`main-layout ${drawerOpen ? 'drawer-open' : ''}`}>
      <header className="topbar">
        <button
          className="topbar-btn"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open threads"
          aria-expanded={drawerOpen}
        >
          <Menu size={20} />
        </button>

        <span className="topbar-title">Cited</span>

        <button
          className="topbar-btn"
          onClick={() => navigate('/')}
          aria-label="New thread"
        >
          <SquarePen size={19} />
        </button>
      </header>

      <div
        className="drawer-scrim"
        onClick={closeDrawer}
        aria-hidden="true"
      />

      <Sidebar onNavigate={closeDrawer} drawerOpen={drawerOpen}>
        <button
          className="drawer-close"
          onClick={closeDrawer}
          aria-label="Close threads"
        >
          <X size={18} />
        </button>
      </Sidebar>

      <main className="content-area">{children}</main>
    </div>
  );
};
