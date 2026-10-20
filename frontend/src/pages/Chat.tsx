import { useEffect, useRef, useState } from 'react';
import { useChat, useStatus } from '../hooks/useApi';
import { useSpeech } from '../hooks/useSpeech';
import { PageHeader, Card, Notice, CopyButton } from '../components/ui';
import { cn, formatRelativeTime } from '../lib/utils';
import { Send, Mail, Volume2, VolumeX, Bot, User, Sparkles, Trash2, ArrowUpRight, Settings } from 'lucide-react';

const EXAMPLE_COMMANDS = [
  'Check my email summary for today',
  'Fetch recent emails from last 3 days',
  'Generate a cold email template for web development',
  'Send a cold email to client@example.com saying I build fast websites',
  'Show me business metrics',
  'Book a call about pricing for tomorrow 2pm',
  'Open GitHub',
  'What time is it?',
];

const QUICK_ACTIONS = [
  { label: 'Email Summary', command: EXAMPLE_COMMANDS[0], icon: Mail },
  { label: 'Fetch Recent Emails', command: EXAMPLE_COMMANDS[1], icon: ArrowUpRight },
  { label: 'Generate Template', command: EXAMPLE_COMMANDS[2], icon: Sparkles },
  { label: 'Business Metrics', command: EXAMPLE_COMMANDS[4], icon: Settings },
];

function StatusRow({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[var(--text-secondary)]">{label}</span>
      <span className={cn('badge', good ? 'badge-green' : 'badge-amber')}>{value}</span>
    </div>
  );
}

export function Chat() {
  const { messages, loading, error, sendMessage, clearMessages } = useChat();
  const { status } = useStatus();
  const speech = useSpeech();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const submit = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    const response = await sendMessage(text);
    if (!response) setInput(text);
  };

  const useExample = (command: string) => {
    setInput(command);
    textareaRef.current?.focus();
  };

  const brain = status ? (status.brain === 'openai' ? 'OpenAI-compatible model' : 'Built-in rules') : '…';

  return (
    <>
      <PageHeader
        title="Tiga Chat"
        description="Your assistant for email outreach, metrics, scheduling and more"
        action={
          <div className="flex items-center gap-2">
            <button onClick={clearMessages} className="btn btn-ghost btn-sm" disabled={messages.length === 0}>
              <Trash2 className="size-4" aria-hidden="true" />
              Clear
            </button>
            <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-xs text-[var(--text-secondary)]">
              {status?.brain === 'openai' ? (
                <Sparkles className="size-3.5 text-[var(--accent-purple)]" aria-hidden="true" />
              ) : (
                <Bot className="size-3.5 text-[var(--accent-blue)]" aria-hidden="true" />
              )}
              <span>{brain}</span>
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="flex flex-col h-[calc(100vh-280px)] min-h-[500px]">
            <div className="flex-1 overflow-y-auto p-4 space-y-6" role="log" aria-label="Conversation" aria-live="polite">
              {messages.length === 0 && (
                <div>
                  <p className="text-[var(--text-secondary)] mb-4">Try asking Tiga:</p>
                  <div className="flex flex-wrap gap-2">
                    {EXAMPLE_COMMANDS.map((cmd) => (
                      <button key={cmd} onClick={() => useExample(cmd)} className="btn btn-ghost btn-sm text-xs">
                        {cmd}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id} className={cn('flex gap-3', msg.role === 'user' && 'flex-row-reverse')}>
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                      msg.role === 'assistant'
                        ? 'bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]'
                        : 'bg-[var(--accent-purple)]/10 text-[var(--accent-purple)]',
                    )}
                    aria-hidden="true"
                  >
                    {msg.role === 'assistant' ? <Bot size={16} /> : <User size={16} />}
                  </div>
                  <div className={cn('max-w-[80%]', msg.role === 'user' && 'text-right')}>
                    <div
                      className={cn(
                        'inline-block px-4 py-2 rounded-2xl text-left',
                        msg.role === 'assistant'
                          ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                          : 'bg-[var(--accent-blue)] text-white',
                      )}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    <div className={cn('flex items-center gap-1 mt-1', msg.role === 'user' && 'justify-end')}>
                      <span className="text-xs text-[var(--text-muted)]">{formatRelativeTime(msg.timestamp.toISOString())}</span>
                      {speech.supported && (
                        <button
                          onClick={() => speech.toggle(msg.id, msg.content)}
                          className="btn btn-ghost btn-sm p-1"
                          aria-label={speech.speakingId === msg.id ? 'Stop speaking' : 'Speak message'}
                        >
                          {speech.speakingId === msg.id ? <VolumeX className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />}
                        </button>
                      )}
                      <CopyButton text={msg.content} label="Copy message" iconOnly />
                    </div>
                  </div>
                </div>
              ))}

              {loading && (
                <div role="status" className="flex gap-3 items-center text-sm text-[var(--text-secondary)]">
                  <div className="w-8 h-8 rounded-full bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] flex items-center justify-center" aria-hidden="true">
                    <Bot size={16} />
                  </div>
                  Tiga is thinking…
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="p-4 border-t border-[var(--border-color)] space-y-3"
            >
              {error && <Notice>{error}</Notice>}
              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  aria-label="Message"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  placeholder="Ask Tiga anything… (Enter to send, Shift+Enter for a new line)"
                  className="input flex-1 min-h-[48px] max-h-[150px] resize-none"
                  disabled={loading}
                  rows={1}
                />
                <button type="submit" disabled={!input.trim() || loading} className="btn btn-primary p-3 self-end" aria-label="Send message">
                  <Send className="size-5" aria-hidden="true" />
                </button>
              </div>
            </form>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Quick Actions">
            <div className="space-y-2">
              {QUICK_ACTIONS.map(({ label, command, icon: Icon }) => (
                <button key={label} onClick={() => useExample(command)} className="btn btn-secondary w-full justify-start gap-2">
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </Card>

          <Card title="System Status">
            <div className="space-y-3">
              <StatusRow label="Brain" value={brain} good={status?.brain === 'openai'} />
              <StatusRow label="Speech" value={status?.tts === 'elevenlabs' ? 'ElevenLabs' : 'Browser voice'} good={status?.tts === 'elevenlabs'} />
              <StatusRow label="Gmail" value={status?.gmail_configured ? 'Credentials found' : 'Not set up'} good={status?.gmail_configured} />
              <StatusRow label="Metrics" value={status?.metrics_endpoint ? 'Live' : 'Demo'} good={status?.metrics_endpoint} />
              <StatusRow label="Booking" value={status?.booking_webhook ? 'Live' : 'Demo'} good={status?.booking_webhook} />
              <div className="divider" />
              <div className="text-xs text-[var(--text-muted)]">v{status?.version ?? '…'}</div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
