"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, type ApiResult } from "@/lib/api";

export interface PollState<T> {
  data: T | undefined;
  mock: boolean;
  error: string | null;
  /** True when the last request never reached the server. */
  unreachable: boolean;
  /** Epoch ms of the first failed poll since the last good one; null while healthy. */
  staleSince: number | null;
  loading: boolean;
  /** Fetch again now (e.g. after an approval). */
  refetch: () => void;
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

/**
 * Calls `fetcher` now and every `intervalMs` (0 = once). Keeps the last good data on error and
 * skips ticks while the tab is hidden.
 */
export function usePoll<T>(fetcher: () => Promise<ApiResult<T>>, intervalMs = 2000, key = ""): PollState<T> {
  type Core = Omit<PollState<T>, "refetch">;
  const [state, setState] = useState<Core>({
    data: undefined,
    mock: false,
    error: null,
    unreachable: false,
    staleSince: null,
    loading: true,
  });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const tickRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const { data, mock } = await fetcherRef.current();
        if (alive) setState({ data, mock, error: null, unreachable: false, staleSince: null, loading: false });
      } catch (err) {
        if (!alive) return;
        setState((s) => ({
          ...s,
          error: err instanceof Error ? err.message : String(err),
          unreachable: err instanceof ApiError && err.unreachable,
          staleSince: s.staleSince ?? Date.now(),
          loading: false,
        }));
      }
    };
    tickRef.current = tick;
    tick();
    const timer =
      intervalMs > 0 ? setInterval(() => document.visibilityState === "visible" && tick(), intervalMs) : undefined;
    const onVisible = () => document.visibilityState === "visible" && intervalMs > 0 && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, key]);

  const refetch = useCallback(() => void tickRef.current(), []);
  return { ...state, refetch };
}
