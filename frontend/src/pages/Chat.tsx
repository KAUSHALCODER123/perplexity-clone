import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Send, ArrowRight } from 'lucide-react';
import { MessageBubble, type Message } from '../components/MessageBubble';
import { getSSEEndpoint, fetchAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import './Chat.css';

export const Chat: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const chatId = searchParams.get('chat');
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chatId) {
      setMessages([]);
    } else {
      loadHistory(chatId);
    }
  }, [chatId]);

  const loadHistory = async (id: string) => {
    try {
      const msgs = await fetchAPI(`/conversations/${id}`, { method: 'POST' });
      if (msgs && Array.isArray(msgs)) {
        const formatted = msgs.map((m: any) => ({
          role: m.role,
          content: m.content,
          sources: m.sources ? JSON.parse(m.sources) : undefined,
          followUps: m.follow_ups ? JSON.parse(m.follow_ups) : undefined,
          isStreaming: false
        }));
        setMessages(formatted);
      }
    } catch (err) {
      console.error('Failed to load history', err);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (text: string) => {
    if (!text.trim() || isLoading) return;

    let activeChatId = chatId;

    // Create a new chat if none exists
    if (!activeChatId) {
      try {
        const res = await fetchAPI('/newChat', {
          method: 'POST',
          body: JSON.stringify({ title: text.substring(0, 50) + '...' }),
        });
        if (res && res.length > 0) {
          activeChatId = res[0].id;
          setSearchParams({ chat: activeChatId });
        }
      } catch (err) {
        console.error('Failed to create new chat', err);
        return; // Stop if we can't create a chat
      }
    }

    const userMessage: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMessage]);
    setQuery('');
    setIsLoading(true);

    const aiMessageIndex = messages.length + 1; // It will be next after the user message
    setMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true }]);

    try {
      const endpoint = chatId ? '/perplexity_ask/follow-up' : '/perplexity_ask';
      
      const response = await fetch(getSSEEndpoint(endpoint), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.session?.access_token || ''}`
        },
        body: JSON.stringify({ query: text, conversationID: activeChatId }),
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      let aiContent = '';
      let sources: any[] = [];
      let followUps: string[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            const eventType = line.substring(7).trim();
            const dataLineIndex = lines.indexOf(line) + 1;
            if (dataLineIndex < lines.length && lines[dataLineIndex].startsWith('data: ')) {
              const dataStr = lines[dataLineIndex].substring(6).trim();
              if (!dataStr) continue;
              
              try {
                const data = JSON.parse(dataStr);
                
                if (eventType === 'sources') {
                  sources = data;
                  setMessages(prev => {
                    const newMsgs = [...prev];
                    newMsgs[aiMessageIndex] = { ...newMsgs[aiMessageIndex], sources };
                    return newMsgs;
                  });
                } else if (eventType === 'text') {
                  aiContent += data.delta;
                  setMessages(prev => {
                    const newMsgs = [...prev];
                    newMsgs[aiMessageIndex] = { ...newMsgs[aiMessageIndex], content: aiContent };
                    return newMsgs;
                  });
                } else if (eventType === 'followUps') {
                  followUps = data;
                  setMessages(prev => {
                    const newMsgs = [...prev];
                    newMsgs[aiMessageIndex] = { ...newMsgs[aiMessageIndex], followUps };
                    return newMsgs;
                  });
                } else if (eventType === 'end') {
                  setMessages(prev => {
                    const newMsgs = [...prev];
                    newMsgs[aiMessageIndex] = { ...newMsgs[aiMessageIndex], isStreaming: false };
                    return newMsgs;
                  });
                  setIsLoading(false);
                  break;
                }
              } catch (e) {
                // Ignore parse errors from partial chunks
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => {
        const newMsgs = [...prev];
        newMsgs[aiMessageIndex] = { 
          role: 'assistant', 
          content: 'An error occurred while fetching the response.', 
          isStreaming: false 
        };
        return newMsgs;
      });
      setIsLoading(false);
    }
  };

  const handleFollowUpClick = (question: string) => {
    handleSend(question);
  };

  return (
    <div className="chat-container">
      {messages.length === 0 ? (
        <div className="hero-section animate-fade-in">
          <h1>Where knowledge begins</h1>
          <div className="search-box glass-panel">
            <input 
              type="text" 
              placeholder="Ask anything..." 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend(query)}
            />
            <button 
              className="send-btn" 
              onClick={() => handleSend(query)}
              disabled={isLoading || !query.trim()}
            >
              <ArrowRight size={24} />
            </button>
          </div>
          <div className="suggested-queries">
            <button onClick={() => handleSend("What are the latest AI models?")}>What are the latest AI models?</button>
            <button onClick={() => handleSend("Explain quantum computing")}>Explain quantum computing</button>
            <button onClick={() => handleSend("Give me a healthy dinner recipe")}>Give me a healthy dinner recipe</button>
          </div>
        </div>
      ) : (
        <div className="chat-interface">
          <div className="messages-area">
            {messages.map((msg, idx) => (
              <MessageBubble 
                key={idx} 
                message={msg} 
                onFollowUpClick={handleFollowUpClick} 
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className="chat-input-area">
            <div className="search-box glass-panel small-search">
              <input 
                type="text" 
                placeholder="Ask a follow up..." 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend(query)}
              />
              <button 
                className="send-btn" 
                onClick={() => handleSend(query)}
                disabled={isLoading || !query.trim()}
              >
                <Send size={20} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
