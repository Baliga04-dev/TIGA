import { useCallback, useEffect, useRef, useState } from 'react';

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionCtor = new () => Recognition;

function recognitionClass(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Push-to-talk with the browser's speech recognition (Chrome and Edge send the audio to their cloud service).
 * Calls `onFinal` with the recognised sentence; `heard` shows words as they come in.
 */
export function useVoiceInput(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const latest = useRef(onFinal);
  latest.current = onFinal;
  const supported = recognitionClass() !== null;

  useEffect(() => () => recognition.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = recognitionClass();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = 'en-IN';
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (event) => {
      const results = Array.from(event.results);
      const text = results.map((res) => res[0].transcript).join(' ').trim();
      setHeard(text);
      if (results.length && results[results.length - 1].isFinal && text) latest.current(text);
    };
    r.onerror = (event) => setError(event.error === 'not-allowed' ? 'Microphone permission was refused' : `Voice input stopped: ${event.error}`);
    r.onend = () => setListening(false);
    recognition.current = r;
    setError(null);
    setHeard('');
    setListening(true);
    r.start();
  }, []);

  const stop = useCallback(() => recognition.current?.stop(), []);

  return { supported, listening, heard, error, start, stop };
}
