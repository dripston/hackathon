"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiResult } from "@/lib/api";

export interface PollState<T> {
  data: T | undefined;
  mock: boolean;
  error: string | null;
  loading: boolean;
  updatedAt: number | null;
  refresh: () => void;
}

export function useNow(intervalMs = 2000) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const first = setTimeout(update, 0);
    const timer = setInterval(update, intervalMs);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [intervalMs]);
  return now;
}

/** Serial polling, paused in hidden tabs; retains the last successful response on errors. */
export function usePoll<T>(fetcher: () => Promise<ApiResult<T>>, intervalMs = 2000, key = ""): PollState<T> {
  const [state, setState] = useState<Omit<PollState<T>, "refresh"> & { key: string }>({
    key, data: undefined, mock: false, error: null, loading: true, updatedAt: null,
  });
  const fetcherRef = useRef(fetcher);
  const refreshRef = useRef(() => {});
  useEffect(() => { fetcherRef.current = fetcher; });
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    let alive = true;
    let pending = false;
    let rerun = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      clearTimeout(timer);
      if (!alive || document.visibilityState === "hidden") return;
      if (pending) { rerun = true; return; }
      pending = true;
      try {
        const { data, mock } = await fetcherRef.current();
        if (alive) setState({ key, data, mock, error: null, loading: false, updatedAt: Date.now() });
      } catch (error) {
        if (alive) setState(s => ({
          ...(s.key === key ? s : { key, data: undefined, mock: false, updatedAt: null }),
          error: error instanceof Error ? error.message : String(error), loading: false,
        }));
      } finally {
        pending = false;
        if (alive && document.visibilityState !== "hidden" && (rerun || intervalMs > 0)) {
          timer = setTimeout(tick, rerun ? 0 : intervalMs);
          rerun = false;
        }
      }
    };
    refreshRef.current = tick;
    const visibility = () => {
      clearTimeout(timer);
      if (document.visibilityState !== "hidden") void tick();
    };
    document.addEventListener("visibilitychange", visibility);
    void tick();
    return () => { alive = false; clearTimeout(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [intervalMs, key]);

  return state.key === key ? { ...state, refresh } : { data: undefined, mock: false, error: null, loading: true, updatedAt: null, refresh };
}
