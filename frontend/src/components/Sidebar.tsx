import React, { useCallback, useEffect, useState } from 'react';
import { Plus, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchAPI } from '../utils/api';
import { onThreadsChanged } from '../utils/threads';
import './Sidebar.css';

interface Conversation {
  id: string;
  title: string;
  created_at: string;
}

interface SidebarProps {
  onNavigate: () => void;
  drawerOpen: boolean;
  children?: React.ReactNode;
}

const COLLAPSE_KEY = 'sidebar-collapsed';
const DRAWER_QUERY = '(max-width: 860px)';

export const Sidebar: React.FC<SidebarProps> = ({ onNavigate, drawerOpen, children }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [collapsedPref, setCollapsedPref] = useState(
    () => localStorage.getItem(COLLAPSE_KEY) === 'true'
  );
  const [isDrawer, setIsDrawer] = useState(
    () => window.matchMedia(DRAWER_QUERY).matches
  );

  // Collapsing is a desktop affordance. At drawer widths the panel is always
  // full width, so a collapsed preference carried over from a wide window must
  // not hide the labels here.
  const collapsed = collapsedPref && !isDrawer;

  useEffect(() => {
    const mq = window.matchMedia(DRAWER_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsDrawer(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeId = searchParams.get('chat');

  const loadConversations = useCallback(async () => {
    try {
      const data = await fetchAPI('/conversations');
      setConversations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load threads', err);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    // Fetching on mount is the intended use of an effect. The rule can't see
    // past the async boundary — every setState here happens after an await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user) loadConversations();
  }, [user, loadConversations]);

  // Chat creates threads as you send the first message; refetch when it says so.
  useEffect(() => onThreadsChanged(loadConversations), [loadConversations]);

  const toggleCollapsed = () => {
    setCollapsedPref((prev) => {
      localStorage.setItem(COLLAPSE_KEY, String(!prev));
      return !prev;
    });
  };

  const handleNewChat = () => {
    // Clearing the thread param returns to the ask screen. The thread record
    // is created by the first message, so clicking this never leaves an empty
    // "New Conversation" row behind.
    navigate('/');
    onNavigate();
  };

  const openThread = (id: string) => {
    navigate(`/?chat=${id}`);
    onNavigate();
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initial = user?.email?.charAt(0).toUpperCase() || 'U';

  return (
    <aside
      className={`sidebar ${collapsed ? 'collapsed' : ''} ${drawerOpen ? 'open' : ''}`}
      aria-label="Threads"
    >
      <div className="sidebar-header">
        {!collapsed && (
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              §
            </span>
            <span className="brand-name">Cited</span>
          </div>
        )}
        <button
          className="icon-btn collapse-btn"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        {children}
      </div>

      <button
        className="new-chat-btn"
        onClick={handleNewChat}
        title="New thread"
        aria-label="New thread"
      >
        <Plus size={18} />
        {!collapsed && <span>New thread</span>}
      </button>

      <nav className="conversations-list">
        {!collapsed && <div className="list-title">Threads</div>}

        {loaded && conversations.length === 0 && !collapsed && (
          <p className="list-empty">
            Your threads collect here once you ask something.
          </p>
        )}

        {conversations.map((conv, i) => (
          <button
            key={conv.id}
            className={`conversation-item ${activeId === conv.id ? 'active' : ''}`}
            onClick={() => openThread(conv.id)}
            title={conv.title || 'Untitled thread'}
          >
            <span className="conv-index" aria-hidden="true">
              {String(conversations.length - i).padStart(2, '0')}
            </span>
            {!collapsed && (
              <span className="conv-title">{conv.title || 'Untitled thread'}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="user-profile" title={user?.email || 'Signed in'}>
          <div className="avatar" aria-hidden="true">
            {initial}
          </div>
          {!collapsed && <span className="user-email">{user?.email || 'Signed in'}</span>}
        </div>
        <button className="logout-btn" onClick={handleLogout} title="Sign out">
          <LogOut size={16} />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
};
