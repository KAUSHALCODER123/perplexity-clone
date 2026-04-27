import React from 'react';
import { Sidebar } from './Sidebar';
import './MainLayout.css';

export const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="main-layout">
      <Sidebar />
      <main className="content-area">
        {children}
      </main>
    </div>
  );
};
