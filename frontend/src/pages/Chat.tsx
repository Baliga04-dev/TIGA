import { useState, useEffect, useRef } from 'react';
import { useChat, useStatus } from '../hooks/useApi';
import { PageHeader, Card } from '../components/ui';
import { cn, formatRelativeTime, speak } from '../lib/utils';
import {
  Send,
  Mail,
  Volume2,
  VolumeX,
  Bot,
  User,
  Loader2,
  Copy,
  Sparkles,
  Trash2,
  ArrowUpRight,
  Settings,
} from 'lucide-react';

const EXAMPLE_COMMANDS = [
  "Check my email summary for today",
  "Fetch recent emails from last 3 days",
  "Generate a cold email template for web development",
  "Send a cold email to client@example.com",
  "Show me business metrics",
  "Book a call for tomorrow 2pm",
  "Open GitHub",
  "What time is it?",
];

export function Chat() {
  const { messages, loading, error, sendMessage, clearMessages } = useChat();
  const { status } = useStatus();
  const [input, setInput] = useState('');
  const [showExamples, setShowExamples] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const text = input.trim();
    setInput('');
    setShowExamples(false);
    await sendMessage(text);
  };

  const handleExampleClick = (command: string) => {
    setInput(command);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleSpeak = (text: string) => {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    } else {
      speak(text);
      setSpeaking(true);
      setTimeout(() => setSpeaking(false), 5000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  return (
    <>
      <PageHeader
        title="Tiga Chat"
        description="Your AI assistant for email outreach, metrics, scheduling, and more"
        action={
          <div className="flex items-center gap-2">
            <button onClick={clearMessages} className="btn btn-ghost btn-sm" disabled={messages.length === 0}>
              <Trash2 className="size-4" />
              Clear
            </button>
            <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-xs text-[var(--text-muted)]">
              {status?.brain === 'openai' ? (
                <>
                  <Sparkles className="size-3.5 text-[var(--accent-purple)]" />
                  <span>GPT-4o</span>
                </>
              ) : (
                <>
                  <Bot className="size-3.5 text-[var(--accent-blue)]" />
                  <span>Built-in</span>
                </>
              )}
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="flex flex-col h-[calc(100vh-280px)] min-h-[500px]">
            <div className="flex-1 overflow-y-auto p-4 space-y-6" role="log" aria-live="polite">
              {messages.length === 0 && showExamples && (
                <div className="animate-fade-in">
                  <p className="text-[var(--text-muted)] mb-4">Try asking Tiga:</p>
                  <div className="flex flex-wrap gap-2">
                    {EXAMPLE_COMMANDS.map((cmd, i) => (
                      <button
                        key={i}
                        onClick={() => handleExampleClick(cmd)}
                        className="btn btn-ghost btn-sm text-xs whitespace-nowrap hover:bg-[var(--accent-blue)]/10 hover:text-[var(--accent-blue)]"
                      >
                        {cmd}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'flex gap-3 animate-fade-in',
                    msg.role === 'assistant' ? '' : 'flex-row-reverse'
                  )}
                >
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                      msg.role === 'assistant'
                        ? 'bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]'
                        : 'bg-[var(--accent-purple)]/10 text-[var(--accent-purple)]'
                    )}
                    aria-hidden="true"
                  >
                    {msg.role === 'assistant' ? <Bot size={16} /> : <User size={16} />}
                  </div>
                  <div
                    className={cn(
                      'max-w-[70%] lg:max-w-[80%]',
                      msg.role === 'user' ? 'text-right' : ''
                    )}
                  >
                    <div
                      className={cn(
                        'inline-block px-4 py-2 rounded-2xl',
                        msg.role === 'assistant'
                          ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-left'
                          : 'bg-[var(--accent-blue)] text-white text-left'
                      )}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      <div className="flex items-center justify-end gap-1 mt-1 opacity-0 group-hover:opacity-100">
                        <button
                          onClick={() => handleSpeak(msg.content)}
                          className="btn btn-ghost btn-sm p-1 text-xs"
                          aria-label={speaking ? 'Stop speaking' : 'Speak message'}
                        >
                          {speaking ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
                        </button>
                        <button
                          onClick={() => copyToClipboard(msg.content)}
                          className="btn btn-ghost btn-sm p-1 text-xs"
                          aria-label="Copy message"
                        >
                          <Copy className="size-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      {formatRelativeTime(msg.timestamp.toISOString())}
                    </p>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex gap-3 animate-fade-in">
                  <div className="w-8 h-8 rounded-full bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] flex items-center justify-center flex-shrink-0">
                    <Bot size={16} />
                  </div>
                  <div className="bg-[var(--bg-tertiary)] px-4 py-2 rounded-2xl">
                    <div className="flex gap-1">
                      <Loader2 className="size-4 animate-spin text-[var(--accent-blue)]" />
                      <Loader2 className="size-4 animate-spin text-[var(--accent-blue)]" style={{ animationDelay: '100ms' }} />
                      <Loader2 className="size-4 animate-spin text-[var(--accent-blue)]" style={{ animationDelay: '200ms' }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmit} className="p-4 border-t border-[var(--border-color)]">
              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Tiga anything... (Enter to send, Shift+Enter for new line)"
                  className="input flex-1 min-h-[48px] max-h-[150px] resize-none"
                  disabled={loading}
                  rows={1}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="btn btn-primary p-3 self-end"
                  aria-label="Send message"
                >
                  <Send className="size-5" />
                </button>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-2 text-center">
                Powered by {status?.brain === 'openai' ? 'GPT-4o-mini' : 'Built-in Brain'} •{' '}
                {status?.gmail_configured ? 'Gmail Connected' : 'Gmail Not Configured'}
              </p>
            </form>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Quick Actions">
            <div className="space-y-2">
              <button
                onClick={() => handleExampleClick("Check my email summary for today")}
                className="btn btn-secondary w-full justify-start gap-2"
              >
                <Mail className="size-4" />
                Email Summary
              </button>
              <button
                onClick={() => handleExampleClick("Fetch recent emails from last 3 days")}
                className="btn btn-secondary w-full justify-start gap-2"
              >
                <ArrowUpRight className="size-4" />
                Fetch Recent Emails
              </button>
              <button
                onClick={() => handleExampleClick("Generate a cold email template for web development")}
                className="btn btn-secondary w-full justify-start gap-2"
              >
                <Sparkles className="size-4" />
                Generate Template
              </button>
              <button
                onClick={() => handleExampleClick("Show me business metrics")}
                className="btn btn-secondary w-full justify-start gap-2"
              >
                <Settings className="size-4" />
                Business Metrics
              </button>
            </div>
          </Card>

          <Card title="System Status">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-secondary)]">Brain</span>
                <span className={cn('badge', status?.brain === 'openai' ? 'badge-green' : 'badge-amber')}>
                  {status?.brain === 'openai' ? 'GPT-4o-mini' : 'Built-in'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-secondary)]">TTS</span>
                <span className={cn('badge', status?.tts === 'elevenlabs' ? 'badge-green' : 'badge-amber')}>
                  {status?.tts === 'elevenlabs' ? 'ElevenLabs' : 'Browser'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-secondary)]">Gmail</span>
                <span className={cn('badge', status?.gmail_configured ? 'badge-green' : 'badge-red')}>
                  {status?.gmail_configured ? 'Connected' : 'Not Configured'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-secondary)]">Metrics</span>
                <span className={cn('badge', status?.metrics_endpoint ? 'badge-green' : 'badge-amber')}>
                  {status?.metrics_endpoint ? 'Live' : 'Demo'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-secondary)]">Booking</span>
                <span className={cn('badge', status?.booking_webhook ? 'badge-green' : 'badge-amber')}>
                  {status?.booking_webhook ? 'Live' : 'Demo'}
                </span>
              </div>
              <div className="divider" />
              <div className="text-xs text-[var(--text-muted)]">
                v{status?.version || '0.1.0'}
              </div>
            </div>
          </Card>

          {error && (
            <Card title="Error">
              <p className="text-[var(--accent-red)] text-sm">{error}</p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}