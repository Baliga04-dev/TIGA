import { useEffect, useState } from 'react';
import { Download, Key, Loader2, Mail } from 'lucide-react';
import { useStatus } from '../hooks/useApi';
import { useAction } from '../hooks/useAction';
import { PageHeader, Card, Notice, CopyButton, StatusRow } from '../components/ui';
import { api } from '../services/api';
import { cn, downloadAsFile } from '../lib/utils';

export function Settings() {
  const { status } = useStatus();
  const [envTemplate, setEnvTemplate] = useState('');
  const [envError, setEnvError] = useState<string | null>(null);
  const credentialsFound = status?.gmail_configured ?? false;

  useEffect(() => {
    let cancelled = false;
    api
      .getEnvExample()
      .then((text) => !cancelled && setEnvTemplate(text))
      .catch((e: Error) => !cancelled && setEnvError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const test = useAction(() => api.getEmailSummary(1));

  return (
    <>
      <PageHeader title="Settings" description="Connect Gmail and see which integrations are active" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Gmail">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-wash rounded-lg">
              <div className="flex items-center gap-3">
                <Mail className="size-5 text-pen" aria-hidden="true" />
                <div>
                  <p className="font-medium">Gmail API</p>
                  <p className="text-sm text-ink-3">Send, read and analyze email</p>
                </div>
              </div>
              {status && (
                <span className={cn('badge', credentialsFound ? 'badge-amber' : 'badge-red')}>
                  {credentialsFound ? 'Credentials found' : 'Credentials file missing'}
                </span>
              )}
            </div>

            <ol className="space-y-2 text-sm text-ink-2 list-decimal list-inside">
              <li>
                Create an OAuth client (Desktop app) in the{' '}
                <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="underline">
                  Google Cloud Console
                </a>{' '}
                with the Gmail API enabled.
              </li>
              <li>Download it as <code>credentials.json</code> into the <code>tiga</code> folder.</li>
              <li>
                Authorize once: run <code>python gmail_auth.py</code> in the <code>tiga</code> folder and approve access in the browser.
              </li>
              <li>Press Test connection below.</li>
            </ol>

            <div className="flex items-center gap-3">
              <button onClick={() => test.run()} disabled={test.pending || !credentialsFound} className="btn btn-primary">
                {test.pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Key className="size-4" aria-hidden="true" />}
                {test.pending ? 'Testing…' : 'Test connection'}
              </button>
              {status && !credentialsFound && <span className="text-sm text-ink-3">Add credentials.json first.</span>}
            </div>

            {test.error && <Notice>{test.error}</Notice>}
            {test.result && (
              <Notice tone="info">{`Connected. Read ${test.result.total_emails} emails from the last 24 hours.`}</Notice>
            )}
          </div>
        </Card>

        <Card title="Integrations">
          <div className="space-y-2 text-sm">
            {status ? (
              <>
                <StatusRow label="Brain" value={status.brain === 'claude' ? 'Claude (your subscription)' : status.brain === 'openai' ? 'OpenAI-compatible model' : 'Built-in rules'} good={status.brain !== 'builtin'} />
                <StatusRow label="Speech" value={status.tts === 'elevenlabs' ? 'ElevenLabs' : 'Browser voice'} good={status.tts === 'elevenlabs'} />
                <StatusRow label="Metrics" value={status.metrics_endpoint ? 'Live endpoint' : 'Demo data'} good={status.metrics_endpoint} />
                <StatusRow label="Booking" value={status.booking_webhook ? 'Live webhook' : 'Demo mode'} good={status.booking_webhook} />
                <div className="flex justify-between items-center">
                  <span className="text-ink-2">Repository</span>
                  <span className="font-mono">{status.github_repository || 'not set'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-ink-2">Version</span>
                  <span className="font-mono">{status.version}</span>
                </div>
              </>
            ) : (
              <p className="text-ink-3">Loading integration status…</p>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <Card
          title="Environment template"
          action={
            <div className="flex gap-2">
              <CopyButton text={envTemplate} label="Copy .env.example" />
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => downloadAsFile(envTemplate, '.env.example')}
                disabled={!envTemplate}
              >
                <Download className="size-4" aria-hidden="true" />
                Download
              </button>
            </div>
          }
        >
          <p className="text-sm text-ink-2 mb-3">
            Copy this to <code>tiga/.env</code> and fill in the keys you use. Secret values are never shown here.
          </p>
          {envError ? (
            <Notice title="Couldn't load .env.example">{envError}</Notice>
          ) : (
            <pre aria-label="Environment template" tabIndex={0} className="max-h-80 overflow-auto rounded-lg bg-wash p-4 text-xs">
              {envTemplate || 'Loading…'}
            </pre>
          )}
        </Card>
      </div>
    </>
  );
}
