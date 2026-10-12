"use client";

import Link from "next/link";
import { Loader2, ShieldCheck, ShieldX, TrendingUp } from "lucide-react";
import { getAftercare, getGate, getIncidents, getOverview, getRisks, getTrust, isDrillMode } from "@/lib/api";
import { useNow, usePoll } from "@/lib/use-poll";
import type { RiskForecast } from "@/lib/types";
import { Panel, Pill, STATUS_LABEL, STATUS_TONE, Stats, type Tone } from "@/components/control/panel";
import { ago } from "@/components/console/ui";
import { cn } from "@/lib/utils";

/* ----------------------------- vitals strip ----------------------------- */

export function VitalsStrip() {
  const o = usePoll(getOverview, 2000).data;
  const trust = usePoll(getTrust, 30000).data;
  const rate = o?.silent_failure_rate;
  const cells: { label: string; value: string | number; tone?: Tone }[] = [
    { label: "Runs · last 10 min", value: o?.runs_last_10_min ?? "—" },
    { label: "Silent-failure rate", value: rate == null ? "—" : `${Math.round(rate * 100)}%`, tone: rate ? "infected" : "healthy" },
    { label: "Open incidents", value: o?.open_incidents ?? "—", tone: o?.open_incidents ? "brand" : undefined },
    { label: "Awaiting approval", value: o?.awaiting_approval ?? "—", tone: o?.awaiting_approval ? "brand" : undefined },
    { label: "Deploy gate", value: o?.gate_verdict ? (o.gate_verdict === "safe" ? "Safe" : "Blocked") : "—", tone: o?.gate_verdict === "blocked" ? "infected" : o?.gate_verdict ? "healthy" : undefined },
    { label: "Planted bugs caught", value: trust ? `${trust.would_have_blocked}/${trust.seeded_bugs.length}` : "—" },
  ];
  return <Stats items={cells} />;
}

/* ------------------------------- forecasts ------------------------------- */

export function Forecasts() {
  const risks = usePoll(getRisks, 5000);
  const latest = new Map<string, RiskForecast>();
  for (const r of risks.data ?? []) if (!latest.has(r.subject)) latest.set(r.subject, r);
  const list = [...latest.values()];
  return (
    <Panel title="Forecasts" description="Tools trending toward failure, before they break" live>
      {!list.length && <p className="text-muted-foreground text-sm">No tool is trending toward failure.</p>}
      <ul className="space-y-4">
        {list.map((r) => {
          const pct = Math.min(100, (r.current / Math.max(r.threshold, 0.0001)) * 100);
          return (
            <li key={r.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-sm">{r.subject}</span>
                <Pill tone={r.outcome === "happened" ? "infected" : r.outcome === "did_not_happen" ? "healthy" : r.likelihood === "likely" ? "infected" : "muted"}>
                  {r.outcome === "pending" ? r.likelihood : r.outcome.replaceAll("_", " ")}
                </Pill>
              </div>
              <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
                <div className={cn("h-full rounded-full", pct >= 100 ? "bg-infected" : "bg-foreground/70")} style={{ width: `${pct}%` }} />
              </div>
              <p className="text-muted-foreground mt-2 text-sm">
                <TrendingUp className="mr-1 inline size-3.5" />
                {r.evidence}
                {r.eta_minutes ? ` · threshold in ~${r.eta_minutes} min` : r.eta_minutes === 0 ? " · threshold crossed" : ""}
              </p>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* ------------------------------ gate + immunity ------------------------------ */

export function GatePanel() {
  const gate = usePoll(getGate, 5000);
  const after = usePoll(getAftercare, 3000).data;
  const g = gate.data;
  const running = after && !["done", "failed", "idle"].includes(after.state);
  return (
    <Panel title="Deploy gate" description="Every fixed incident replays before a deploy" live={!!running}>
      {!g && <p className="text-muted-foreground text-sm">{isDrillMode() ? "In a drill, the gate runs on the sandbox after you approve the fix." : "No gate run yet."}</p>}
      {g && (
        <>
          <div className="flex items-center gap-3">
            <span className={cn("grid size-11 place-items-center rounded-xl border", g.verdict === "safe" ? "border-healthy/25 bg-healthy/10 text-healthy" : "border-infected/25 bg-infected/10 text-infected")}>{g.verdict === "safe" ? <ShieldCheck className="size-5" /> : <ShieldX className="size-5" />}</span>
            <div>
              <p className={cn("text-xl font-semibold tracking-tight", g.verdict === "safe" ? "text-healthy" : "text-infected")}>{g.verdict === "safe" ? "Safe to ship" : "Blocked"}</p>
              <p className="text-muted-foreground font-mono text-xs">
                {g.branch} · {g.families.length} famil{g.families.length === 1 ? "y" : "ies"}
              </p>
            </div>
          </div>
          {g.note && <p className="text-infected mt-3 text-sm">{g.note}</p>}
          <ul className="mt-4 space-y-2">
            {g.families.map((f) => (
              <li key={f.incident_id} className="border-border bg-muted/30 flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <span className="text-muted-foreground truncate font-mono text-xs">{f.incident_id.replace(/^inc_\d+_\d+_/, "")}</span>
                <span className={cn("shrink-0 font-mono text-xs", f.reopens ? "text-infected" : "text-healthy")}>
                  {f.must_fix_passed}/{f.must_fix_total} · {f.must_not_change_passed ?? "–"}/{f.must_not_change_total ?? "–"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {running && (
        <p className="text-muted-foreground mt-4 flex items-center gap-2 text-sm">
          <Loader2 className="size-3.5 animate-spin" /> After the merge: {after!.state} main…
        </p>
      )}
    </Panel>
  );
}

/* -------------------------------- history -------------------------------- */

export function History() {
  const list = usePoll(getIncidents, 5000).data ?? [];
  const now = useNow(5000);
  return (
    <Panel title="Incident history">
      {!list.length && <p className="text-muted-foreground text-sm">No incidents yet.</p>}
      <ul className="space-y-2">
        {list.slice(0, 6).map((i) => (
          <li key={i.id}>
            <Link href={`/incidents/${encodeURIComponent(i.id)}`} className="border-border hover:bg-accent/60 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors">
              <span className="min-w-0">
                <span className="block truncate font-mono text-sm">{i.detection}</span>
                <span className="text-muted-foreground font-mono text-xs">{ago(i.first_seen, now)}</span>
              </span>
              <Pill tone={STATUS_TONE[i.status]}>{STATUS_LABEL[i.status] ?? i.status}</Pill>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
