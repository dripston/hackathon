"use client";

import { useEffect, useRef, useState } from "react";
import type { ApiResult } from "@/lib/api";

export interface PollState<T> {
  data: T | undefined;
  mock: boolean;
  error: string | null;
  loading: boolean;
}

/** Current time, refreshed every `intervalMs`, so render stays pure. */
export function useNow(intervalMs = 2000) {
  // 0 during prerender (Cache Components forbids reading the clock there); real time after mount.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const first = setTimeout(update, 0);
    const t = setInterval(update, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [intervalMs]);
  return now;
}

/** Calls `fetcher` now and every `intervalMs` (0 = once). Keeps the last good data on error. */
export function usePoll<T>(fetcher: () => Promise<ApiResult<T>>, intervalMs = 2000, key = ""): PollState<T> {
  const [state, setState] = useState<PollState<T>>({ data: undefined, mock: false, error: null, loading: true });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const { data, mock } = await fetcherRef.current();
        if (alive) setState({ data, mock, error: null, loading: false });
      } catch (err) {
        if (alive) setState((s) => ({ ...s, error: err instanceof Error ? err.message : String(err), loading: false }));
      }
    };
    tick();
    const timer = intervalMs > 0 ? setInterval(tick, intervalMs) : undefined;
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [intervalMs, key]);

  return state;
}
