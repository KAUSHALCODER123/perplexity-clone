import React, { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { SourceCard } from './SourceCard';
import { renderAnswer } from '../utils/renderAnswer';
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
  /** 'direct' when the server answered without a web search. */
  mode?: 'direct' | 'search';
}

interface MessageBubbleProps {
  message: Message;
  domPrefix: string;
  onFollowUpClick?: (question: string) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  domPrefix,
  onFollowUpClick,
}) => {
  const [copied, setCopied] = useState(false);

  const html = useMemo(
    () =>
      message.role === 'assistant'
        ? renderAnswer(message.content, message.sources, domPrefix, message.isStreaming)
        : '',
    [message.content, message.sources, message.role, domPrefix, message.isStreaming]
  );

  if (message.role === 'user') {
    return (
      <article className="turn">
        <h2 className="question">{message.content}</h2>
      </article>
    );
  }

  const sources = message.sources ?? [];
  const hasText = message.content.trim().length > 0;

  const copyAnswer = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked (insecure origin or denied permission) — the button
      // simply doesn't confirm, and the text is still selectable.
    }
  };

  return (
    <article className="turn answer-turn">
      {sources.length > 0 && (
        <section className="sources" aria-label="Sources">
          <div className="section-label">{sources.length} sources</div>
          <div className="sources-rail">
            {sources.map((source, i) => (
              <SourceCard
                key={`${source.url}-${i}`}
                id={`${domPrefix}-src-${i + 1}`}
                index={i + 1}
                title={source.title}
                url={source.url}
              />
            ))}
          </div>
        </section>
      )}

      {!hasText && message.isStreaming ? (
        <p className="working" role="status">
          <span className="working-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          {message.mode === 'direct'
            ? 'Thinking'
            : sources.length > 0
              ? `Reading ${sources.length} sources`
              : 'Searching the web'}
        </p>
      ) : (
        <div
          className={`prose answer ${message.isStreaming ? 'is-streaming' : ''}`}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}

      {hasText && !message.isStreaming && (
        <div className="answer-actions">
          <button
            className="ghost-btn"
            onClick={copyAnswer}
            aria-label={copied ? 'Copied' : 'Copy answer'}
            title={copied ? 'Copied' : 'Copy answer'}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
        </div>
      )}

      {message.followUps && message.followUps.length > 0 && !message.isStreaming && (
        <section className="follow-ups">
          {message.followUps.map((question, i) => (
            <button
              key={i}
              className="follow-up"
              onClick={() => onFollowUpClick?.(question)}
            >
              {question}
            </button>
          ))}
        </section>
      )}
    </article>
  );
};
