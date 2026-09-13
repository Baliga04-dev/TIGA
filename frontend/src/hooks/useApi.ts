import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import type {
  StatusResponse,
  ChatMessage,
  EmailSummaryResponse,
  FetchEmailsResponse,
} from '../types';

export function useStatus() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getStatus();
      setStatus(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  return { status, loading, error, refetch: fetchStatus };
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (text: string) => {
    const userMessage: ChatMessage = {
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setLoading(true);
    setError(null);

    try {
      const response = await api.chat(text, messages);
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.reply,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
      return response;
    } catch (e) {
      const err = e instanceof Error ? e.message : 'Failed to send message';
      setError(err);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [messages]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, loading, error, sendMessage, clearMessages };
}

export function useEmailSummary(days = 1) {
  const [summary, setSummary] = useState<EmailSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getEmailSummary(days);
      setSummary(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch email summary');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return { summary, loading, error, refetch: fetchSummary };
}

export function useEmails(query = '', maxResults = 20, daysBack = 1) {
  const [emails, setEmails] = useState<FetchEmailsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEmails = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.fetchEmails(query, maxResults, daysBack);
      setEmails(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch emails');
    } finally {
      setLoading(false);
    }
  }, [query, maxResults, daysBack]);

  return { emails, loading, error, refetch: fetchEmails };
}