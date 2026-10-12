"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ExternalLink, GitMerge, GitPullRequest, Mic, Keyboard } from "lucide-react";
import { getIncident, getIncidents } from "@/lib/api";
import { useNow, usePoll } from "@/lib/use-poll";
import type { IncidentDetail } from "@/lib/types";
import { Empty, Page, PageHeader, Panel, Pill, Stats, label } from "@/components/control/panel";
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

  const merged = details.filter((d) => !!d.resolution?.merged);
  const cost = details.reduce((a, d) => a + (d.resolution?.cost_usd ?? 0), 0);
  const secs = details.length ? details.reduce((a, d) => a + (d.resolution?.duration_ms ?? 0), 0) / details.length / 1000 : 0;

  return (
    <Page>
      <PageHeader title="Fixes" description="Every fix Antibody wrote and proved. Nothing merges until a human says the exact phrase." />
      <Stats
        items={[
          { label: "Fixes merged", value: details.length ? merged.length : "—", tone: merged.length ? "healthy" : undefined, hint: "each approved by a human" },
          { label: "Avg. time to proven fix", value: details.length ? `${Math.round(secs)}s` : "—", hint: "detection to merge-ready" },
          { label: "Total LLM cost", value: details.length ? `$${cost.toFixed(3)}` : "—", hint: "diagnosis, variants and fixes" },
        ]}
      />
      <Panel flush>
        {!details.length && (
          <Empty icon={<GitPullRequest className="size-5" />} title="No fixes yet">
            When Antibody proves a fix, it shows up here as a pull request waiting for your approval.
          </Empty>
        )}
        <ul className="divide-border divide-y">
          {details.map((d) => {
            const r = d.resolution!;
            const isMerged = !!r.merged;
            const waiting = d.incident.status === "awaiting_approval";
            const pr = r.pr_url?.split("/").pop();
            const accepted = (d.attempts ?? []).find((a) => a.accepted);
            const adds = accepted?.fix.diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).length ?? 0;
            const dels = accepted?.fix.diff.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---")).length ?? 0;
            return (
              <li key={d.incident.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start gap-4">
                  <span className={cn("mt-0.5 grid size-8 place-items-center rounded-lg border", isMerged ? "border-brand/25 bg-brand/10 text-brand" : "border-healthy/25 bg-healthy/10 text-healthy")}>
                    {isMerged ? <GitMerge className="size-4" /> : <GitPullRequest className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/incidents/${encodeURIComponent(d.incident.id)}`} className="text-sm font-medium hover:underline">
                        Fix: {label(d.incident.detection).toLowerCase()}
                      </Link>
                      <Pill tone={isMerged ? "brand" : waiting ? "healthy" : "muted"}>{isMerged ? "Merged" : waiting ? "Awaiting approval" : d.incident.status}</Pill>
                    </div>
                    <p className="text-muted-foreground mt-1 truncate font-mono text-xs">
                      {d.diagnosis?.target_file} <span className="text-healthy">+{adds}</span> <span className="text-infected">−{dels}</span> · {r.accepted_fix_id} · {r.attempts.length} attempt
                      {r.attempts.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  {r.pr_url ? (
                    <a href={r.pr_url} target="_blank" rel="noreferrer" className="border-border hover:bg-accent inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors">
                      PR #{pr} <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground text-xs">No pull request recorded</span>
                  )}
                </div>
                <div className="mt-3 ml-12 flex flex-wrap items-center gap-2 text-xs">
                  <Chip>
                    Must fix <span className="text-infected font-mono">{r.before.must_fix_passed}/{r.before.must_fix_total}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="text-healthy font-mono">{r.after ? `${r.after.must_fix_passed}/${r.after.must_fix_total}` : "—"}</span>
                  </Chip>
                  <Chip>
                    Healthy unchanged <span className="text-foreground font-mono">{r.after ? `${r.after.must_not_change_passed}/${r.after.must_not_change_total}` : "—"}</span>
                  </Chip>
                  {r.approval && (
                    <Chip>
                      {r.approval.channel === "voice" ? <Mic className="size-3" /> : <Keyboard className="size-3" />}
                      Approved {r.approval.channel === "voice" ? "by voice" : "in text"} {ago(r.approval.at, now)}
                    </Chip>
                  )}
                  <Chip>
                    <span className="text-foreground font-mono">${r.cost_usd.toFixed(3)}</span> · {Math.round(r.duration_ms / 1000)}s
                  </Chip>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>
    </Page>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="border-border bg-muted/40 text-muted-foreground inline-flex items-center gap-1.5 rounded-md border px-2 py-1">{children}</span>;
}
