"use client";

import { useState } from "react";
import Link from "next/link";
import { getOverview, getIncidents, getRisks, getRuns } from "@/lib/api";
import type { RiskForecast, ScoredRun } from "@/lib/types";
import { useNow, usePoll } from "@/lib/use-poll";
import { BriefPanel } from "@/components/console/brief-panel";
import { Dot, ErrorNote, PageHeader, Panel, Stat, MockBadge, ago } from "@/components/console/ui";
import { cn } from "@/lib/utils";

export default function LiveWard() {
  const runs = usePoll(() => getRuns(20));
  const risks = usePoll(getRisks);
  const incidents = usePoll(getIncidents);
  const overview = usePoll(getOverview);
  const [selected, setSelected] = useState<ScoredRun | null>(null);

  const list = runs.data ?? [];
  const now = useNow();
  const stats = overview.data;
  const rate = stats?.silent_failure_rate;
  const open = stats?.open_incidents;
  const anyMock = runs.mock || risks.mock || incidents.mock || overview.mock;
  const groups = new Map<string, RiskForecast[]>();
  for (const risk of [...(risks.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    groups.set(risk.subject, [...(groups.get(risk.subject) ?? []), risk]);
  }

  return (
    <>
      <PageHeader title="Live ward" mock={anyMock}>
        <span className="text-muted-foreground flex items-center gap-2 text-sm">
          <span className="bg-healthy size-2 animate-pulse rounded-full" /> polling every 2s
        </span>
      </PageHeader>

      <ErrorNote error={overview.error} updatedAt={overview.updatedAt} />
      <MockBadge show={overview.mock} />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Runs in last 10 min" value={stats?.runs_last_10_min ?? "—"} />
        <Stat label="Silent-failure rate" value={rate != null ? `${Math.round(rate * 100)}%` : "—"} tone={rate != null && rate > 0 ? "infected" : "healthy"} />
        <Stat label="Open incidents" value={open ?? "—"} tone={open ? "infected" : "healthy"} />
        <Stat
          label="Gate"
          value={stats ? (stats.gate_verdict?.toUpperCase() ?? "NOT RUN") : "—"}
          tone={stats?.gate_verdict ? (stats.gate_verdict === "safe" ? "healthy" : "infected") : undefined}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_440px]">
        <Panel title="Live feed · last 20 runs" action={<><MockBadge show={runs.mock} /><ErrorNote error={runs.error} updatedAt={runs.updatedAt} /></>}>
          <div className="overflow-x-auto"><table className="w-full text-left">
            <thead className="text-muted-foreground text-sm">
              <tr>
                <th className="pb-3 font-normal">When</th>
                <th className="pb-3 font-normal">Domain</th>
                <th className="pb-3 font-normal">Prompt</th>
                <th className="pb-3 font-normal">Output</th>
                <th className="pb-3 font-normal">Checks</th>
              </tr>
            </thead>
            <tbody>
              {list.map((item) => {
                const bad = item.score.violations.length > 0;
                return (
                  <tr
                    key={item.run.run_id}
                    tabIndex={0}
                    onClick={() => setSelected(item)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelected(item)}
                    className={cn(
                      "border-border hover:bg-muted/50 focus-visible:bg-muted/50 cursor-pointer border-t outline-none",
                      bad && "bg-infected/[0.04]",
                    )}
                  >
                    <td className="text-muted-foreground py-2.5 font-mono text-sm">{ago(item.run.started_at, now)}</td>
                    <td className="py-2.5 font-medium">{item.run.input.domain}</td>
                    <td className="py-2.5 font-mono text-sm">{item.run.prompt_version}</td>
                    <td className="text-muted-foreground py-2.5 font-mono text-sm">{item.run.output ? "Brief returned" : "No brief"}</td>
                    <td className="py-2.5">
                      <span className="flex gap-2">
                        {item.score.checks.filter(c => c.id.startsWith("tw_")).map((c) => (
                          <Dot key={c.id} passed={c.passed} title={`${c.id}: ${c.passed ? "passed" : "failed"}`} />
                        ))}
                      </span>
                      {item.score.checks.filter(c => c.id === "jev_grounded").map(c => <span key={c.id} className="text-muted-foreground text-xs" title="Advisory; not an alarm">Jev {c.score?.toFixed(2) ?? "—"} · advisory</span>)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
          {runs.loading && <p className="text-muted-foreground">Loading runs…</p>}
          {!runs.loading && !list.length && !runs.error && <p className="text-muted-foreground">No runs yet.</p>}
        </Panel>

        <div className="space-y-6">
          <Panel title="At risk" action={<><MockBadge show={risks.mock} /><ErrorNote error={risks.error} updatedAt={risks.updatedAt} /></>}>
            <ul className="space-y-4">
              {[...groups.entries()].map(([subject, history]) => <li key={subject}>
                <ul><RiskRow risk={history[0]} /></ul>
                {history.length > 1 && <details className="mt-2"><summary className="text-muted-foreground cursor-pointer text-sm">Older forecasts ({history.length - 1})</summary><ul className="mt-2 space-y-2">{history.slice(1).map(r => <RiskRow key={r.id} risk={r} />)}</ul></details>}
              </li>)}
              {risks.data?.length === 0 && <li className="text-muted-foreground">Nothing trending toward breaking.</li>}
            </ul>
          </Panel>

          <Panel title="Incidents" action={<><MockBadge show={incidents.mock} /><ErrorNote error={incidents.error} updatedAt={incidents.updatedAt} /></>}>
            <ul className="space-y-2">
              {(incidents.data ?? []).map((i) => (
                <li key={i.id}>
                  <Link href={`/incidents/${i.id}`} className="hover:bg-muted/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-2">
                    <Dot passed={i.status === "resolved"} />
                    <span className="font-mono text-sm">{i.detection}</span>
                    <span className={cn("ml-auto font-mono text-sm", i.status === "resolved" ? "text-healthy" : "text-infected")}>
                      {i.status.replace(/_/g, " ")}
                    </span>
                  </Link>
                </li>
              ))}
              {incidents.data?.length === 0 && <li className="text-muted-foreground">No incidents.</li>}
            </ul>
          </Panel>
        </div>
      </div>

      {selected && <BriefPanel mock={runs.mock} item={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function RiskRow({ risk }: { risk: RiskForecast }) {
  const pct = (n: number) => (risk.signal.endsWith("rate") ? `${Math.round(n * 100)}%` : String(n));
  return (
    <li className="border-border rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm">{risk.subject}</span>
        <span className="ml-auto">
          {risk.outcome === "happened" ? (
            <span className="text-healthy font-mono text-sm font-semibold">Predicted ✓</span>
          ) : risk.outcome === "did_not_happen" ? (
            <span className="text-muted-foreground font-mono text-sm">didn&apos;t happen</span>
          ) : (
            <span className={cn("font-mono text-sm", risk.likelihood === "likely" ? "text-infected" : "text-muted-foreground")}>
              {risk.likelihood} · watching
            </span>
          )}
        </span>
      </div>
      <p className="mt-2 leading-6">{risk.evidence}</p>
      <p className="text-muted-foreground mt-1 font-mono text-sm">
        {pct(risk.current)} now · breaks at {pct(risk.threshold)}
        {risk.outcome === "pending" && risk.eta_minutes != null && <> · {risk.eta_minutes === 0 ? "threshold already crossed" : `~${risk.eta_minutes} min`}</>}
      </p>
      {risk.related_check && <p className="text-muted-foreground mt-1 break-all font-mono text-xs">{risk.related_check}</p>}
    </li>
  );
}
