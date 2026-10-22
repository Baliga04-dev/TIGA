import { useEffect, useRef, useState } from 'react';
import { useChat, useStatus } from '../hooks/useApi';
import { useSpeech } from '../hooks/useSpeech';
import { PageHeader, Card, Notice, CopyButton, StatusRow } from '../components/ui';
import { cn, formatRelativeTime } from '../lib/utils';
import { Send, Mail, Volume2, VolumeX, Bot, User, Sparkles, Trash2, ArrowUpRight, Settings, Pause, Play, Mic, MicOff } from 'lucide-react';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { ActionCards } from '../components/ActionCards';
import { api } from '../services/api';

const EXAMPLE_COMMANDS = [
  'Check my email summary for today',
  'Fetch recent emails from last 3 days',
  'Generate a cold email template for web development',
  'Draft an email to client@example.com saying I build fast websites',
  'Show me business metrics',
  'Book a call about pricing for tomorrow 2pm',
  'Open YouTube and play lo-fi music',
  'What time is it?',
  'Look at my screen and tell me what needs attention',
  'Every Monday at 9am, who is waiting on me',
];

const QUICK_ACTIONS = [
  { label: 'Email Summary', command: EXAMPLE_COMMANDS[0], icon: Mail },
  { label: 'Fetch Recent Emails', command: EXAMPLE_COMMANDS[1], icon: ArrowUpRight },
  { label: 'Generate Template', command: EXAMPLE_COMMANDS[2], icon: Sparkles },
  { label: 'Business Metrics', command: EXAMPLE_COMMANDS[4], icon: Settings },
];

export function Chat() {
  const { messages, loading, error, sendMessage, clearMessages } = useChat();
  const { status } = useStatus();
  const speech = useSpeech();
  const [input, setInput] = useState('');
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    api.getAssistant().then((a) => setPaused(a.paused)).catch(() => undefined);
  }, []);

  const togglePause = async () => {
    try {
      setPaused((await api.setAssistantPaused(!paused)).paused);
    } catch {
      // the status line keeps showing the last known state
    }
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const [speakReplies, setSpeakReplies] = useState(false);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || loading) return;
    setInput('');
    const response = await sendMessage(text);
    if (!response) setInput(text);
    else if (speakReplies && 'speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(response.reply));
  };
  const submit = () => send(input);
  const voice = useVoiceInput((text) => send(text));

  const fillExample = (command: string) => {
    setInput(command);
    textareaRef.current?.focus();
  };

  const brain = status ? (status.brain === 'claude' ? 'Claude (your subscription)' : status.brain === 'openai' ? 'OpenAI-compatible model' : 'Built-in rules') : '…';

  return (
    <>
      <PageHeader
        title="Tiga Chat"
        description="Your assistant for email outreach, metrics, scheduling and more"
        action={
          <div className="flex items-center gap-2">
            <button onClick={togglePause} className={cn('btn btn-sm', paused ? 'btn-primary' : 'btn-secondary')} aria-pressed={paused}>
              {paused ? <Play className="size-4" aria-hidden="true" /> : <Pause className="size-4" aria-hidden="true" />}
              {paused ? 'Resume Tiga' : 'Pause Tiga'}
            </button>
            <button onClick={clearMessages} className="btn btn-ghost btn-sm" disabled={messages.length === 0}>
              <Trash2 className="size-4" aria-hidden="true" />
              Clear
            </button>
            <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-wash text-xs text-ink-2">
              {status && status.brain !== 'builtin' ? (
                <Sparkles className="size-3.5 text-pen" aria-hidden="true" />
              ) : (
                <Bot className="size-3.5 text-pen" aria-hidden="true" />
              )}
              <span>{brain}</span>
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <section aria-label="Chat" className="flex h-[calc(100vh-280px)] min-h-[500px] flex-col rounded-lg border border-rule bg-sheet shadow-sm">
            <div className="flex-1 overflow-y-auto p-4 space-y-6" role="log" aria-label="Conversation" aria-live="polite">
              {messages.length === 0 && (
                <div>
                  <p className="text-ink-2 mb-4">Try asking Tiga:</p>
                  <div className="flex flex-wrap gap-2">
                    {EXAMPLE_COMMANDS.map((cmd) => (
                      <button key={cmd} onClick={() => fillExample(cmd)} className="btn btn-ghost btn-sm text-xs">
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
                        ? 'bg-pen/10 text-pen'
                        : 'bg-pen/10 text-pen',
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
                          ? 'border border-rule bg-sheet text-[0.975rem] leading-relaxed text-ink'
                          : 'bg-pen text-on-accent',
                      )}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    {msg.actions && <ActionCards actions={msg.actions} />}
                    <div className={cn('flex items-center gap-1 mt-1', msg.role === 'user' && 'justify-end')}>
                      <span className="text-xs text-ink-3">{formatRelativeTime(msg.timestamp.toISOString())}</span>
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
                <div role="status" className="flex gap-3 items-center text-sm text-ink-2">
                  <div className="w-8 h-8 rounded-full bg-pen/10 text-pen flex items-center justify-center" aria-hidden="true">
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
              className="p-4 border-t border-rule space-y-3"
            >
              {error && <Notice>{error}</Notice>}
              {voice.error && <Notice>{voice.error}</Notice>}
              {voice.listening && <p role="status" className="text-sm text-ink-2">Listening… {voice.heard}</p>}
              <div className="flex items-end gap-2">
                {voice.supported && (
                  <button type="button" onClick={voice.listening ? voice.stop : voice.start} disabled={loading}
                    className={cn('btn p-3 self-end', voice.listening ? 'btn-danger' : 'btn-secondary')}
                    aria-label={voice.listening ? 'Stop listening' : 'Speak to Tiga'} aria-pressed={voice.listening}>
                    {voice.listening ? <MicOff className="size-5" aria-hidden="true" /> : <Mic className="size-5" aria-hidden="true" />}
                  </button>
                )}
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
              <label className="flex items-center gap-2 text-xs text-ink-2">
                <input type="checkbox" checked={speakReplies} onChange={(e) => setSpeakReplies(e.target.checked)} />
                Read Tiga's replies aloud
              </label>
              {voice.supported && (
                <p className="text-xs text-ink-3">The mic uses your browser's online speech service. Saying "yes" never confirms an action; only the Confirm button does.</p>
              )}
            </form>
          </section>
        </div>

        <div className="space-y-8">
          <Card title="Quick actions">
            <div className="space-y-2">
              {QUICK_ACTIONS.map(({ label, command, icon: Icon }) => (
                <button key={label} onClick={() => fillExample(command)} className="btn btn-secondary w-full justify-start gap-2">
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </Card>

          <Card title="System status">
            <div className="space-y-3">
              <StatusRow label="Brain" value={brain} good={!!status && status.brain !== 'builtin'} />
              <StatusRow label="Speech" value={status?.tts === 'elevenlabs' ? 'ElevenLabs' : 'Browser voice'} good={status?.tts === 'elevenlabs'} />
              <StatusRow label="Gmail" value={status?.gmail_configured ? 'Credentials found' : 'Not set up'} good={status?.gmail_configured} />
              <StatusRow label="Metrics" value={status?.metrics_endpoint ? 'Live' : 'Demo'} good={status?.metrics_endpoint} />
              <StatusRow label="Booking" value={status?.booking_webhook ? 'Live' : 'Demo'} good={status?.booking_webhook} />
              <div className="divider" />
              <div className="text-xs text-ink-3">v{status?.version ?? '…'}</div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
