"use client";

import Link from "next/link";
import { getGate } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { Dot, ErrorNote, PageHeader, Panel, ago } from "@/components/console/ui";
import { cn } from "@/lib/utils";

export default function GatePage() {
  const gate = usePoll(getGate);
  const g = gate.data;
  const reopening = g?.families.filter((f) => f.reopens) ?? [];

  return (
    <>
      <PageHeader title="Pre-deploy gate" mock={gate.mock} />
      <ErrorNote error={gate.error} updatedAt={gate.updatedAt} />
      {gate.data === null && <Panel>No gate run yet.</Panel>}
      {gate.loading && <p className="text-muted-foreground">Loading gate report…</p>}

      {g && (
        <>
          <div
            className={cn(
              "rounded-2xl border p-10",
              g.verdict === "safe" ? "border-healthy/40 bg-healthy/[0.06]" : "border-infected/40 bg-infected/[0.06]",
            )}
          >
            <p className="text-muted-foreground font-mono">
              {g.branch} · checked {ago(g.created_at)}
            </p>
            <p
              className={cn(
                "mt-3 text-5xl font-semibold tracking-tight sm:text-6xl",
                g.verdict === "safe" ? "text-healthy" : "text-infected",
              )}
            >
              {g.verdict === "safe"
                ? "SAFE TO SHIP"
                : reopening.length ? `BLOCKED: ${reopening.length} failing families` : "BLOCKED: verification incomplete"}
            </p>
          </div>

          {g.note && <p className="text-infected mt-4 text-lg">{g.note}</p>}
          <Panel title="Immunity families" className="mt-6">
            <ul>
              {g.families.map((f) => (
                <li key={f.incident_id} className="border-border flex flex-wrap items-center gap-4 border-t py-4 first:border-t-0">
                  <Dot passed={!f.reopens} />
                  <Link href={`/incidents/${f.incident_id}`} className="break-all font-mono hover:underline">
                    {f.incident_id}
                  </Link>
                  <span className={cn("ml-auto font-mono text-xl tabular-nums", f.reopens ? "text-infected" : "text-healthy")}>
                    {f.must_fix_passed}/{f.must_fix_total} fix{f.must_not_change_total != null && <> · {f.must_not_change_passed}/{f.must_not_change_total} keep</>}
                  </span>
                  <span className={cn("w-60 text-right", f.reopens ? "text-infected" : "text-muted-foreground")}>
                    {f.message ?? (f.reopens ? "Regression detected" : "Checks passed")}
                  </span>
                </li>
              ))}
              {!g.families.length && <li className="text-muted-foreground">No immunity families yet.</li>}
            </ul>
          </Panel>
        </>
      )}
    </>
  );
}
