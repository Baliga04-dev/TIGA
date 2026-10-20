import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Wraps a user-triggered async call with pending/error/result state.
 * `run` resolves to the result, or null when the call failed (see `error`).
 */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<R | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args: A): Promise<R | null> => {
      setPending(true);
      setError(null);
      try {
        const value = await fn(...args);
        if (mounted.current) setResult(value);
        return value;
      } catch (e) {
        if (mounted.current) {
          setResult(null);
          setError(e instanceof Error ? e.message : 'Something went wrong');
        }
        return null;
      } finally {
        if (mounted.current) setPending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const reset = useCallback(() => {
    setError(null);
    setResult(null);
  }, []);

  return { run, pending, error, result, reset };
}
