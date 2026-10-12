"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getIncidents } from "@/lib/api";
import { useNow, usePoll } from "@/lib/use-poll";
import { Pill, STATUS_LABEL, STATUS_TONE } from "@/components/control/panel";
import { ago } from "@/components/console/ui";
import { cn } from "@/lib/utils";

const ACTIVE = new Set(["open", "diagnosing", "simulating", "fixing", "awaiting_approval"]);

export default function IncidentsPage() {
  const list = usePoll(getIncidents, 2000);
  const now = useNow(5000);
  const items = list.data ?? [];
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Incidents</h1>
        <p className="text-muted-foreground mt-1">Each one: caught in production, traced to a commit, fixed on a family of variants, approved by a human.</p>
      </div>
      {!items.length && <p className="text-muted-foreground">{list.error ? `Antibody unreachable: ${list.error}` : "No incidents yet."}</p>}
      <ul className="space-y-3">
        {items.map((i) => {
          const live = ACTIVE.has(i.status);
          return (
            <li key={i.id}>
              <Link
                href={`/incidents/${encodeURIComponent(i.id)}`}
                className={cn(
                  "group border-border bg-card/60 hover:bg-card flex items-center gap-5 rounded-2xl border p-5 shadow-lg shadow-black/10 transition-colors",
                  live && "border-brand/30",
                )}
              >
                <span className={cn("size-2.5 shrink-0 rounded-full", live ? "bg-brand animate-pulse" : i.status === "resolved" ? "bg-healthy" : "bg-infected")} />
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-medium">{i.detection.replace(/^tw_/, "").replaceAll("_", " ")}</span>
                  <span className="text-muted-foreground font-mono text-xs">{i.id} · opened {ago(i.first_seen, now)}</span>
                </span>
                <Pill tone={STATUS_TONE[i.status]}>{STATUS_LABEL[i.status] ?? i.status}</Pill>
                <ArrowRight className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
