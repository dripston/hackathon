"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { getRuns } from "@/lib/api";
import { useNow, usePoll } from "@/lib/use-poll";
import type { ScoredRun } from "@/lib/types";
import { BriefPanel } from "@/components/console/brief-panel";
import { Panel, Pill, label } from "./panel";
import { ago, ErrorNote, MockBadge } from "@/components/console/ui";

export function Traffic() {
  const runs = usePoll(() => getRuns(20), 2000);
  const now = useNow(5000);
  const [selected, setSelected] = useState<ScoredRun | null>(null);
  const [filter, setFilter] = useState<"all" | "failures">("all");
  const list = (runs.data ?? []).filter(r => filter === "all" || r.score.violations.length > 0);
  return <>
    <Panel title="What the agent returned" description="Open a run to compare its answer with the evidence." action={<MockBadge show={runs.mock} />}>
      <ErrorNote error={runs.error} updatedAt={runs.updatedAt} />
      <div className="mb-5 flex gap-2">{(["all", "failures"] as const).map(f => <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`rounded-lg border px-4 py-2 text-sm ${filter === f ? "bg-foreground text-background" : "text-muted-foreground"}`}>{f === "all" ? "All recent runs" : "Detected failures"}</button>)}</div>
      {runs.loading && <p>Loading agent runs…</p>}
      {!list.length && runs.data && !runs.error && <p className="text-muted-foreground py-8 text-center">{filter === "all" ? "No agent runs recorded yet." : "No detected failures in the latest runs."}</p>}
      <ul className="divide-border divide-y">{list.map(r => {
        const checks = r.score.checks.filter(c => c.id.startsWith("tw_"));
        const jev = r.score.checks.find(c => c.id === "jev_grounded");
        return <li key={r.run.run_id}><button onClick={() => setSelected(r)} className="hover:bg-accent/40 -mx-2 flex w-[calc(100%+1rem)] flex-wrap items-center gap-4 rounded-lg px-2 py-5 text-left">
          <div className="min-w-[180px] flex-1"><p className="font-semibold">{r.run.input.domain}</p><p className="text-muted-foreground mt-1 text-sm">{r.run.output ? "Brief returned" : "No brief returned"} · {ago(r.run.started_at, now)}</p>{r.score.violations.length > 0 && <p className="text-infected mt-2 text-sm">{label(r.score.violations[0])}</p>}</div>
          <div className="space-y-2"><Pill tone={r.score.violations.length ? "infected" : "muted"}>{r.score.violations.length ? `${r.score.violations.length} issue(s) detected` : "No violations recorded"}</Pill><p className="text-muted-foreground text-xs">{checks.filter(c => c.passed).length}/{checks.length} rule checks passed</p><p className="text-muted-foreground text-xs">Jev score: {jev?.score?.toFixed(2) ?? "unavailable"} · advisory</p></div>
          <ArrowUpRight className="text-muted-foreground size-5" />
        </button></li>;
      })}</ul>
    </Panel>
    {selected && <BriefPanel item={selected} mock={runs.mock} onClose={() => setSelected(null)} />}
  </>;
}
