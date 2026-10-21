import { useEffect, useState } from 'react';
import { PageHeader, Card, Notice } from '../components/ui';
import { api } from '../services/api';
import { cn } from '../lib/utils';

type Lesson = { name: string; title: string };

export function Learn() {
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [mission, setMission] = useState('');
  const [current, setCurrent] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listLessons()
      .then((r) => {
        setLessons(r.lessons);
        setCurrent((c) => c ?? r.lessons[0]?.name ?? null);
      })
      .catch((e: Error & { status?: number }) => {
        if (e.status === 404) setHidden(true);
        else setError(e.message);
      });
    api.getMission().then((m) => setMission(m.text)).catch(() => undefined);
  }, []);

  if (hidden) {
    return (
      <>
        <PageHeader title="Learn" description="This service is switched off." />
        <Notice tone="info">Set TIGA_LEARN_ENABLED=true in your own tiga/.env and restart to use it.</Notice>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Learn" description="Your private curriculum, taught through the code in this project." />
      {error && <div className="mb-6"><Notice title="Couldn't load lessons">{error}</Notice></div>}
      {mission && (
        <Card title="Mission" className="mb-8">
          <pre className="whitespace-pre-wrap font-sans text-sm text-ink-2">{mission}</pre>
        </Card>
      )}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[16rem_1fr]">
        <nav aria-label="Lessons">
          <ol className="space-y-1">
            {lessons?.map((l) => (
              <li key={l.name}>
                <button
                  className={cn('w-full rounded px-3 py-2 text-left text-sm', l.name === current ? 'bg-wash font-medium' : 'hover:bg-wash/60')}
                  aria-current={l.name === current ? 'page' : undefined}
                  onClick={() => setCurrent(l.name)}
                >
                  {l.title}
                </button>
              </li>
            ))}
            {lessons?.length === 0 && <li className="text-sm text-ink-2">No lessons yet.</li>}
          </ol>
        </nav>
        {current && (
          <iframe
            title="Lesson"
            src={`/api/learn/lessons/${current}`}
            sandbox=""
            className="h-[75vh] w-full rounded-lg border border-rule bg-sheet"
          />
        )}
      </div>
    </>
  );
}
