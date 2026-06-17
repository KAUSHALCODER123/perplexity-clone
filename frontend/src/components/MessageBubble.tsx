import React from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { SourceCard } from './SourceCard';
import './MessageBubble.css';

export interface Source {
  title: string;
  url: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  followUps?: string[];
  isStreaming?: boolean;
}

interface MessageBubbleProps {
  message: Message;
  onFollowUpClick?: (question: string) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onFollowUpClick }) => {
  const isUser = message.role === 'user';

  const renderContent = () => {
    if (isUser) {
      return <div className="user-text">{message.content}</div>;
    }

    const htmlContent = marked.parse(message.content || '', { async: false }) as string;
    const cleanContent = DOMPurify.sanitize(htmlContent);

    return (
      <div 
        className="markdown-content ai-text" 
        dangerouslySetInnerHTML={{ __html: cleanContent || (message.isStreaming ? '<span className="cursor"></span>' : '') }} 
      />
    );
  };

  return (
    <div className={`message-wrapper ${isUser ? 'user-wrapper' : 'ai-wrapper'}`}>
      {!isUser && (
        <div className="message-icon ai-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 1 0 10 10H12V2z"/>
            <path d="M12 12 2.1 12"/>
            <path d="m12 12 7.1-7.1"/>
          </svg>
        </div>
      )}
      
      <div className="message-content-container">
        {isUser && <div className="message-icon user-icon">U</div>}
        
        {message.sources && message.sources.length > 0 && (
          <div className="sources-container">
            {message.sources.map((source, idx) => (
              <SourceCard key={idx} title={source.title} url={source.url} />
            ))}
          </div>
        )}

        {renderContent()}

        {message.followUps && message.followUps.length > 0 && !message.isStreaming && (
          <div className="follow-ups-container">
            <div className="follow-ups-title">Related</div>
            {message.followUps.map((question, idx) => (
              <button 
                key={idx} 
                className="follow-up-btn"
                onClick={() => onFollowUpClick && onFollowUpClick(question)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
                {question}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
