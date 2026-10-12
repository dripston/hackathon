"use client";

import { motion } from "motion/react";
import type { LiveEvent } from "@/lib/api";
import { Window } from "@/components/workspace/terminal";
import { cn } from "@/lib/utils";

/** The variant family running: one square per scenario, per candidate, filled as each verdict lands. */
export function Tests({ events }: { events: LiveEvent[] }) {
  const scenarios = events.filter((e) => e.kind === "scenario");
  const order = [...scenarios.filter((s) => s.role === "must_fix"), ...scenarios.filter((s) => s.role !== "must_fix")];
  const verdicts = events.filter((e) => e.kind === "verdict");
  const candidates = [...new Set(verdicts.map((v) => v.candidate!))];
  const running = new Set(events.filter((e) => e.kind === "stage" && e.status === "start").map((e) => e.stage));
  const last = candidates[candidates.length - 1];

  return (
    <Window title="variant family · replaying on recorded Crustdata data" className="h-[380px]">
      <div className="h-full overflow-y-auto px-5 py-4">
        {!order.length && <p className="text-muted-foreground font-mono text-sm">The family is bred after the diagnosis.</p>}
        {!!order.length && (
          <div className="text-muted-foreground mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span><span className="bg-healthy mr-1.5 inline-block size-2 rounded-sm" />passes</span>
            <span><span className="bg-infected mr-1.5 inline-block size-2 rounded-sm" />still wrong</span>
            <span><span className="bg-muted mr-1.5 inline-block size-2 rounded-sm" />running</span>
            <span className="ml-auto">{order.filter((s) => s.role === "must_fix").length} must fix · {order.filter((s) => s.role !== "must_fix").length} must not change</span>
          </div>
        )}
        <div className="space-y-4">
          {(candidates.length ? candidates : order.length && running.has("baseline") ? ["baseline"] : []).map((cand) => {
            const mine = new Map(verdicts.filter((v) => v.candidate === cand).map((v) => [v.scenario_id, v]));
            const fixOk = order.filter((s) => s.role === "must_fix" && mine.get(s.id)?.passed).length;
            const keepOk = order.filter((s) => s.role !== "must_fix" && mine.get(s.id)?.passed).length;
            const done = mine.size === order.length;
            return (
              <div key={cand}>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="font-mono text-sm">{cand === "baseline" ? "before the fix" : `with ${cand}`}</span>
                  <span className={cn("font-mono text-xs", done ? "text-foreground" : "text-muted-foreground")}>
                    {done ? `${fixOk}/${order.filter((s) => s.role === "must_fix").length} fixed · ${keepOk}/${order.filter((s) => s.role !== "must_fix").length} healthy` : `${mine.size}/${order.length} run…`}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {order.map((s) => {
                    const v = mine.get(s.id);
                    return (
                      <motion.div
                        key={s.id}
                        title={`${s.domain} · ${s.role === "must_fix" ? "must fix" : "must not change"}${s.fault ? ` · ${s.fault}` : ""}${v ? (v.passed ? " · passed" : ` · failed ${v.failed_checks?.join(", ")}`) : " · running"}`}
                        initial={false}
                        animate={{ scale: v ? [1.25, 1] : 1 }}
                        transition={{ duration: 0.35 }}
                        className={cn(
                          "grid size-10 place-items-center rounded-lg text-[10px] font-medium",
                          !v && "bg-muted animate-pulse",
                          v?.passed && "bg-healthy/90 text-background",
                          v && !v.passed && "bg-infected/90 text-background",
                          s.role !== "must_fix" && "ring-border ring-1 ring-offset-2 ring-offset-[oklch(0.15_0.025_268)]",
                        )}
                      >
                        {s.domain?.split(".")[0].slice(0, 4)}
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {cand(last, verdicts, order)}
        </div>
      </div>
    </Window>
  );
}

// A small trailing line once the newest candidate finished.
function cand(last: string | undefined, verdicts: LiveEvent[], order: LiveEvent[]) {
  if (!last || last === "baseline") return null;
  const mine = verdicts.filter((v) => v.candidate === last);
  if (mine.length < order.length) return null;
  const ok = mine.every((v) => v.passed);
  return <p className={cn("font-mono text-sm", ok ? "text-healthy" : "text-infected")}>{ok ? `${last} passes the whole family` : `${last} rejected, trying again`}</p>;
}
