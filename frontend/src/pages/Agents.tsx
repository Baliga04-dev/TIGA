import { useCallback, useEffect, useState } from 'react';
import { Bot, CheckCircle2, ExternalLink, Loader2, Play, Search, Send, XCircle } from 'lucide-react';
import { PageHeader, Card, Notice, Field, CopyButton } from '../components/ui';
import { api } from '../services/api';
import { useAction } from '../hooks/useAction';
import { cn } from '../lib/utils';
import type { AgentRunResponse, AgentStatusResponse } from '../types';

function CycleReport({ report }: { report: AgentRunResponse }) {
  const passed = report.tester.ok;
  return (
    <section aria-label="Cycle report" className="mt-4 space-y-3 text-sm">
      <p className="flex items-center gap-2">
        {passed ? <CheckCircle2 className="size-4 text-[var(--accent-green)]" aria-hidden="true" /> : <XCircle className="size-4 text-[var(--accent-red)]" aria-hidden="true" />}
        <span data-status className="font-medium">{passed ? 'Passed' : 'Failed'}</span>
        <span className="text-[var(--text-muted)]">{new Date(report.run_at).toLocaleString()}</span>
      </p>
      <ul className="space-y-1">
        {report.tester.checks.map((check) => (
          <li key={check.name} className="flex items-baseline gap-2">
            <span className={cn('font-mono', check.ok ? 'text-[var(--text-primary)]' : 'text-[var(--accent-red)]')}>{check.name}</span>
            <span className="text-[var(--text-secondary)]">{check.detail}</span>
          </li>
        ))}
      </ul>
      {report.manager.next_actions.length > 0 && (
        <div>
          <p className="font-medium">Next actions</p>
          <ul className="list-disc pl-5 text-[var(--text-secondary)]">
            {report.manager.next_actions.map((action) => <li key={action}>{action}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

function uncommittedCount(workingTree: string) {
  return workingTree === 'clean' || workingTree === 'unknown' ? 0 : workingTree.split('\n').filter(Boolean).length;
}

export function Agents() {
  const [status, setStatus] = useState<AgentStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [topic, setTopic] = useState('software projects needing automation');
  const [idea, setIdea] = useState('');
  const [outcome, setOutcome] = useState('');

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.getAgentStatus());
      setStatusError(null);
    } catch (e) {
      setStatus(null);
      setStatusError(e instanceof Error ? e.message : 'Failed to load agent status');
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const cycle = useAction(async () => {
    const report = await api.runAgents();
    await refresh();
    return report;
  });
  const research = useAction(() => api.researchLeads(topic, 10));
  const generate = useAction(() =>
    api.generatePrompt({ idea, outcome, audience: '', stack: '', constraints: '', research_topic: topic }),
  );
  const sync = useAction(async () => {
    const result = await api.syncGithub();
    await refresh();
    return result;
  });

  const leads = research.result?.leads ?? generate.result?.research.leads ?? [];
  const feedErrors = research.result?.errors ?? generate.result?.research.errors ?? [];
  const researched = research.result !== null;
  const dirty = status ? uncommittedCount(status.github.working_tree) : 0;

  return (
    <>
      <PageHeader title="Tiga Agents" description="Manager, dev, and tester with observable research and reporting actions" />

      {statusError && <div className="mb-6"><Notice title="Couldn't load agent status">{statusError}</Notice></div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {status?.agents.map((agent) => (
          <Card key={agent.name}>
            <div className="flex items-start gap-3">
              <Bot className="size-5 text-[var(--accent-blue)]" aria-hidden="true" />
              <div>
                <h2 className="font-semibold capitalize">{agent.name}</h2>
                <p className="text-sm text-[var(--text-secondary)]">{agent.role}</p>
                <span className="badge badge-green mt-2">{agent.status}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Agent cycle">
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Manager triages, dev reports readiness, and tester runs the backend checks and test suite.
          </p>
          <button className="btn btn-primary" onClick={() => cycle.run()} disabled={cycle.pending}>
            {cycle.pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
            Run cycle
          </button>
          {cycle.error && <div className="mt-3"><Notice>{cycle.error}</Notice></div>}
          {cycle.result && <CycleReport report={cycle.result} />}

          <div className="divider" />
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            Pushes commits you have already made to {status?.github.repository || 'GitHub'} ({status?.github.branch ?? 'main'}).
            It never commits for you.{' '}
            <span>{dirty === 0 ? 'Working tree clean.' : `${dirty} uncommitted change${dirty === 1 ? '' : 's'}.`}</span>
          </p>
          <button className="btn btn-secondary" onClick={() => sync.run()} disabled={sync.pending}>
            {sync.pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
            Push to GitHub
          </button>
          {sync.error && <div className="mt-3"><Notice>{sync.error}</Notice></div>}
          {sync.result && (
            <div className="mt-3">
              <Notice tone="info">
                {sync.result.pushed
                  ? `Pushed ${sync.result.commits} commit${sync.result.commits === 1 ? '' : 's'} to ${sync.result.repository} (${sync.result.branch})`
                  : sync.result.detail || 'Nothing to push'}
              </Notice>
            </div>
          )}
        </Card>

        <Card title="Public lead research">
          <Field label="Research topic" className="mb-3">
            {(id) => (
              <input id={id} className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What client signal should Tiga research?" />
            )}
          </Field>
          <button className="btn btn-secondary" onClick={() => research.run()} disabled={research.pending || topic.trim().length < 2}>
            {research.pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Search className="size-4" aria-hidden="true" />}
            Find signals
          </button>
          {research.error && <div className="mt-3"><Notice>{research.error}</Notice></div>}
        </Card>

        <Card title="Prompt generator">
          <div className="space-y-3">
            <Field label="Idea">
              {(id) => (
                <textarea id={id} className="input min-h-24" value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="What do you want to build?" />
              )}
            </Field>
            <Field label="Desired outcome">
              {(id) => (
                <textarea id={id} className="input min-h-20" value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="How should it work and what outcome matters?" />
              )}
            </Field>
            <button
              className="btn btn-primary"
              onClick={() => generate.run()}
              disabled={generate.pending || idea.trim().length < 3 || outcome.trim().length < 3}
            >
              {generate.pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
              Research and generate
            </button>
            {generate.error && <Notice>{generate.error}</Notice>}
          </div>
        </Card>

        <Card title="Research results and generated prompt">
          {generate.result && (
            <div className="mb-4">
              <CopyButton text={generate.result.prompt} label="Copy prompt" />
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-xs">{generate.result.prompt}</pre>
              <p className="mt-3 text-sm font-medium">Questions to answer first</p>
              <ul className="list-disc pl-5 text-sm text-[var(--text-secondary)]">
                {generate.result.questions.map((q) => <li key={q}>{q}</li>)}
              </ul>
            </div>
          )}
          {feedErrors.length > 0 && (
            <div className="mb-3"><Notice tone="info" title="Some feeds failed">{feedErrors.join('; ')}</Notice></div>
          )}
          {leads.length > 0 && (
            <ul className="space-y-2">
              {leads.map((lead) => (
                <li key={`${lead.source}-${lead.url}`} className="text-sm">
                  <a className="inline-flex items-center gap-1 underline" href={lead.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-3" aria-hidden="true" />
                    {lead.title}
                  </a>
                  <p className="text-xs text-[var(--text-muted)]">{lead.source} · <span>{lead.client_signal}</span></p>
                </li>
              ))}
            </ul>
          )}
          {researched && leads.length === 0 && <p className="text-sm text-[var(--text-muted)]">No public signals found for that topic.</p>}
          {!generate.result && !researched && <p className="text-sm text-[var(--text-muted)]">Results will appear here.</p>}
        </Card>
      </div>
    </>
  );
}
