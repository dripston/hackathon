"use client";

import { useState } from "react";
import Link from "next/link";
import { getIncident, getIncidents, getOverview, getRisks, getRuns } from "@/lib/api";
import type { RiskForecast, ScoredRun } from "@/lib/types";
import { useNow, usePoll } from "@/lib/use-poll";
import { BriefPanel } from "@/components/console/brief-panel";
import { Dot, PageHeader, Panel, PollNote, Stat, ago } from "@/components/console/ui";
import { cn } from "@/lib/utils";

export default function LiveWard() {
  const overview = usePoll(getOverview);
  const runs = usePoll(() => getRuns(20));
  const risks = usePoll(getRisks);
  const incidents = usePoll(getIncidents);
  const [selected, setSelected] = useState<ScoredRun | null>(null);

  // The trace-link template lives on incident details; read it from the newest incident, if any.
  const firstIncident = incidents.data?.[0]?.id ?? "";
  const template = usePoll(
    async () => (firstIncident ? getIncident(firstIncident) : { data: undefined, mock: false }),
    0,
    firstIncident,
  ).data?.trace_url_template;

  const list = runs.data ?? [];
  const now = useNow();
  const o = overview.data;
  const anyMock = overview.mock || runs.mock || risks.mock || incidents.mock;

  return (
    <>
      <PageHeader title="Live ward" mock={anyMock}>
        <span className="text-muted-foreground flex items-center gap-2 text-sm">
          <span className="bg-healthy size-2 animate-pulse rounded-full" /> polling every 2s
        </span>
      </PageHeader>
      <PollNote poll={overview} />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Runs in last 10 min" value={o ? o.runs_last_10_min : "—"} />
        <Stat
          label="Silent-failure rate"
          value={o && o.silent_failure_rate != null ? `${Math.round(o.silent_failure_rate * 100)}%` : "—"}
          tone={o?.silent_failure_rate == null ? undefined : o.silent_failure_rate > 0 ? "infected" : "healthy"}
        />
        <Stat label="Open incidents" value={o ? o.open_incidents : "—"} tone={o ? (o.open_incidents ? "infected" : "healthy") : undefined} />
        <Stat
          label="Gate"
          value={o ? (o.gate_verdict === "safe" ? "SAFE" : o.gate_verdict === "blocked" ? "BLOCKED" : "no gate run yet") : "—"}
          tone={o?.gate_verdict ? (o.gate_verdict === "safe" ? "healthy" : "infected") : undefined}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_440px]">
        <Panel title="Live feed · last 20 runs" action={<PollNote poll={runs} />}>
          <table className="w-full text-left">
            <thead className="text-muted-foreground text-sm">
              <tr>
                <th className="pb-3 font-normal">When</th>
                <th className="pb-3 font-normal">Domain</th>
                <th className="pb-3 font-normal">Prompt</th>
                <th className="pb-3 font-normal">Status</th>
                <th className="pb-3 font-normal">Tripwires</th>
                <th className="pb-3 font-normal">Jev</th>
              </tr>
            </thead>
            <tbody>
              {list.map((item) => {
                const bad = item.score.violations.length > 0;
                const jev = item.score.checks.find((c) => c.id === "jev_grounded");
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
                    <td className="text-muted-foreground py-2.5 font-mono text-sm">
                      {item.run.started_at ? ago(item.run.started_at, now) : "—"}
                    </td>
                    <td className="py-2.5 font-medium">{item.run.input.domain}</td>
                    <td className="py-2.5 font-mono text-sm">{item.run.prompt_version}</td>
                    <td className="text-muted-foreground py-2.5 font-mono text-sm">200 OK</td>
                    <td className="py-2.5">
                      <span className="flex gap-2">
                        {item.score.checks
                          .filter((c) => c.id.startsWith("tw_"))
                          .map((c) => (
                            <Dot key={c.id} passed={c.passed} title={`${c.id}: ${c.passed ? "passed" : "failed"}`} />
                          ))}
                      </span>
                    </td>
                    <td className="py-2.5">
                      {jev?.score != null && (
                        <span
                          title="jev_grounded: advisory score, not an alarm"
                          className="text-muted-foreground border-border rounded border px-1.5 py-0.5 font-mono text-xs"
                        >
                          {jev.score.toFixed(2)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {runs.loading && <p className="text-muted-foreground">Loading runs…</p>}
          {!runs.loading && !list.length && !runs.error && <p className="text-muted-foreground">No runs yet.</p>}
        </Panel>

        <div className="space-y-6">
          <Panel title="At risk" action={<PollNote poll={risks} />}>
            <RiskList risks={risks.data ?? []} loaded={!!risks.data} />
          </Panel>

          <Panel title="Incidents" action={<PollNote poll={incidents} />}>
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

      {selected && <BriefPanel item={selected} template={template} onClose={() => setSelected(null)} />}
    </>
  );
}

/** The list holds history: newest forecast per subject up front, older ones collapsed. */
function RiskList({ risks, loaded }: { risks: RiskForecast[]; loaded: boolean }) {
  const bySubject = new Map<string, RiskForecast[]>();
  for (const r of [...risks].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    bySubject.set(r.subject, [...(bySubject.get(r.subject) ?? []), r]);
  }
  if (loaded && !risks.length) return <p className="text-muted-foreground">Nothing trending toward breaking.</p>;
  return (
    <ul className="space-y-4">
      {[...bySubject.values()].map(([newest, ...older]) => (
        <li key={newest.subject}>
          <RiskRow risk={newest} />
          {older.length > 0 && (
            <details className="mt-2">
              <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm">
                {older.length} earlier forecast{older.length === 1 ? "" : "s"}
              </summary>
              <div className="mt-2 space-y-2">
                {older.map((r) => (
                  <RiskRow key={r.id} risk={r} />
                ))}
              </div>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}

function RiskRow({ risk }: { risk: RiskForecast }) {
  const isRate = risk.signal.endsWith("rate");
  const fmt = (n: number) => (isRate ? `${Math.round(n * 100)}%` : String(n));
  return (
    <div className="border-border rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm">{risk.subject}</span>
        <span className="ml-auto">
          {risk.outcome === "happened" ? (
            <span className="text-healthy font-mono text-sm font-semibold">Predicted ✓</span>
          ) : risk.outcome === "did_not_happen" ? (
            <span className="text-muted-foreground font-mono text-sm">didn&apos;t happen</span>
          ) : (
            <span className={cn("font-mono text-sm", risk.likelihood === "likely" ? "text-infected" : "text-muted-foreground")}>
              watching · {risk.likelihood}
            </span>
          )}
        </span>
      </div>
      <p className="mt-2 leading-6">{risk.evidence}</p>
      <p className="text-muted-foreground mt-1 font-mono text-sm">
        {fmt(risk.current)} now · breaks at {fmt(risk.threshold)}
        {risk.outcome === "pending" && risk.eta_minutes != null && (
          <> · {risk.eta_minutes === 0 ? "threshold already crossed" : `~${risk.eta_minutes} min`}</>
        )}
        {risk.related_check && <> · {risk.related_check}</>}
      </p>
    </div>
  );
}
