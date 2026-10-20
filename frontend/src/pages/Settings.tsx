import { useState, useEffect } from 'react';
import { useStatus } from '../hooks/useApi';
import { PageHeader, Card } from '../components/ui';
import { cn, copyToClipboard } from '../lib/utils';
import {
  Mail,
  Key,
  AlertCircle,
  Loader2,
  Copy,
  Terminal,
  CheckCircle,
} from 'lucide-react';

export function Settings() {
  const { status } = useStatus();
  const [gmailConfigured, setGmailConfigured] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [envContent, setEnvContent] = useState('');

  useEffect(() => {
    checkGmailConfig();
    loadEnvExample();
  }, []);

  const checkGmailConfig = async () => {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      setGmailConfigured(data.gmail_configured);
    } catch {
      setGmailConfigured(false);
    }
  };

  const loadEnvExample = async () => {
    try {
      const res = await fetch('/.env.example');
      if (res.ok) {
        const text = await res.text();
        setEnvContent(text);
      }
    } catch {
      setEnvContent('# Could not load .env.example');
    }
  };

  const testGmailConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/email/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 1 }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestResult({ success: true, message: `Connected! Fetched ${data.total_emails} emails from last 24h.` });
      } else {
        setTestResult({ success: false, message: data.error || 'Connection failed' });
      }
    } catch (e) {
      setTestResult({ success: false, message: e instanceof Error ? e.message : 'Connection failed' });
    } finally {
      setTesting(false);
    }
  };

  const copyEnvExample = async () => {
    await copyToClipboard(envContent);
    alert('Copied to clipboard! Create a .env file in the backend directory with these values.');
  };

  const downloadEnvExample = () => {
    const blob = new Blob([envContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '.env.example';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Settings"
        description="Configure Tiga integrations and API keys"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Gmail API Configuration">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-[var(--bg-tertiary)] rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent-blue)]/10 flex items-center justify-center">
                  <Mail className="size-5 text-[var(--accent-blue)]" />
                </div>
                <div>
                  <p className="font-medium">Gmail API</p>
                  <p className="text-sm text-[var(--text-muted)]">Send, read, and analyze emails</p>
                </div>
              </div>
              <span className={cn('badge', gmailConfigured ? 'badge-green' : 'badge-red')}>
                {gmailConfigured ? 'Connected' : 'Not Configured'}
              </span>
            </div>

            {!gmailConfigured && (
              <div className="space-y-3 p-4 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-color)]">
                <h4 className="font-medium">Setup Required</h4>
                <ol className="space-y-2 text-sm text-[var(--text-secondary)] list-decimal list-inside">
                  <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-blue)] hover:underline">Google Cloud Console</a></li>
                  <li>Create a project or select existing</li>
                  <li>Enable Gmail API</li>
                  <li>Create OAuth 2.0 credentials (Desktop app)</li>
                  <li>Download <code>credentials.json</code> to the backend directory</li>
                  <li>Add to <code>.env</code>: <code>GMAIL_CREDENTIALS_FILE=credentials.json</code></li>
                  <li>Restart the backend server</li>
                </ol>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={testGmailConnection}
                disabled={testing || !gmailConfigured}
                className="btn btn-primary flex-1"
              >
                {testing ? <Loader2 className="size-4 animate-spin" /> : <Key className="size-4" />}
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
              <button onClick={copyEnvExample} className="btn btn-secondary">
                <Copy className="size-4" />
                Copy .env.example
              </button>
              <button onClick={downloadEnvExample} className="btn btn-secondary">
                <Terminal className="size-4" />
                Download
              </button>
            </div>

            {testResult && (
              <div className={cn(
                'p-3 rounded-lg text-sm flex items-center gap-2',
                testResult.success
                  ? 'bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/20'
                  : 'bg-[var(--accent-red)]/10 text-[var(--accent-red)] border border-[var(--accent-red)]/20'
              )}>
                {testResult.success ? <CheckCircle className="size-4" /> : <AlertCircle className="size-4" />}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>
        </Card>

        <Card title="Environment Variables">
          <div className="space-y-4">
            <div className="p-4 bg-[var(--bg-tertiary)] rounded-lg">
              <h4 className="font-medium mb-3">Required Variables</h4>
              <dl className="space-y-3 text-sm">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <dt className="text-[var(--text-secondary)]">GMAIL_CREDENTIALS_FILE</dt>
                  <dd className="font-mono text-[var(--text-primary)] bg-[var(--bg-secondary)] px-2 py-1 rounded">credentials.json</dd>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <dt className="text-[var(--text-secondary)]">GMAIL_TOKEN_FILE</dt>
                  <dd className="font-mono text-[var(--text-primary)] bg-[var(--bg-secondary)] px-2 py-1 rounded">token.json</dd>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <dt className="text-[var(--text-secondary)]">GMAIL_USER_EMAIL</dt>
                  <dd className="font-mono text-[var(--text-primary)] bg-[var(--bg-secondary)] px-2 py-1 rounded">ymitigaa@gmail.com</dd>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <dt className="text-[var(--text-secondary)]">OPENAI_API_KEY</dt>
                  <dd className="font-mono text-[var(--text-primary)] bg-[var(--bg-secondary)] px-2 py-1 rounded">(optional)</dd>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <dt className="text-[var(--text-secondary)]">ELEVENLABS_API_KEY</dt>
                  <dd className="font-mono text-[var(--text-primary)] bg-[var(--bg-secondary)] px-2 py-1 rounded">(optional)</dd>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <dt className="text-[var(--text-secondary)]">METRICS_ENDPOINT</dt>
                  <dd className="font-mono text-[var(--text-primary)] bg-[var(--bg-secondary)] px-2 py-1 rounded">(optional)</dd>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <dt className="text-[var(--text-secondary)]">BOOKING_WEBHOOK</dt>
                  <dd className="font-mono text-[var(--text-primary)] bg-[var(--bg-secondary)] px-2 py-1 rounded">(optional)</dd>
                </div>
              </dl>
            </div>

            <div className="p-4 bg-[var(--bg-tertiary)] rounded-lg">
              <h4 className="font-medium mb-3">Current Status</h4>
              <dl className="space-y-2 text-sm">
                {status && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Brain</span>
                      <span className={cn('badge', status.brain === 'openai' ? 'badge-green' : 'badge-amber')}>
                        {status.brain === 'openai' ? 'OpenAI (GPT-4o-mini)' : 'Built-in Demo'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">TTS</span>
                      <span className={cn('badge', status.tts === 'elevenlabs' ? 'badge-green' : 'badge-amber')}>
                        {status.tts === 'elevenlabs' ? 'ElevenLabs' : 'Browser SpeechSynthesis'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Gmail</span>
                      <span className={cn('badge', status.gmail_configured ? 'badge-green' : 'badge-red')}>
                        {status.gmail_configured ? 'Configured' : 'Not Configured'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Metrics</span>
                      <span className={cn('badge', status.metrics_endpoint ? 'badge-green' : 'badge-amber')}>
                        {status.metrics_endpoint ? 'Live Endpoint' : 'Demo Data'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Booking</span>
                      <span className={cn('badge', status.booking_webhook ? 'badge-green' : 'badge-amber')}>
                        {status.booking_webhook ? 'Live Webhook' : 'Demo Mode'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Version</span>
                      <span className="font-mono">{status.version}</span>
                    </div>
                  </>
                )}
              </dl>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Card title="Gmail OAuth Setup Guide">
          <div className="space-y-4 text-sm text-[var(--text-secondary)]">
            <h4 className="font-medium text-[var(--text-primary)]">Step-by-step</h4>
            <ol className="space-y-3 list-decimal list-inside">
              <li>
                <strong>Create Google Cloud Project</strong>
                <br />Visit <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-blue)]">console.cloud.google.com</a>
              </li>
              <li>
                <strong>Enable Gmail API</strong>
                <br />APIs & Services → Library → Search "Gmail API" → Enable
              </li>
              <li>
                <strong>Configure OAuth Consent Screen</strong>
                <br />APIs & Services → OAuth consent screen → External → Fill required fields
              </li>
              <li>
                <strong>Create Credentials</strong>
                <br />APIs & Services → Credentials → Create Credentials → OAuth client ID → Desktop app
              </li>
              <li>
                <strong>Download & Place</strong>
                <br />Download JSON → Rename to <code>credentials.json</code> → Place in the backend folder
              </li>
              <li>
                <strong>First Run</strong>
                <br />Start backend → Browser opens for OAuth → Authorize → Token saved to <code>token.json</code>
              </li>
            </ol>
          </div>
        </Card>

        <Card title="Freelancing Email Templates">
          <div className="space-y-3 text-sm text-[var(--text-secondary)]">
            <p>The email bot includes built-in templates for:</p>
            <ul className="space-y-2 list-disc list-inside">
              <li><strong>Web Development</strong> - React, Next.js, Vue, custom websites</li>
              <li><strong>Software Development</strong> - Custom apps, APIs, automation, backends</li>
              <li><strong>General Freelance</strong> - Adaptable for any service</li>
            </ul>
            <p className="pt-2">Generate templates via:</p>
            <ul className="space-y-1 list-disc list-inside ml-4">
              <li>Email Bot page → "New Template" button</li>
              <li>Tiga chat: <code className="font-mono bg-[var(--bg-tertiary)] px-1 py-0.5 rounded">"Generate a cold email template for web development"</code></li>
              <li>API: <code>POST /api/email/template</code></li>
            </ul>
          </div>
        </Card>
      </div>
    </>
  );
}