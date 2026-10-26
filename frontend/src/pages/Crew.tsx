import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, Notice, Field, Toast } from '../components/ui';
import { useAction } from '../hooks/useAction';
import { api } from '../services/api';
import { cn } from '../lib/utils';
import type { AuditEntry, DevStatus, Issue, RndStatus } from '../types';

/** What the user may do next from each state; everything else is done by the bots. */
/** Text with its web links clickable (the R&D bot lists its sources as plain URLs). */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"')]+)/g);
  return (
    <p className="mt-1 whitespace-pre-line break-words text-ink-2">
      {parts.map((part, i) => (/^https?:\/\//.test(part)
        ? <a key={i} className="text-pen underline" href={part} target="_blank" rel="noreferrer">{part.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}</a>
        : <span key={i}>{part}</span>))}
    </p>
  );
}

const YOUR_MOVES: Record<string, { label: string; to: string }[]> = {
  open: [{ label: 'Triage', to: 'triaged' }, { label: 'Reject', to: 'rejected' }],
  triaged: [{ label: 'Approve for Dev', to: 'approved' }, { label: 'Reject', to: 'rejected' }],
  approved: [{ label: 'Reject', to: 'rejected' }],
  pr_open: [{ label: 'Mark tested', to: 'tested' }, { label: 'Reject', to: 'rejected' }],
  tested: [{ label: 'Mark done', to: 'done' }],
};

export function Crew() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [skillNames, setSkillNames] = useState<string[]>([]);
  const [skill, setSkill] = useState('');
  const [skillText, setSkillText] = useState('');
  const [savedText, setSavedText] = useState('');
  const [dev, setDev] = useState<DevStatus | null>(null);
  const [research, setResearch] = useState<RndStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [i, a] = await Promise.all([api.listIssues(), api.getAudit()]);
      setIssues(i.items);
      setAudit(a.items.slice(-15).reverse());
      setError(null);
      api.devStatus().then(setDev).catch(() => setDev(null));
      api.rndStatus().then(setResearch).catch(() => setResearch(null));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load the issue board');
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  // while the Dev bot works on something, check back until it hands the issue on
  const devWorking = dev?.busy || issues.some((i) => i.status === 'in_progress');
  useEffect(() => {
    if (!devWorking) return;
    const t = window.setInterval(refresh, 5000);
    return () => window.clearInterval(t);
  }, [devWorking, refresh]);
  useEffect(() => {
    api.listSkills().then((r) => setSkillNames(r.items)).catch(() => setSkillNames([]));
  }, []);

  const pick = async (name: string) => {
    setSkill(name);
    if (!name) return;
    try {
      const { text } = await api.readSkill(name);
      setSkillText(text);
      setSavedText(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load that skill");
    }
  };
  const save = useAction(async () => {
    await api.saveSkill(skill, skillText);
    setSavedText(skillText);
    setToast(`Saved the ${skill} skill. The bot uses it from its next run.`);
    await refresh();
  });
  const rnd = useAction(async () => {
    const out = await api.runRnd();
    await refresh();
    setToast(out.research_error
      ? `Filed ${out.proposals} proposals from the numbers only: ${out.research_error}.`
      : `Research filed ${out.proposals} proposals (${out.researched} from the web). They are on the board below.`);
  });

  const build = async (issue: Issue) => {
    try {
      await api.runDev(issue.id);
      setToast(`The Dev bot started on #${issue.id}. It opens a draft pull request when the tests pass.`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The Dev bot could not start');
    }
  };

  const move = async (issue: Issue, status: string) => {
    try {
      await api.transitionIssue(issue.id, status);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That change was refused');
    }
  };

  const open = issues.filter((i) => !['done', 'rejected'].includes(i.status));
  const closed = issues.filter((i) => ['done', 'rejected'].includes(i.status));

  return (
    <>
      <PageHeader
        title="Crew"
        description="Bugs and improvements the Manager, Tester and R&D bots have found. Dev only starts on what you approve."
      />
      {error && <div className="mb-6"><Notice title="Something went wrong">{error}</Notice></div>}

      <Card title="Research" className="mb-8" action={
        <button className="btn btn-secondary btn-sm" onClick={() => rnd.run()} disabled={rnd.pending || research?.manual_left === 0}>
          {rnd.pending ? 'Researching… (a minute or two)' : 'Run research now'}
        </button>}>
        <p className="max-w-prose text-sm text-ink-2">
          The R&amp;D bot searches the web on the topics in its skill (edit them under Bot skills), checks your numbers, and files up to
          5 proposals with their sources: <b>improvements</b> for the Dev bot to build once you approve them, <b>ideas</b> for you to act on.
          It runs on its own once a week and learns from what you approve or reject.
        </p>
        {research && (
          <p className="mt-2 text-xs text-ink-3">
            {research.last_run ? `Last run ${new Date(research.last_run).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}. ` : 'Not run yet. '}
            {research.manual_left} of {research.manual_limit} runs by hand left today.
          </p>
        )}
        {research?.latest && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium">Latest report: {research.latest.subject}</summary>
            <Rich text={research.latest.body} />
          </details>
        )}
      </Card>
      {dev && (
        <p className="mb-8 max-w-prose text-sm text-ink-2">
          {dev.ready
            ? <>The Dev bot uses Claude Code on your subscription in a separate copy of the project, runs the tests, and opens a <b>draft</b> pull request. It never touches main and never merges. <span className="figure">{dev.runs_today}/{dev.daily_limit}</span> runs today.</>
            : 'The Dev bot needs GITHUB_REPOSITORY and GITHUB_TOKEN in tiga/.env before it can open pull requests.'}
        </p>
      )}
      {rnd.error && <div className="mb-6"><Notice>{rnd.error}</Notice></div>}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Card title={`Open (${open.length})`} raised>
          {open.length === 0 ? (
            <p className="text-sm text-ink-2">Nothing open. The bots will file issues here as they find them.</p>
          ) : (
            <ul className="space-y-4">
              {open.map((issue) => (
                <li key={issue.id} className="text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">#{issue.id} {issue.title}</span>
                    <span className={cn('badge', issue.kind === 'bug' ? 'badge-red' : issue.kind === 'idea' ? 'badge-amber' : 'badge-blue')}>{issue.kind}</span>
                    <span className="badge badge-gray">{issue.status}</span>
                    {issue.occurrences > 1 && <span className="text-xs text-ink-3">seen {issue.occurrences} times</span>}
                  </p>
                  {issue.body && <Rich text={issue.body} />}
                  <p className="text-xs text-ink-3">filed by {issue.source}</p>
                  {issue.status === 'in_progress' && <p role="status" className="mt-1 text-ink-2">The Dev bot is working on this…</p>}
                  {issue.pr_url && (
                    <p className="mt-1"><a className="font-medium text-pen underline" href={issue.pr_url} target="_blank" rel="noreferrer">Review the pull request</a></p>
                  )}
                  {issue.dev_note && issue.status !== 'pr_open' && <p className="mt-1 text-ink-2">Dev bot: {issue.dev_note}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {issue.status === 'approved' && (
                      <button className="btn btn-sm btn-primary" disabled={!dev?.ready || dev.busy || dev.runs_today >= dev.daily_limit} onClick={() => build(issue)}>
                        Let the Dev bot build it <span className="sr-only">#{issue.id}</span>
                      </button>
                    )}
                    {(YOUR_MOVES[issue.status] ?? []).map((m) => (
                      <button key={m.to} className={cn('btn btn-sm', m.to === 'rejected' ? 'btn-ghost' : 'btn-secondary')} onClick={() => move(issue, m.to)}>
                        {m.label} <span className="sr-only">#{issue.id}</span>
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {closed.length > 0 && <p className="mt-4 text-xs text-ink-3">{closed.length} closed</p>}
        </Card>

        <Card title="Bot skills" raised>
          <p className="mb-3 text-sm text-ink-2">Each bot follows its skill. Edit one to change how that bot behaves.</p>
          <Field label="Skill">
            {(id) => (
              <select id={id} className="input" value={skill} onChange={(e) => pick(e.target.value)}>
                <option value="">Choose a bot…</option>
                {skillNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            )}
          </Field>
          {skill && (
            <div className="mt-3 space-y-3">
              <Field label={`Instructions for ${skill}`}>
                {(id) => <textarea id={id} className="input min-h-64 font-mono text-sm" value={skillText} onChange={(e) => setSkillText(e.target.value)} />}
              </Field>
              <button className="btn btn-primary" onClick={() => save.run()} disabled={save.pending || skillText === savedText}>Save skill</button>
              {save.error && <Notice>{save.error}</Notice>}
            </div>
          )}
        </Card>

        <Card title="Recent activity">
          {audit.length === 0 ? (
            <p className="text-sm text-ink-2">No activity yet.</p>
          ) : (
            <ol className="space-y-1 text-sm">
              {audit.map((e) => (
                <li key={e.id}>
                  <span className="font-medium">{e.actor}</span> {e.action} <span className="text-ink-2">{e.detail}</span>
                  <span className="ml-2 text-xs text-ink-3">{new Date(e.ts).toLocaleString()}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </>
  );
}
