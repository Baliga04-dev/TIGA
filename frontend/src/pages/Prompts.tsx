import { useState } from 'react';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { PageHeader, Card, Notice, Field, CopyButton } from '../components/ui';
import { api } from '../services/api';
import { useAction } from '../hooks/useAction';
import type { Interview } from '../types';

export function Prompts() {
  const [idea, setIdea] = useState('');
  const [interview, setInterview] = useState<Interview | null>(null);
  const [answer, setAnswer] = useState('');
  const [prompt, setPrompt] = useState<string | null>(null);

  const start = useAction(async () => {
    const { interview: next } = await api.startInterview(idea);
    setInterview(next);
    setPrompt(null);
  });
  const reply = useAction(async (text: string) => {
    if (!interview) return;
    const { interview: next } = await api.answerInterview(interview.id, text);
    setInterview(next);
    setAnswer('');
  });
  const generate = useAction(async () => {
    if (!interview) return;
    setPrompt((await api.generateInterviewPrompt(interview.id)).prompt);
  });

  const answered = interview ? Object.keys(interview.slots).length : 0;

  return (
    <>
      <PageHeader
        title="Prompt Studio"
        description="Give a rough idea. Answer a few short questions (or skip any). Get a prompt you can paste into an AI to build it."
      />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Card title="1. Your idea" raised>
          <form onSubmit={(e) => { e.preventDefault(); start.run(); }} className="space-y-3">
            <Field label="What do you want to build?">
              {(id) => (
                <textarea id={id} required minLength={3} className="input min-h-24" value={idea} onChange={(e) => setIdea(e.target.value)} />
              )}
            </Field>
            <button className="btn btn-primary" type="submit" disabled={start.pending}>
              {start.pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
              {interview ? 'Start over' : 'Start'}
            </button>
            {start.error && <Notice>{start.error}</Notice>}
          </form>
        </Card>

        <div className="space-y-8">
          {interview && (
            <Card title="2. A few questions" raised>
              {interview.question ? (
                <form onSubmit={(e) => { e.preventDefault(); reply.run(answer); }} className="space-y-3">
                  <Field label={interview.question.text} hint={`${interview.asked.length} answered. You can skip any, or generate at any time.`}>
                    {(id) => <textarea id={id} className="input min-h-20" value={answer} onChange={(e) => setAnswer(e.target.value)} />}
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn btn-primary" type="submit" disabled={reply.pending || !answer.trim()}>
                      Next <ArrowRight className="size-4" aria-hidden="true" />
                    </button>
                    <button className="btn btn-secondary" type="button" disabled={reply.pending} onClick={() => reply.run('skip')}>
                      Skip, you decide
                    </button>
                  </div>
                </form>
              ) : (
                <p className="text-sm text-ink-2">That's enough to go on. {answered} details captured.</p>
              )}
              {reply.error && <div className="mt-3"><Notice>{reply.error}</Notice></div>}
              <div className="divider" />
              <button className="btn btn-success" onClick={() => generate.run()} disabled={generate.pending}>
                {generate.pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                Generate prompt now
              </button>
              {generate.error && <div className="mt-3"><Notice>{generate.error}</Notice></div>}
            </Card>
          )}

          {prompt && (
            <Card title="3. Your prompt" action={<CopyButton text={prompt} label="Copy prompt" />}>
              <pre aria-label="Generated prompt" className="whitespace-pre-wrap rounded-lg border border-rule bg-wash p-3 text-sm">{prompt}</pre>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
