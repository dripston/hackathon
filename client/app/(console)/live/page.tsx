"use client";

import Link from "next/link";
import { ArrowRight, HeartPulse, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { getGate, getIncidents, getOverview, getRuns, getTrust } from "@/lib/api";
import { useNow, usePoll } from "@/lib/use-poll";
import { DrillBar } from "@/components/control/drill-bar";
import { IncidentPanel } from "@/components/control/incident-panel";
import { Panel } from "@/components/control/panel";
import { ago } from "@/components/console/ui";
import { cn } from "@/lib/utils";

const ACTIVE = new Set(["open", "diagnosing", "simulating", "fixing", "awaiting_approval"]);

export default function Overview() {
  const incidents = usePoll(getIncidents, 2000).data ?? [];
  const o = usePoll(getOverview, 3000).data;
  const gate = usePoll(getGate, 10000).data;
  const trust = usePoll(getTrust, 30000).data;
  const active = incidents.find((i) => ACTIVE.has(i.status));
  const fixed = incidents.filter((i) => i.status === "resolved").length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "relative overflow-hidden rounded-3xl border p-8 sm:p-10",
          active ? "border-brand/30 bg-brand/[0.07]" : "border-healthy/20 bg-healthy/[0.05]",
        )}
      >
        <div className={cn("pointer-events-none absolute -top-24 -right-16 size-72 rounded-full blur-3xl", active ? "bg-brand/25" : "bg-healthy/20")} aria-hidden />
        <div className="relative flex flex-wrap items-center gap-8">
          <span className={cn("relative grid size-16 place-items-center rounded-2xl", active ? "bg-brand/20 text-brand" : "bg-healthy/15 text-healthy")}>
            <span className={cn("absolute inset-0 animate-ping rounded-2xl opacity-20", active ? "bg-brand" : "bg-healthy")} />
            {active ? <Sparkles className="size-8" /> : <HeartPulse className="size-8" />}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {active ? "Antibody is handling an incident" : "Your agent is healthy"}
            </h1>
            <p className="text-muted-foreground mt-2 text-lg">
              {active
                ? `It caught ${active.detection.replace(/^tw_/, "").replaceAll("_", " ")} and is working on it right now.`
                : "Every run is checked for silent failures. Nothing needs you right now."}
            </p>
          </div>
          {active && (
            <Link href={`/incidents/${encodeURIComponent(active.id)}`} className="bg-brand text-background hover:bg-brand/90 glow-brand inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-medium transition-colors">
              Watch it work <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
      </motion.section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card label="Incidents fixed" value={incidents.length ? String(fixed) : "—"} hint="found, fixed and approved" good={fixed > 0} />
        <Card label="Runs in the last 10 min" value={o ? String(o.runs_last_10_min) : "—"} hint={o?.silent_failures_last_10_min ? `${o.silent_failures_last_10_min} silent failures` : "all checks passing"} />
        <Card label="Deploy gate" value={o?.gate_verdict ? (o.gate_verdict === "safe" ? "Safe" : "Blocked") : "—"} hint={gate ? `${gate.families.length} families guarding main` : "no gate run yet"} good={o?.gate_verdict === "safe"} />
        <Card label="Planted bugs caught" value={trust ? `${trust.would_have_blocked}/${trust.seeded_bugs.length}` : "—"} hint="backtest, misses listed" />
      </div>

      <DrillBar />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <IncidentPanel />
        <RecentTraffic />
      </div>
    </div>
  );
}

function Card({ label, value, hint, good }: { label: string; value: string; hint: string; good?: boolean }) {
  return (
    <div className="border-border bg-card/60 rounded-2xl border p-5 shadow-lg shadow-black/10">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className={cn("mt-2 text-3xl font-semibold tabular-nums", good && "text-healthy")}>{value}</p>
      <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
    </div>
  );
}

function RecentTraffic() {
  const runs = usePoll(() => getRuns(6), 2000).data ?? [];
  const now = useNow(1000);
  return (
    <Panel title="Recent traffic" live action={<Link href="/traffic" className="text-muted-foreground hover:text-foreground text-sm">See all →</Link>}>
      <ul className="space-y-1">
        {runs.map((r) => {
          const bad = r.score.violations.length > 0;
          return (
            <li key={r.run.run_id} className="flex items-center gap-3 rounded-lg px-2 py-2">
              <span className={cn("size-2 rounded-full", bad ? "bg-infected" : "bg-healthy")} />
              <span className="flex-1 truncate">{r.run.input.domain}</span>
              {bad && <span className="text-infected text-xs">{r.score.violations[0].replace(/^tw_/, "").replaceAll("_", " ")}</span>}
              <span className="text-muted-foreground font-mono text-xs">{ago(r.run.started_at, now)}</span>
            </li>
          );
        })}
        {!runs.length && <li className="text-muted-foreground text-sm">No traffic yet.</li>}
      </ul>
    </Panel>
  );
}
