"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, GitMerge, GitPullRequest, Mic, Keyboard } from "lucide-react";
import { getIncident, getIncidents } from "@/lib/api";
import { useNow, usePoll } from "@/lib/use-poll";
import type { IncidentDetail } from "@/lib/types";
import { Pill } from "@/components/control/panel";
import { ago } from "@/components/console/ui";
import { cn } from "@/lib/utils";

export default function FixesPage() {
  const list = usePoll(getIncidents, 5000).data ?? [];
  const now = useNow(5000);
  const [details, setDetails] = useState<IncidentDetail[]>([]);
  const ids = list.map((i) => `${i.id}:${i.status}`).join(",");

  useEffect(() => {
    let alive = true;
    Promise.all(list.map((i) => getIncident(i.id).then((r) => r.data).catch(() => null))).then((ds) => {
      if (alive) setDetails(ds.filter((d): d is IncidentDetail => !!d?.resolution?.accepted_fix_id));
    });
    return () => {
      alive = false;
    };
    // refetch when the set of incidents or their statuses change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Fixes</h1>
        <p className="text-muted-foreground mt-1">Every fix Antibody wrote and proved. Nothing merges until a human says the exact phrase.</p>
      </div>
      {!details.length && <p className="text-muted-foreground">No fixes yet.</p>}
      <ul className="space-y-3">
        {details.map((d) => {
          const r = d.resolution!;
          const merged = !!r.merged || d.incident.status === "resolved";
          const waiting = d.incident.status === "awaiting_approval";
          const pr = r.pr_url?.split("/").pop();
          const accepted = (d.attempts ?? []).find((a) => a.accepted);
          const adds = accepted?.fix.diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).length ?? 0;
          const dels = accepted?.fix.diff.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---")).length ?? 0;
          return (
            <li key={d.incident.id} className="border-border bg-card/60 rounded-2xl border p-5 shadow-lg shadow-black/10">
              <div className="flex flex-wrap items-start gap-4">
                <span className={cn("mt-0.5 rounded-full p-2", merged ? "bg-brand/15 text-brand" : "bg-healthy/15 text-healthy")}>
                  {merged ? <GitMerge className="size-4" /> : <GitPullRequest className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <Link href={`/incidents/${encodeURIComponent(d.incident.id)}`} className="text-lg font-medium hover:underline">
                    Fix {d.incident.detection.replace(/^tw_/, "").replaceAll("_", " ")}
                  </Link>
                  <p className="text-muted-foreground mt-0.5 text-sm">
                    {r.accepted_fix_id} · {r.attempts.length} attempt{r.attempts.length === 1 ? "" : "s"} · {d.diagnosis?.target_file}{" "}
                    <span className="text-healthy font-mono">+{adds}</span> <span className="text-infected font-mono">−{dels}</span>
                  </p>
                </div>
                <Pill tone={merged ? "brand" : waiting ? "healthy" : "muted"}>{merged ? "Merged" : waiting ? "Awaiting approval" : d.incident.status}</Pill>
              </div>
              <div className="text-muted-foreground mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <span>
                  must fix <span className="text-infected font-mono">{r.before.must_fix_passed}/{r.before.must_fix_total}</span> →{" "}
                  <span className="text-healthy font-mono">{r.after ? `${r.after.must_fix_passed}/${r.after.must_fix_total}` : "—"}</span>
                </span>
                <span>healthy kept <span className="text-foreground font-mono">{r.after ? `${r.after.must_not_change_passed}/${r.after.must_not_change_total}` : "—"}</span></span>
                {r.approval && (
                  <span className="flex items-center gap-1.5">
                    {r.approval.channel === "voice" ? <Mic className="size-3.5" /> : <Keyboard className="size-3.5" />}
                    approved {r.approval.channel === "voice" ? "by voice" : "typed"} {ago(r.approval.at, now)}
                  </span>
                )}
                <span>${r.cost_usd.toFixed(3)} · {Math.round(r.duration_ms / 1000)}s</span>
                {r.pr_url ? (
                  <a href={r.pr_url} target="_blank" rel="noreferrer" className="text-foreground ml-auto inline-flex items-center gap-1.5 hover:underline">
                    PR #{pr} <ExternalLink className="size-3.5" />
                  </a>
                ) : (
                  <span className="ml-auto text-xs">test incident · not pushed</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
