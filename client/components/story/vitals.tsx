"use client";

import { getGate, getIncidents, getOverview } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { cn } from "@/lib/utils";

/** Live numbers from the running system, under the hero monitor. Shows "—" until the API answers. */
export function Vitals() {
  const overview = usePoll(getOverview, 5000);
  const incidents = usePoll(getIncidents, 10000);
  const gate = usePoll(getGate, 15000);
  const o = overview.data;
  const resolved = (incidents.data ?? []).filter((i) => i.status === "resolved").length;
  const items = [
    { label: "Incidents fixed", value: incidents.data ? resolved : "—", good: resolved > 0 },
    { label: "Families guarding main", value: gate.data ? gate.data.families.length : "—" },
    { label: "Deploy gate", value: o?.gate_verdict ? o.gate_verdict.toUpperCase() : "—", bad: o?.gate_verdict === "blocked", good: o?.gate_verdict === "safe" },
    { label: "Runs · last 10 min", value: o?.runs_last_10_min ?? "—", bad: !!o?.silent_failures_last_10_min },
  ];
  return (
    <div className="border-border mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="bg-background/60 px-4 py-3">
          <p className="text-muted-foreground font-mono text-[11px] tracking-wider uppercase">{it.label}</p>
          <p className={cn("mt-1 font-mono text-2xl font-semibold tabular-nums", it.bad ? "text-infected" : it.good ? "text-healthy" : "text-foreground")}>
            {it.value}
          </p>
        </div>
      ))}
      {overview.error && !o && (
        <p className="bg-background/60 text-muted-foreground col-span-full px-4 py-2 font-mono text-xs">
          Live backend unreachable right now; the replay below uses recorded data.
        </p>
      )}
    </div>
  );
}
