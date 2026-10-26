import { useCallback, useEffect, useState } from "react";

export type Loaded<T> = { status: "loading" } | { status: "error"; error: string } | { status: "ok"; data: T };

/** Loads one of the site's JSON files from public/data, with a retry for the error state. */
export function useJson<T>(file: string): [Loaded<T>, () => void] {
  const [state, setState] = useState<Loaded<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    fetch(`${import.meta.env.BASE_URL}data/${file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`the server answered ${r.status}`);
        return r.json() as Promise<T>;
      })
      .then((data) => live && setState({ status: "ok", data }))
      .catch((e: unknown) => live && setState({ status: "error", error: e instanceof Error ? e.message : String(e) }));
    return () => { live = false; };
  }, [file, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return [state, retry];
}
