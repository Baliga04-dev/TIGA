/**
 * "Hey Tiga": the wake phrase, the on/off setting (kept in this browser) and a busy flag so the wake
 * listener steps aside while push-to-talk owns the microphone.
 */

// Speech services hear "Tiga" in many ways; these are the spellings Edge and Chrome produce.
const WAKE = /\b(?:hey|hi|hello|ok|okay|a)\s*,?\s+(?:tiga|tigaa|teega|tega|teaga|tiger|tigger|tika|teeka)\b[\s,.!?]*(.*)$/i;

/** Where the wake phrase is in what was heard, and the command that follows it (may be empty). */
export function parseWake(transcript: string): { wake: boolean; command: string } {
  const m = WAKE.exec(transcript.trim());
  return m ? { wake: true, command: m[1].trim().replace(/^[,.!?\s]+/, '') } : { wake: false, command: '' };
}

const KEY = 'tiga.wake';
const CHANGED = 'tiga-wake-changed';
let busy = false;

export function wakeEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

export function setWakeEnabled(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, 'on');
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: the setting lasts until the tab closes */
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function voiceBusy(): boolean {
  return busy;
}

export function setVoiceBusy(on: boolean) {
  busy = on;
  window.dispatchEvent(new Event(CHANGED));
}

/** Call `fn` whenever the setting or the busy flag changes; returns the unsubscribe. */
export function onWakeChange(fn: () => void): () => void {
  window.addEventListener(CHANGED, fn);
  window.addEventListener('storage', fn);
  return () => {
    window.removeEventListener(CHANGED, fn);
    window.removeEventListener('storage', fn);
  };
}
