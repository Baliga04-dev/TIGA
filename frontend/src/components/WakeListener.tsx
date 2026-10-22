import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ear } from 'lucide-react';
import { onWakeChange, parseWake, voiceBusy, wakeEnabled, setWakeEnabled } from '../lib/wake';

type Result = ArrayLike<{ transcript: string }> & { isFinal: boolean };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<Result> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionCtor = new () => Recognition;

const ARMED_MS = 8000;

function recognitionClass(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** A short rising tone: "I'm listening". */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(990, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
    osc.onended = () => ctx.close();
  } catch {
    /* no audio: the on-screen status still says it is listening */
  }
}

/**
 * Listens for "Hey Tiga" while the owner has switched it on and a Tiga tab is open. "Hey Tiga, <command>"
 * sends the command to Chat; "Hey Tiga" alone chimes and takes the next sentence. It never confirms anything:
 * actions that need a click still wait for the Confirm button.
 */
export function WakeListener() {
  const navigate = useNavigate();
  const [on, setOn] = useState(wakeEnabled());
  const [busy, setBusy] = useState(voiceBusy());
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const armedUntil = useRef(0);

  useEffect(() => onWakeChange(() => { setOn(wakeEnabled()); setBusy(voiceBusy()); }), []);

  useEffect(() => {
    const Ctor = recognitionClass();
    if (!on || busy || !Ctor) return;
    let stopped = false;
    let r: Recognition | null = null;

    const send = (command: string) => {
      armedUntil.current = 0;
      setArmed(false);
      navigate('/chat', { state: { say: command } });
    };
    const listen = () => {
      if (stopped || document.hidden) return;
      r = new Ctor();
      r.lang = 'en-IN';
      r.continuous = true;
      r.interimResults = false;
      r.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (!res.isFinal) continue;
          const text = res[0].transcript.trim();
          const heard = parseWake(text);
          if (heard.wake && heard.command) send(heard.command);
          else if (heard.wake) {
            armedUntil.current = Date.now() + ARMED_MS;
            setArmed(true);
            chime();
            window.setTimeout(() => { if (Date.now() >= armedUntil.current) setArmed(false); }, ARMED_MS + 50);
          } else if (text && Date.now() < armedUntil.current) send(text);
        }
      };
      r.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          stopped = true;
          setError('Microphone permission was refused, so "Hey Tiga" is off.');
          setWakeEnabled(false);
        }
      };
      // Recognition ends by itself after a stretch of silence; start again while the owner wants it on.
      r.onend = () => { if (!stopped) window.setTimeout(listen, 300); };
      try {
        r.start();
      } catch {
        window.setTimeout(listen, 1000);
      }
    };
    const onVisible = () => { if (!document.hidden && !stopped) listen(); };
    document.addEventListener('visibilitychange', onVisible);
    setError(null);
    listen();
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      r?.stop();
    };
  }, [on, busy, navigate]);

  if (error) {
    return <p role="alert" className="fixed bottom-4 right-4 z-50 max-w-xs rounded-md bg-sheet px-3 py-2 text-sm shadow-md ring-1 ring-rule">{error}</p>;
  }
  if (!on || !recognitionClass()) return null;
  return (
    <p role="status" className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-sheet px-3 py-1.5 text-xs text-ink-2 shadow-sm ring-1 ring-rule">
      <Ear className={armed ? 'size-4 text-mark' : 'size-4'} aria-hidden="true" />
      {busy ? '"Hey Tiga" paused while the mic is in use' : armed ? 'Listening for your command…' : 'Say "Hey Tiga"'}
    </p>
  );
}
