"use client";

import { useEffect, useRef, useState } from "react";
import { getEvents, type LiveEvent } from "@/lib/api";

/** All live events of an incident, growing as Antibody works. Polls every second while the tab is visible. */
export function useEvents(id: string, intervalMs = 1000) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const next = useRef(0);
  useEffect(() => {
    let alive = true;
    next.current = 0;
    setEvents([]);
    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const { data } = await getEvents(id, next.current);
        if (!alive || !data.events.length) return;
        next.current = data.next;
        setEvents((prev) => [...prev, ...data.events.filter((e) => e.seq > (prev[prev.length - 1]?.seq ?? 0))]);
      } catch {
        /* keep what we have; retry next tick */
      }
    };
    tick();
    const t = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id, intervalMs]);
  return events;
}
