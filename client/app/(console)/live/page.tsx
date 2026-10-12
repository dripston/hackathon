"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, HeartPulse, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { getGate, getIncidents, getOverview, getRuns, getTrust } from "@/lib/api";
import { useNow, usePoll } from "@/lib/use-poll";
import { DrillBar } from "@/components/control/drill-bar";
import { IncidentPanel } from "@/components/control/incident-panel";
import { Dot, Page, PageHeader, Panel, Stats, btn, label } from "@/components/control/panel";
import { ago } from "@/components/console/ui";
import { cn } from "@/lib/utils";

const ACTIVE = new Set(["open", "diagnosing", "simulating", "fixing", "awaiting_approval"]);

export default function Overview() {
  const incidents = usePoll(getIncidents, 2000).data ?? [];
  const o = usePoll(getOverview, 3000).data;
  const gate = usePoll(getGate, 10000).data;
  const trust = usePoll(getTrust, 30000).data;
  const runs = usePoll(() => getRuns(48), 3000).data ?? [];
  const now = useNow(1000);
  const active = incidents.find((i) => ACTIVE.has(i.status));
  const fixed = incidents.filter((i) => i.status === "resolved").length;
  const bad = runs.filter((r) => r.score.violations.length).length;
  const health = runs.length ? Math.round(((runs.length - bad) / runs.length) * 1000) / 10 : null;

  return (
    <Page>
      <PageHeader title="Overview" description="Silent failures caught, diagnosed and fixed for sales-research-agent in production." />

      {/* Health: the one thing to know when you open the app. */}
      <motion.section
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn("border-border bg-card relative overflow-hidden rounded-xl border", active && "border-brand/35")}
      >
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r to-transparent",
            active ? "from-brand/[0.09]" : "from-healthy/[0.07]",
          )}
          aria-hidden
        />
        <div className="relative flex flex-wrap items-center gap-5 px-6 py-5">
          <span className={cn("grid size-11 place-items-center rounded-xl border", active ? "border-brand/30 bg-brand/10 text-brand" : "border-healthy/25 bg-healthy/10 text-healthy")}>
            {active ? <Sparkles className="size-5" /> : <HeartPulse className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              {active ? "Antibody is handling an incident" : "Your agent is healthy"}
            </p>
            <p className="text-muted-foreground text-sm">
              {active ? `It caught “${label(active.detection).toLowerCase()}” and is working on it now.` : "Every run is checked for silent failures. Nothing needs you right now."}
            </p>
          </div>
          {active ? (
            <Link href={`/incidents/${encodeURIComponent(active.id)}`} className={btn.primary}>
              Watch it work <ArrowRight className="size-4" />
            </Link>
          ) : (
            <div className="text-right">
              <p className="text-healthy text-2xl font-semibold tabular-nums">{health == null ? "—" : `${health}%`}</p>
              <p className="text-muted-foreground text-xs">clean runs, last {runs.length}</p>
            </div>
          )}
        </div>
        <RunBars runs={runs.map((r) => ({ id: r.run.run_id, bad: r.score.violations.length > 0, domain: r.run.input.domain, at: r.run.started_at }))} now={now} />
      </motion.section>

      <Stats
        items={[
          { label: "Incidents fixed", value: incidents.length ? fixed : "—", hint: "found, fixed and approved", tone: fixed ? "healthy" : undefined },
          {
            label: "Runs · last 10 min",
            value: o ? o.runs_last_10_min : "—",
            hint: o?.silent_failures_last_10_min ? `${o.silent_failures_last_10_min} silent failures` : "all checks passing",
            tone: o?.silent_failures_last_10_min ? "infected" : undefined,
          },
          {
            label: "Deploy gate",
            value: o?.gate_verdict ? (o.gate_verdict === "safe" ? "Safe" : "Blocked") : "—",
            hint: gate ? `${gate.families.length} test families guard ${gate.branch}` : "no gate run yet",
            tone: o?.gate_verdict === "safe" ? "healthy" : o?.gate_verdict ? "infected" : undefined,
          },
          { label: "Planted bugs caught", value: trust ? `${trust.would_have_blocked}/${trust.seeded_bugs.length}` : "—", hint: "backtest, misses listed" },
        ]}
      />

      <DrillBar />

      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <IncidentPanel />
        <RecentTraffic />
      </div>
    </Page>
  );
}

/** Status-page bars: one per recent run, oldest on the left. */
function RunBars({ runs, now }: { runs: { id: string; bad: boolean; domain: string; at: string | null }[]; now: number }) {
  const slots = 48;
  const list = [...runs].reverse().slice(-slots);
  const pad = Array.from({ length: Math.max(0, slots - list.length) });
  return (
    <div className="border-border relative border-t px-6 py-4">
      <div className="flex h-8 items-end gap-[3px]">
        {pad.map((_, i) => (
          <span key={`p${i}`} className="bg-muted h-full flex-1 rounded-[2px]" />
        ))}
        {list.map((r) => (
          <span
            key={r.id}
            title={`${r.domain} · ${r.bad ? "silent failure" : "clean"} · ${ago(r.at, now)}`}
            className={cn("h-full flex-1 rounded-[2px] transition-opacity hover:opacity-70", r.bad ? "bg-infected" : "bg-healthy/80")}
          />
        ))}
      </div>
      <div className="text-muted-foreground mt-2 flex justify-between text-xs">
        <span>{list[0] ? ago(list[0].at, now) : "older"}</span>
        <span>Each bar is one production run</span>
        <span>now</span>
      </div>
    </div>
  );
}

function RecentTraffic() {
  const runs = usePoll(() => getRuns(8), 2000).data ?? [];
  const now = useNow(1000);
  return (
    <Panel
      title="Recent traffic"
      live
      flush
      action={
        <Link href="/traffic" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs">
          View all <ArrowUpRight className="size-3.5" />
        </Link>
      }
    >
      <ul className="divide-border divide-y">
        {runs.map((r) => {
          const bad = r.score.violations.length > 0;
          const jev = r.score.checks.find((c) => c.id === "jev_grounded")?.score;
          return (
            <li key={r.run.run_id} className="flex items-center gap-3 px-5 py-3 text-sm">
              <Dot tone={bad ? "infected" : "healthy"} />
              <span className="min-w-0 flex-1 truncate font-medium">{r.run.input.domain}</span>
              {bad ? (
                <span className="text-infected truncate text-xs">{label(r.score.violations[0])}</span>
              ) : (
                <span className="text-muted-foreground font-mono text-xs tabular-nums">{jev == null ? "" : `grounded ${jev.toFixed(2)}`}</span>
              )}
              <span className="text-muted-foreground w-14 text-right font-mono text-xs tabular-nums">{ago(r.run.started_at, now)}</span>
            </li>
          );
        })}
        {!runs.length && <li className="text-muted-foreground px-5 py-10 text-center text-sm">No traffic yet.</li>}
      </ul>
    </Panel>
  );
}
