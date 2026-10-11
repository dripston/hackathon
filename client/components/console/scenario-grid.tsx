"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import type { FamilyResult, Scenario, Verdict } from "@/lib/types";
import { TraceLink } from "@/components/console/ui";
import { cn } from "@/lib/utils";

const FLIP_MS = 1500;

/**
 * The signature visual: one square per scenario, must_fix on top, must_not_change below.
 * With `to`, squares flip one by one from the `from` result to the `to` result over ~1.5s.
 */
type GridProps = {
  scenarios: Scenario[];
  from: FamilyResult;
  to?: FamilyResult | null;
  size?: "lg" | "sm";
  template?: string | null;
};

export function ScenarioGrid(props: GridProps) {
  // Remounting the inner grid restarts the flip animation.
  const [run, setRun] = useState(0);
  const replay = useCallback(() => setRun((n) => n + 1), []);
  return <Grid key={run} {...props} onReplay={replay} />;
}

const verdictMap = (f: FamilyResult) => new Map(f.verdicts.map((v) => [v.scenario_id, v]));

function Grid({ scenarios, from, to, size = "lg", template, onReplay }: GridProps & { onReplay: () => void }) {
  const start = verdictMap(from);
  const end = to ? verdictMap(to) : start;
  const changed = scenarios.filter((s) => start.get(s.id)?.passed !== end.get(s.id)?.passed).map((s) => s.id);
  // How many changed squares have flipped so far; past the end, every square shows the target.
  const [flipped, setFlipped] = useState(0);

  useEffect(() => {
    if (!to) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const total = changed.length + 1;
    if (reduce) {
      const t = setTimeout(() => setFlipped(total), 0);
      return () => clearTimeout(t);
    }
    const step = FLIP_MS / Math.max(1, changed.length);
    const timers = Array.from({ length: total }, (_, i) => setTimeout(() => setFlipped(i + 1), 700 + i * step));
    return () => timers.forEach(clearTimeout);
    // Runs once per mount; replay remounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const done = flipped > changed.length;
  const flippedIds = new Set(changed.slice(0, flipped));
  const current = new Map(
    scenarios.map((s) => [s.id, done || flippedIds.has(s.id) ? end.get(s.id) : start.get(s.id)] as const),
  );
  const play = onReplay;

  const count = (role: Scenario["role"]) => {
    const list = scenarios.filter((s) => s.role === role);
    return { passed: list.filter((s) => current.get(s.id)?.passed).length, total: list.length };
  };
  const fix = count("must_fix");
  const keep = count("must_not_change");
  const target = to ?? from;
  const keepUnchanged = from.must_not_change_passed === target.must_not_change_passed;

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className={cn("font-mono font-semibold tabular-nums", size === "lg" ? "text-4xl" : "text-2xl")}>
          {to ? (
            <>
              <span className="text-infected">
                {from.must_fix_passed}/{from.must_fix_total}
              </span>{" "}
              →{" "}
              <span className={fix.passed === fix.total ? "text-healthy" : "text-infected"}>
                {fix.passed}/{fix.total}
              </span>
            </>
          ) : (
            <span className={fix.passed === fix.total ? "text-healthy" : "text-infected"}>
              {fix.passed}/{fix.total}
            </span>
          )}
          <span className="text-muted-foreground"> · </span>
          <span className={keep.passed === keep.total ? "text-healthy" : "text-infected"}>
            {keep.passed}/{keep.total}
          </span>{" "}
          <span className="text-muted-foreground text-base font-normal">
            {to ? (keepUnchanged ? "unchanged" : "changed") : "must_not_change"}
          </span>
        </p>
        {to && (
          <button
            onClick={play}
            className="text-muted-foreground hover:text-foreground ml-auto flex items-center gap-1.5 text-sm"
          >
            <RotateCcw className="size-4" /> Replay
          </button>
        )}
      </div>

      {(["must_fix", "must_not_change"] as const).map((role) => (
        <div key={role} className="mt-4">
          <p className="text-muted-foreground mb-2 font-mono text-sm">{role}</p>
          <div className="flex flex-wrap gap-2">
            {scenarios
              .filter((s) => s.role === role)
              .map((s) => (
                <Square key={s.id} scenario={s} verdict={current.get(s.id)} size={size} template={template} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Square({ scenario, verdict, size, template }: { scenario: Scenario; verdict?: Verdict; size: "lg" | "sm"; template?: string | null }) {
  const passed = verdict?.passed;
  const fault = scenario.faults[0];
  return (
    <div className="group relative">
      <button
        aria-label={`${scenario.domain}: ${passed ? "passed" : "failed"}`}
        className={cn(
          "rounded-md transition-all duration-300 [transform-style:preserve-3d]",
          size === "lg" ? "size-14" : "size-9",
          passed === undefined ? "bg-muted" : passed ? "bg-healthy" : "bg-infected",
          passed ? "[transform:rotateY(180deg)]" : "",
        )}
      />
      <div
        role="tooltip"
        className="border-border bg-popover absolute top-full left-0 z-20 mt-2 hidden w-72 max-w-[calc(100vw-2rem)] rounded-lg border p-3 text-sm shadow-xl group-focus-within:block group-hover:block"
      >
        <p className="font-medium">{scenario.domain}</p>
        <p className="text-muted-foreground mt-1 font-mono text-xs">
          {fault ? `${fault.tool} → ${fault.error.code} at call ${fault.at_call}` : "no injected fault"}
        </p>
        <p className={cn("mt-2 font-mono text-xs", passed ? "text-healthy" : "text-infected")}>
          {passed ? "passed" : verdict?.failed_checks.length ? `failed: ${verdict.failed_checks.join(", ")}` : "failed"}
        </p>
        {!passed && verdict?.evidence?.map((e) => (
          <p key={e} className="text-muted-foreground mt-1 text-xs">
            {e}
          </p>
        ))}
        {verdict?.trace_id && (
          <p className="mt-2">
            <TraceLink id={verdict.trace_id} template={template} className="text-xs" />
          </p>
        )}
      </div>
    </div>
  );
}
