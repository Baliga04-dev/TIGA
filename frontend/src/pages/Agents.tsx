import { useEffect, useState } from 'react';
import { Bot, Clipboard, ExternalLink, Loader2, Play, Search, Send } from 'lucide-react';
import { Layout, PageHeader, Card } from '../components/Layout';
import { api } from '../services/api';
import type { AgentRunResponse, AgentStatusResponse, PromptGenerateResponse } from '../types';

export function Agents() {
  const [status, setStatus] = useState<AgentStatusResponse | null>(null);
  const [run, setRun] = useState<AgentRunResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [topic, setTopic] = useState('software projects needing automation');
  const [idea, setIdea] = useState('');
  const [outcome, setOutcome] = useState('');
  const [prompt, setPrompt] = useState<PromptGenerateResponse | null>(null);
  const [syncMessage, setSyncMessage] = useState('');

  const refresh = async () => setStatus(await api.getAgentStatus());
  useEffect(() => { refresh().catch(() => setStatus(null)); }, []);

  const runCycle = async () => {
    setBusy(true);
    try { setRun(await api.runAgents()); await refresh(); } finally { setBusy(false); }
  };

  const research = async () => {
    setBusy(true);
    try {
      const result = await fetch('/api/research/leads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, limit: 10 }),
      });
      const data = await result.json();
      setPrompt({ ok: data.ok, research: data });
    } finally { setBusy(false); }
  };

  const generate = async () => {
    setBusy(true);
    try {
      setPrompt(await api.generatePrompt({
        idea, outcome, audience: '', stack: '', constraints: '', research_topic: topic,
      }));
    } finally { setBusy(false); }
  };

  const syncGithub = async () => {
    setBusy(true);
    try {
      const result = await api.syncGithub();
      setSyncMessage(result.ok ? `Pushed to ${result.repository}/${result.branch}.` : result.error || 'GitHub sync failed.');
      await refresh();
    } finally { setBusy(false); }
  };

  return (
    <Layout>
      <PageHeader title="Tiga Agents" description="Manager, dev, and tester with observable research and reporting actions" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {status?.agents.map(agent => (
          <Card key={agent.name} title={agent.name.toUpperCase()}>
            <div className="flex items-start gap-3">
              <Bot className="size-5 text-[var(--accent-blue)]" />
              <div><p className="text-sm">{agent.role}</p><span className="badge badge-green mt-2">{agent.status}</span></div>
            </div>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Agent cycle">
          <p className="text-sm text-[var(--text-secondary)] mb-4">Manager triages, dev reports implementation readiness, and tester runs the backend check.</p>
          <button className="btn btn-primary" onClick={runCycle} disabled={busy}><Play className="size-4" /> Run cycle</button>
          {run && <pre className="mt-4 max-h-64 overflow-auto text-xs whitespace-pre-wrap">{JSON.stringify(run, null, 2)}</pre>}
          <button className="btn btn-secondary mt-3" onClick={syncGithub} disabled={busy}><Send className="size-4" /> Push to GitHub</button>
          {syncMessage && <p className="text-xs text-[var(--text-secondary)] mt-2">{syncMessage}</p>}
        </Card>
        <Card title="Public lead research">
          <input className="input mb-3" value={topic} onChange={e => setTopic(e.target.value)} placeholder="What client signal should Tiga research?" />
          <button className="btn btn-secondary" onClick={research} disabled={busy}><Search className="size-4" /> Find signals</button>
        </Card>
        <Card title="Prompt generator">
          <div className="space-y-3">
            <textarea className="input min-h-24" value={idea} onChange={e => setIdea(e.target.value)} placeholder="Simple idea: what do you want to build?" />
            <textarea className="input min-h-20" value={outcome} onChange={e => setOutcome(e.target.value)} placeholder="How should it work and what outcome matters?" />
            <button className="btn btn-primary" onClick={generate} disabled={busy || !idea.trim() || !outcome.trim()}><Send className="size-4" /> Research and generate</button>
          </div>
        </Card>
        <Card title="Research / generated prompt">
          {busy && <Loader2 className="size-5 animate-spin" />}
          {prompt?.prompt && <div><button className="btn btn-ghost btn-sm mb-2" onClick={() => navigator.clipboard.writeText(prompt.prompt || '')}><Clipboard className="size-4" /> Copy prompt</button><pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs">{prompt.prompt}</pre></div>}
          {prompt?.research?.leads?.map(lead => <a className="block text-sm mb-2" key={lead.url} href={lead.url} target="_blank" rel="noreferrer"><ExternalLink className="inline size-3 mr-1" />{lead.title}</a>)}
          {!prompt && <p className="text-sm text-[var(--text-muted)]">Results will appear here.</p>}
        </Card>
      </div>
    </Layout>
  );
}
