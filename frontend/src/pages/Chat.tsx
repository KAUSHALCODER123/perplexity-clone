import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowUp, Square } from 'lucide-react';
import { MessageBubble, type Message, type Source } from '../components/MessageBubble';
import { getSSEEndpoint, fetchAPI, getToken } from '../utils/api';
import { SSEParser } from '../utils/sse';
import { threadsChanged } from '../utils/threads';
import './Chat.css';

const SUGGESTIONS = [
  'What changed in the EU AI Act this year?',
  'How do mRNA vaccines actually work?',
  'Is nuclear power cheaper than solar now?',
];

const MAX_TITLE = 60;

export const Chat: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const chatId = searchParams.get('chat');

  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // The id this component created itself. The URL update that follows would
  // otherwise re-trigger loadHistory and wipe the message still streaming.
  const selfCreatedId = useRef<string | null>(null);
  // Only auto-scroll while the user is already at the bottom.
  const pinnedToBottom = useRef(true);

  /* ---------------------------------------------------------------- history */

  const loadHistory = useCallback(async (id: string) => {
    try {
      const msgs = await fetchAPI(`/conversations/${id}`, { method: 'POST' });
      if (!Array.isArray(msgs)) return;

      setMessages(
        msgs.map((m: Record<string, unknown>) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: String(m.content ?? ''),
          sources: safeParse<Source[]>(m.sources),
          followUps: safeParse<string[]>(m.follow_ups),
          isStreaming: false,
        }))
      );
    } catch (err) {
      console.error('Failed to load history', err);
      setError('Could not load this thread. Try opening it again.');
    }
  }, []);

  // Leaving a thread clears the transcript. This is the "adjust state when a
  // prop changes" pattern rather than an effect, so the empty state renders in
  // the same pass instead of flashing the previous thread's messages first.
  const [syncedChatId, setSyncedChatId] = useState(chatId);
  if (syncedChatId !== chatId) {
    setSyncedChatId(chatId);
    if (!chatId) {
      setMessages([]);
      setError('');
    }
  }

  useEffect(() => {
    if (!chatId) return;
    // Skip the refetch for a thread this component just created — its messages
    // are already on screen and one of them is mid-stream.
    if (chatId === selfCreatedId.current) return;
    loadHistory(chatId);
  }, [chatId, loadHistory]);

  // Cancel any in-flight stream when the page goes away.
  useEffect(() => () => abortRef.current?.abort(), []);

  /* --------------------------------------------------------------- scrolling */

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedToBottom.current = distance < 120;
  };

  useEffect(() => {
    if (!pinnedToBottom.current) return;
    // 'auto' during a stream: smooth scrolling on every token never settles.
    const behavior = isLoading ? 'auto' : 'smooth';
    endRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, [messages, isLoading]);

  /* ------------------------------------------------------------------ input */

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, []);

  useEffect(autoResize, [query, autoResize]);

  /* ------------------------------------------------------------------- send */

  const updateLast = (patch: Partial<Message>) => {
    setMessages((prev) => {
      if (!prev.length) return prev;
      const next = [...prev];
      next[next.length - 1] = { ...next[next.length - 1], ...patch };
      return next;
    });
  };

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    setError('');
    const isFollowUp = Boolean(chatId);
    let activeChatId = chatId;

    if (!activeChatId) {
      try {
        const title =
          trimmed.length > MAX_TITLE ? `${trimmed.slice(0, MAX_TITLE).trimEnd()}…` : trimmed;
        const res = await fetchAPI('/newChat', {
          method: 'POST',
          body: JSON.stringify({ title }),
        });
        if (!Array.isArray(res) || !res.length) throw new Error('No thread returned');

        activeChatId = res[0].id;
        selfCreatedId.current = activeChatId;
        setSearchParams({ chat: activeChatId! }, { replace: true });
        threadsChanged();
      } catch (err) {
        console.error('Failed to create thread', err);
        setError('Could not start a thread. Check that the server is running.');
        return;
      }
    }

    setQuery('');
    setIsLoading(true);
    pinnedToBottom.current = true;
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: trimmed },
      { role: 'assistant', content: '', isStreaming: true },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const endpoint = isFollowUp ? '/perplexity_ask/follow-up' : '/perplexity_ask';
      const response = await fetch(getSSEEndpoint(endpoint), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ query: trimmed, conversationID: activeChatId }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`The server responded with ${response.status}.`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parser = new SSEParser();

      let answer = '';
      let streamError = '';

      const consume = (event: string, raw: string) => {
        let data: unknown;
        try {
          data = JSON.parse(raw);
        } catch {
          return; // a frame we can't read is a frame we skip
        }

        if (event === 'mode') {
          const mode = (data as { mode?: string })?.mode;
          if (mode === 'direct' || mode === 'search') updateLast({ mode });
        } else if (event === 'sources' && Array.isArray(data)) {
          updateLast({ sources: data as Source[] });
        } else if (event === 'text') {
          const delta = (data as { delta?: string })?.delta;
          if (typeof delta === 'string') {
            answer += delta;
            updateLast({ content: answer });
          }
        } else if (event === 'followUps' && Array.isArray(data)) {
          updateLast({ followUps: data as string[] });
        } else if (event === 'error') {
          streamError = (data as { message?: string })?.message || 'The answer stopped early.';
        }
      };

      // Read to completion. The 'end' event marks a clean finish, but the
      // stream closing is what actually ends the loop — so a server that dies
      // mid-answer still releases the UI.
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const evt of parser.push(decoder.decode(value, { stream: true }))) {
          consume(evt.event, evt.data);
        }
      }
      for (const evt of parser.flush()) consume(evt.event, evt.data);

      if (streamError) setError(streamError);
      if (!answer && !streamError) {
        setError('The server returned an empty answer. Try asking again.');
      }
      threadsChanged();
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        // The user stopped it on purpose; whatever streamed in stays put.
      } else {
        console.error('Chat error', err);
        setError(
          (err as Error)?.message || 'Something went wrong reaching the server.'
        );
      }
    } finally {
      // Runs on every path, so the composer can never stay stuck.
      abortRef.current = null;
      updateLast({ isStreaming: false });
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter breaks the line. Never send mid-IME-composition.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend(query);
    }
  };

  /* ------------------------------------------------------------------ render */

  const composer = (
    <div className="composer">
      <textarea
        ref={textareaRef}
        className="composer-input"
        rows={1}
        placeholder={messages.length ? 'Ask a follow-up…' : 'Ask anything…'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Your question"
      />
      {isLoading ? (
        <button
          className="composer-btn stop"
          onClick={() => abortRef.current?.abort()}
          aria-label="Stop generating"
          title="Stop"
        >
          <Square size={14} fill="currentColor" />
        </button>
      ) : (
        <button
          className="composer-btn"
          onClick={() => handleSend(query)}
          disabled={!query.trim()}
          aria-label="Send question"
          title="Send"
        >
          <ArrowUp size={18} />
        </button>
      )}
    </div>
  );

  if (messages.length === 0) {
    return (
      <div className="chat-container">
        <div className="ask-screen animate-rise">
          <div className="ask-inner">
            <h1 className="ask-title">Ask anything.</h1>

            {error && <div className="notice error">{error}</div>}

            {composer}

            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="suggestion" onClick={() => handleSend(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-container">
      <div className="messages-area" ref={scrollRef} onScroll={handleScroll}>
        <div className="messages-inner">
          {messages.map((msg, idx) => (
            <MessageBubble
              key={idx}
              message={msg}
              domPrefix={`m${idx}`}
              onFollowUpClick={handleSend}
            />
          ))}
          {error && <div className="notice error">{error}</div>}
          <div ref={endRef} />
        </div>
      </div>

      <div className="composer-dock">
        <div className="composer-shell">{composer}</div>
      </div>
    </div>
  );
};

function safeParse<T>(value: unknown): T | undefined {
  if (!value) return undefined;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}
