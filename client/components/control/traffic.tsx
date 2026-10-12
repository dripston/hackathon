"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { getRuns } from "@/lib/api";
import { useNow, usePoll } from "@/lib/use-poll";
import type { ScoredRun } from "@/lib/types";
import { BriefPanel } from "@/components/console/brief-panel";
import { Ecg } from "@/components/story/ecg";
import { Panel } from "@/components/control/panel";
import { ago } from "@/components/console/ui";
import { cn } from "@/lib/utils";

const TRIPWIRES = ["tw_invented_person", "tw_empty_after_error", "tw_company_match_skipped", "tw_claimed_success_on_failure"];
const TW_SHORT: Record<string, string> = {
  tw_invented_person: "invented person",
  tw_empty_after_error: "empty after error",
  tw_company_match_skipped: "company check skipped",
  tw_claimed_success_on_failure: "claimed success",
};

/** Live traffic: every run the agent served, newest first. New runs slide in; failures glow red. */
export function Traffic() {
  const runs = usePoll(() => getRuns(14), 2000);
  const now = useNow(1000);
  const [selected, setSelected] = useState<ScoredRun | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const list = runs.data ?? [];
  // Runs present on the first load are not "new"; anything after that gets a highlight.
  const fresh = new Set<string>();
  if (seen.current === null && list.length) seen.current = new Set(list.map((r) => r.run.run_id));
  else if (seen.current) for (const r of list) if (!seen.current.has(r.run.run_id)) fresh.add(r.run.run_id);
  const failing = list.filter((r) => r.score.violations.length).length;

  return (
    <Panel
      title="Live traffic · company-research agent"
      live
      className="min-h-[560px]"
      action={<span className="text-muted-foreground font-mono text-xs">{failing ? `${failing} silent failures in view` : "all checks passing"}</span>}
    >
      <div className="border-border bg-background/50 -mx-1 mb-4 rounded-xl border px-3 pt-1">
        <Ecg height={70} failEvery={failing ? 3 : 999} />
      </div>
      <div className="text-muted-foreground grid grid-cols-[72px_1fr_56px_70px_92px] gap-3 px-3 pb-2 font-mono text-[11px] tracking-wider uppercase">
        <span>When</span>
        <span>Request</span>
        <span>Status</span>
        <span>Checks</span>
        <span className="text-right">Jev</span>
      </div>
      <ul className="space-y-1.5">
        <AnimatePresence initial={false}>
          {list.map((r) => {
            const bad = r.score.violations.length > 0;
            const jev = r.score.checks.find((c) => c.id === "jev_grounded")?.score;
            return (
              <motion.li
                key={r.run.run_id}
                layout
                initial={{ opacity: 0, y: -16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
              >
                <button
                  onClick={() => setSelected(r)}
                  className={cn(
                    "grid w-full grid-cols-[72px_1fr_56px_70px_92px] items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                    bad ? "border-infected/40 bg-infected/[0.07] hover:bg-infected/[0.12]" : "hover:bg-accent/60 border-transparent",
                    fresh.has(r.run.run_id) && !bad && "bg-healthy/[0.06]",
                  )}
                >
                  <span className="text-muted-foreground font-mono text-xs tabular-nums">{ago(r.run.started_at, now)}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.run.input.domain}</span>
                    {bad && <span className="text-infected block truncate font-mono text-xs">{TW_SHORT[r.score.violations[0]] ?? r.score.violations[0]}</span>}
                  </span>
                  <span className={cn("font-mono text-xs", bad ? "text-infected" : "text-muted-foreground")}>200 OK</span>
                  <span className="flex gap-1.5">
                    {TRIPWIRES.map((id) => {
                      const c = r.score.checks.find((x) => x.id === id);
                      return <span key={id} title={id} className={cn("size-2 rounded-full", !c ? "bg-muted" : c.passed ? "bg-healthy/80" : "bg-infected shadow-[0_0_8px] shadow-infected")} />;
                    })}
                  </span>
                  <span className="text-right font-mono text-xs tabular-nums">
                    {jev == null ? <span className="text-muted-foreground">—</span> : <span className={jev >= 0.5 ? "text-foreground" : "text-infected"}>{jev.toFixed(2)}</span>}
                  </span>
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      {!list.length && <p className="text-muted-foreground px-3 py-6 text-sm">{runs.error ? `Patient unreachable: ${runs.error}` : "Waiting for traffic…"}</p>}
      {selected && <BriefPanel item={selected} mock={runs.mock} onClose={() => setSelected(null)} />}
    </Panel>
  );
}
