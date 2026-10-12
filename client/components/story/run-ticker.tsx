"use client";

import { getRuns } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import type { ScoredRun } from "@/lib/types";
import { cn } from "@/lib/utils";

/** A slow marquee of the agent's real recent runs: every one says 200 OK; the dots tell the truth. */
export function RunTicker() {
  const runs = usePoll(() => getRuns(40), 15000);
  const list = (runs.data ?? []).filter((r) => r.run.input?.domain);
  if (list.length < 4) return <div className="border-border/60 h-14 border-y" />;
  const items = [...list, ...list]; // duplicated for a seamless loop
  return (
    <div className="border-border/60 bg-card/30 relative overflow-hidden border-y py-3.5" aria-label="Recent agent runs">
      <div className="from-background pointer-events-none absolute inset-y-0 left-0 z-10 w-32 bg-gradient-to-r to-transparent" />
      <div className="from-background pointer-events-none absolute inset-y-0 right-0 z-10 w-32 bg-gradient-to-l to-transparent" />
      <div className="animate-marquee flex w-max gap-3" style={{ animationDuration: `${list.length * 4}s` }}>
        {items.map((r, i) => (
          <Chip key={`${r.run.run_id}-${i}`} r={r} />
        ))}
      </div>
    </div>
  );
}

function Chip({ r }: { r: ScoredRun }) {
  const bad = r.score.violations.length > 0;
  const trips = r.score.checks.filter((c) => c.id.startsWith("tw_"));
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-3 rounded-full border px-4 py-1.5 font-mono text-xs",
        bad ? "border-infected/50 bg-infected/10" : "border-border bg-background/60",
      )}
    >
      <span className="text-foreground/90">{r.run.input.domain}</span>
      <span className="text-muted-foreground">200 OK</span>
      <span className="flex gap-1">
        {trips.map((c) => (
          <span key={c.id} className={cn("size-1.5 rounded-full", c.passed ? "bg-healthy/80" : "bg-infected")} />
        ))}
      </span>
      {bad && <span className="text-infected">{r.score.violations[0]}</span>}
    </div>
  );
}
