"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import type { ScoredRun } from "@/lib/types";
import { Dot, TraceLink } from "@/components/console/ui";

/** Side panel: the brief exactly as a user sees it, next to the checks that caught it. */
export function BriefPanel({ item, onClose }: { item: ScoredRun; onClose: () => void }) {
  const { run, score } = item;
  const brief = run.output;
  const failed = score.checks.filter((c) => !c.passed);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Run ${run.run_id}`}
        className="border-border bg-background h-full w-full max-w-5xl overflow-y-auto border-l p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          <div>
            <p className="text-muted-foreground font-mono text-sm">
              {run.run_id} · prompt {run.prompt_version} · <span className="text-healthy">200 OK</span>
            </p>
            <h2 className="mt-1 text-3xl font-semibold">{run.input.domain}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground hover:bg-muted ml-auto rounded-md p-2"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section>
            <h3 className="text-muted-foreground mb-3 font-mono text-sm tracking-wider uppercase">What the user saw</h3>
            {brief ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                <div className="flex items-baseline justify-between">
                  <h4 className="text-xl font-semibold">{brief.company_name}</h4>
                  {brief.headcount != null && (
                    <span className="text-muted-foreground text-sm">{brief.headcount.toLocaleString()} people</span>
                  )}
                </div>
                <p className="mt-3 leading-7">{brief.summary}</p>
                <h5 className="text-muted-foreground mt-5 text-sm font-medium">Decision makers</h5>
                {brief.decision_makers.length ? (
                  <ul className="mt-2 space-y-2">
                    {brief.decision_makers.map((p) => (
                      <li key={p.name} className="flex justify-between gap-4">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-muted-foreground">{p.title}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2">{brief.no_decision_makers_reason ?? "None listed."}</p>
                )}
                <h5 className="text-muted-foreground mt-5 text-sm font-medium">Hiring signals</h5>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {brief.hiring_signals.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-muted-foreground">This run produced no brief.</p>
            )}
          </section>

          <section>
            <h3 className="text-muted-foreground mb-3 font-mono text-sm tracking-wider uppercase">What Antibody saw</h3>
            {failed.length ? (
              <ul className="space-y-3">
                {failed.map((c) => (
                  <li key={c.id} className="border-infected/40 bg-infected/5 rounded-xl border p-5">
                    <div className="text-infected flex items-center gap-2 font-mono text-sm">
                      <Dot passed={false} /> {c.id}
                      {c.score != null && <span className="ml-auto">score {c.score.toFixed(2)}</span>}
                    </div>
                    <p className="mt-2 text-lg leading-7">{c.evidence}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-healthy">All {score.checks.length} checks passed.</p>
            )}
            <ul className="mt-6 space-y-2">
              {score.checks
                .filter((c) => c.passed)
                .map((c) => (
                  <li key={c.id} className="text-muted-foreground flex items-center gap-2 font-mono text-sm">
                    <Dot passed /> {c.id}
                    {c.score != null && <span>· {c.score.toFixed(2)}</span>}
                  </li>
                ))}
            </ul>
            <div className="text-muted-foreground mt-6 text-sm">
              neatlogs trace: <TraceLink id={run.trace_id} />
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
