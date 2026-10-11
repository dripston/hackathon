"use client";

import Link from "next/link";
import { getGate } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { Dot, PageHeader, Panel, PollNote, stamp } from "@/components/console/ui";
import { cn } from "@/lib/utils";

export default function GatePage() {
  const gate = usePoll(getGate, 5000);
  const g = gate.data;
  const reopening = g?.families.filter((f) => f.reopens) ?? [];

  return (
    <>
      <PageHeader title="Pre-deploy gate" mock={gate.mock} />
      <PollNote poll={gate} />
      {gate.loading && <p className="text-muted-foreground">Loading gate report…</p>}

      {gate.data === null && (
        <Panel>
          <p className="text-xl">No gate run yet.</p>
          <p className="text-muted-foreground mt-2">
            The gate runs on a branch before deploy, and again on <code className="font-mono">main</code> after a merge. Nothing is shown
            until a real run exists.
          </p>
        </Panel>
      )}

      {g && (
        <>
          <div
            className={cn(
              "rounded-2xl border p-10",
              g.verdict === "safe" ? "border-healthy/40 bg-healthy/[0.06]" : "border-infected/40 bg-infected/[0.06]",
            )}
          >
            <p className="text-muted-foreground flex flex-wrap items-center gap-3 font-mono">
              {g.branch} · checked {stamp(g.created_at)}
            </p>
            <p
              className={cn(
                "mt-3 text-5xl font-semibold tracking-tight sm:text-6xl",
                g.verdict === "safe" ? "text-healthy" : "text-infected",
              )}
            >
              {g.verdict === "safe"
                ? "SAFE TO SHIP"
                : reopening.length
                  ? `BLOCKED: brings back ${reopening.length} past incident${reopening.length === 1 ? "" : "s"}`
                  : "BLOCKED"}
            </p>
            {g.note && <p className="text-infected mt-4 text-xl leading-8">{g.note}</p>}
          </div>

          <Panel title="Immunity families" className="mt-6">
            <ul>
              {g.families.map((f) => (
                <li key={f.incident_id} className="border-border flex flex-wrap items-center gap-4 border-t py-4 first:border-t-0">
                  <Dot passed={!f.reopens} />
                  <Link href={`/incidents/${f.incident_id}`} className="font-mono hover:underline">
                    {f.incident_id}
                  </Link>
                  <span className={cn("ml-auto font-mono text-xl tabular-nums", f.reopens ? "text-infected" : "text-healthy")}>
                    must_fix {f.must_fix_passed}/{f.must_fix_total}
                    {f.must_not_change_total != null && (
                      <>
                        {" "}
                        · keep {f.must_not_change_passed}/{f.must_not_change_total}
                      </>
                    )}
                  </span>
                  <span className={cn("w-full text-right font-mono text-sm", f.reopens ? "text-infected" : "text-muted-foreground")}>
                    {f.message ?? (f.reopens ? "would re-open this incident" : "still immune")}
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
