import { useCallback, useEffect, useState } from 'react';

/** Browser text-to-speech for one message at a time, tracked by id. */
export function useSpeech() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(
    () => () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    },
    [],
  );

  const toggle = useCallback(
    (id: string, text: string) => {
      if (!supported) return;
      const synth = window.speechSynthesis;
      if (speakingId === id) {
        synth.cancel();
        setSpeakingId(null);
        return;
      }
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const finished = () => setSpeakingId((current) => (current === id ? null : current));
      utterance.onend = finished;
      utterance.onerror = finished;
      synth.speak(utterance);
      setSpeakingId(id);
    },
    [speakingId, supported],
  );

  return { supported, speakingId, toggle };
}
