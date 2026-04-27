import React, { useEffect, useState } from 'react';
import { Plus, MessageSquare, LogOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchAPI } from '../utils/api';
import './Sidebar.css';

interface Conversation {
  id: string;
  title: string;
  created_at: string;
}

export const Sidebar: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (user) {
      loadConversations();
    }
  }, [user]);

  const loadConversations = async () => {
    try {
      const data = await fetchAPI('/conversations');
      setConversations(data || []);
    } catch (err) {
      console.error('Failed to load conversations', err);
    }
  };

  const handleNewChat = async () => {
    try {
      // Backend expects user_id and title (but we'll just pass generic title for now, 
      // or we can let the backend generate it. The backend currently takes userId and title)
      const res = await fetchAPI('/newChat', {
        method: 'POST',
        body: JSON.stringify({ userId: user.user?.id || user.id, title: 'New Conversation' }),
      });
      if (res && res.length > 0) {
        navigate(`/?chat=${res[0].id}`);
        loadConversations();
      }
    } catch (err) {
      console.error('Failed to create new chat', err);
      // Fallback: just go home
      navigate('/');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        {!collapsed && <h2>Perplexity Clone</h2>}
        <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      <button className="new-chat-btn btn-primary" onClick={handleNewChat}>
        <Plus size={20} />
        {!collapsed && <span>New Thread</span>}
      </button>

      <div className="conversations-list">
        {!collapsed && <div className="list-title">Recent Threads</div>}
        {conversations.map(conv => (
          <div 
            key={conv.id} 
            className={`conversation-item ${location.search.includes(conv.id) ? 'active' : ''}`}
            onClick={() => navigate(`/?chat=${conv.id}`)}
          >
            <MessageSquare size={18} className="conv-icon" />
            {!collapsed && <span className="conv-title">{conv.title || 'Untitled Chat'}</span>}
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="avatar">
            {user?.email?.charAt(0).toUpperCase() || 'U'}
          </div>
          {!collapsed && (
            <div className="user-info">
              <span className="user-email">{user?.email || 'User'}</span>
            </div>
          )}
        </div>
        <button className="logout-btn" onClick={handleLogout} title="Sign Out">
          <LogOut size={16} className="logout-icon" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
};
