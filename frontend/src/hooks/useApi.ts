import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import type {
  StatusResponse,
  ChatMessage,
  ChatResponse,
  EmailSummaryResponse,
  FetchEmailsResponse,
} from '../types';

function messageOf(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : fallback;
}

/** Load data on mount (and whenever `load` changes), ignoring answers that arrive late. */
function useRequest<T>(load: () => Promise<T>, fallback: string, pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef({ id: 0 });

  const refetch = useCallback(async () => {
    const id = ++latest.current.id;
    setLoading(true);
    try {
      const result = await load();
      if (id !== latest.current.id) return;
      setData(result);
      setError(null);
    } catch (e) {
      if (id !== latest.current.id) return;
      setData(null);
      setError(messageOf(e, fallback));
    } finally {
      if (id === latest.current.id) setLoading(false);
    }
  }, [load, fallback]);

  useEffect(() => {
    const state = latest.current;
    refetch();
    const timer = pollMs ? setInterval(refetch, pollMs) : undefined;
    return () => {
      state.id++;
      if (timer) clearInterval(timer);
    };
  }, [refetch, pollMs]);

  return { data, loading, error, refetch };
}

export function useStatus() {
  const load = useCallback(() => api.getStatus(), []);
  const { data, loading, error, refetch } = useRequest<StatusResponse>(load, 'Failed to fetch status', 30000);
  return { status: data, loading, error, refetch };
}

export function useEmailSummary(days = 1) {
  const load = useCallback(() => api.getEmailSummary(days), [days]);
  const { data, loading, error, refetch } = useRequest<EmailSummaryResponse>(load, 'Failed to fetch email summary');
  return { summary: data, loading, error, refetch };
}

export function useEmails(query = '', maxResults = 20, daysBack = 1) {
  const load = useCallback(() => api.fetchEmails(query, maxResults, daysBack), [query, maxResults, daysBack]);
  const { data, loading, error, refetch } = useRequest<FetchEmailsResponse>(load, 'Failed to fetch emails');
  return { emails: data, loading, error, refetch };
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const history = useRef<ChatMessage[]>([]);
  const counter = useRef(0);

  const append = useCallback((role: ChatMessage['role'], content: string, actions?: ChatMessage['actions']) => {
    const message: ChatMessage = { id: `m${++counter.current}`, role, content, timestamp: new Date(), actions };
    history.current = [...history.current, message];
    setMessages(history.current);
  }, []);

  /**
   * Resolves to the reply, or null when the request failed (see `error`).
   * A failed message is taken back out of the transcript so the caller can offer it for retry.
   */
  const sendMessage = useCallback(
    async (text: string): Promise<ChatResponse | null> => {
      const prior = history.current;
      append('user', text);
      setLoading(true);
      setError(null);
      try {
        const response = await api.chat(text, prior);
        append('assistant', response.reply, response.actions);
        return response;
      } catch (e) {
        history.current = prior;
        setMessages(prior);
        setError(messageOf(e, 'Failed to send message'));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [append],
  );

  const clearMessages = useCallback(() => {
    history.current = [];
    setMessages([]);
    setError(null);
  }, []);

  return { messages, loading, error, sendMessage, clearMessages };
}
