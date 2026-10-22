import { useCallback, useEffect, useRef, useState } from 'react';

type Phase = 'idle' | 'recording' | 'saving';

const supported = () =>
  typeof window !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && typeof MediaRecorder !== 'undefined';

/**
 * Records a call from this browser: the shared meeting tab's (or screen's) sound mixed with the owner's mic,
 * as speech-quality Opus. `stop()` resolves with the recording; nothing is uploaded here.
 */
export function useCallRecorder() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const parts = useRef<{ streams: MediaStream[]; ctx: AudioContext; recorder: MediaRecorder; chunks: Blob[]; timer: number } | null>(null);
  const onEnded = useRef<(() => void) | null>(null);

  const release = useCallback(() => {
    const p = parts.current;
    if (!p) return;
    window.clearInterval(p.timer);
    p.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    p.ctx.close().catch(() => undefined);
    parts.current = null;
  }, []);
  useEffect(() => release, [release]);

  const start = useCallback(async (whenSharingEnds: () => void) => {
    setError(null);
    let display: MediaStream;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    } catch {
      setError('Recording did not start: nothing was shared.');
      return;
    }
    const callAudio = display.getAudioTracks();
    if (!callAudio.length) {
      display.getTracks().forEach((t) => t.stop());
      setError('No sound was shared. Start again and tick "Share tab audio" (or "Share system audio") in the picker.');
      return;
    }
    let mic: MediaStream | null = null;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      /* the call's own sound still records; the owner's voice is usually in it too */
    }
    const ctx = new AudioContext();
    const mix = ctx.createMediaStreamDestination();
    ctx.createMediaStreamSource(new MediaStream(callAudio)).connect(mix);
    if (mic) ctx.createMediaStreamSource(mic).connect(mix);
    const type = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
    const recorder = new MediaRecorder(mix.stream, { ...(type && { mimeType: type }), audioBitsPerSecond: 32000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.start(10_000);
    const began = Date.now();
    setSeconds(0);
    const timer = window.setInterval(() => setSeconds(Math.round((Date.now() - began) / 1000)), 1000);
    parts.current = { streams: [display, ...(mic ? [mic] : [])], ctx, recorder, chunks, timer };
    onEnded.current = whenSharingEnds;
    // the owner pressed the browser's own "Stop sharing": treat it as the end of the call
    callAudio[0].addEventListener('ended', () => onEnded.current?.());
    setPhase('recording');
  }, []);

  const stop = useCallback((): Promise<Blob | null> => {
    const p = parts.current;
    if (!p) return Promise.resolve(null);
    onEnded.current = null;
    setPhase('saving');
    return new Promise((resolve) => {
      p.recorder.onstop = () => {
        const blob = new Blob(p.chunks, { type: p.recorder.mimeType || 'audio/webm' });
        release();
        setPhase('idle');
        resolve(blob.size ? blob : null);
      };
      p.recorder.stop();
    });
  }, [release]);

  const discard = useCallback(() => {
    const p = parts.current;
    onEnded.current = null;
    if (p) { p.recorder.onstop = null; if (p.recorder.state !== 'inactive') p.recorder.stop(); }
    release();
    setPhase('idle');
  }, [release]);

  return { supported: supported(), phase, seconds, error, start, stop, discard };
}
