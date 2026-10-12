"use client";

import Link from "next/link";
import { Bot, Plus, Wrench } from "lucide-react";
import { getIncidents, getRuns, getSystemInfo } from "@/lib/api";
import { useNow, usePoll } from "@/lib/use-poll";
import { ago } from "@/components/console/ui";
import { cn } from "@/lib/utils";

export default function AgentsPage() {
  const info = usePoll(getSystemInfo, 30000).data;
  const runs = usePoll(() => getRuns(200), 10000).data ?? [];
  const incidents = usePoll(getIncidents, 10000).data ?? [];
  const now = useNow(10000);
  const clean = runs.filter((r) => !r.score.violations.length).length;
  const health = runs.length ? Math.round((clean / runs.length) * 100) : null;
  const jevs = runs.map((r) => r.score.checks.find((c) => c.id === "jev_grounded")?.score).filter((x): x is number => x != null);
  const grounded = jevs.length ? jevs.reduce((a, b) => a + b, 0) / jevs.length : null;
  const a = info?.agent;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Agents</h1>
          <p className="text-muted-foreground mt-1">The AI agents Antibody watches in production.</p>
        </div>
        <Link href="/connect" className="border-border hover:bg-accent inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors">
          <Plus className="size-4" /> Connect an agent
        </Link>
      </div>

      {!a && <p className="text-muted-foreground">Loading…</p>}
      {a && (
        <section className="border-border bg-card/60 rounded-3xl border p-7 shadow-lg shadow-black/10">
          <div className="flex flex-wrap items-start gap-5">
            <span className="bg-brand/15 text-brand grid size-14 place-items-center rounded-2xl">
              <Bot className="size-7" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-semibold">{a.name}</h2>
                <span className="bg-healthy/15 text-healthy rounded-full px-2.5 py-0.5 text-xs font-medium">monitored</span>
              </div>
              <p className="text-muted-foreground mt-1">{a.description}</p>
              <p className="text-muted-foreground mt-2 font-mono text-xs">
                workflow {a.workflow} · {a.llm.provider} {a.llm.model} · prompt {a.prompt_version}
              </p>
            </div>
          </div>

          <div className="mt-7 grid gap-4 sm:grid-cols-4">
            <Stat label="Health" value={health == null ? "—" : `${health}%`} hint={`of the last ${runs.length} runs had no silent failure`} good={health != null && health >= 95} />
            <Stat label="Grounding (Jev)" value={grounded == null ? "—" : grounded.toFixed(2)} hint="avg score, 0–1" />
            <Stat label="Incidents" value={String(incidents.length)} hint={`${incidents.filter((i) => i.status === "resolved").length} fixed`} />
            <Stat label="Last incident" value={incidents[0] ? ago(incidents[0].first_seen, now) : "never"} hint={incidents[0]?.detection.replace(/^tw_/, "").replaceAll("_", " ") ?? ""} />
          </div>

          <div className="mt-7 grid gap-6 lg:grid-cols-2">
            <div>
              <p className="text-sm font-medium">Tools</p>
              <ul className="mt-3 space-y-2">
                {a.tools.map((t) => (
                  <li key={t} className="border-border flex items-center gap-3 rounded-xl border px-3 py-2.5">
                    <Wrench className="text-muted-foreground size-4" />
                    <span className="font-mono text-sm">{t}</span>
                    <span className="text-muted-foreground ml-auto text-xs">{a.data_mode === "replay" ? "recorded responses" : "live"}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium">Checks on every run</p>
              <ul className="mt-3 space-y-2">
                {a.checks.map((c) => (
                  <li key={c.id} className="border-border flex items-center gap-3 rounded-xl border px-3 py-2.5">
                    <span className={cn("size-2 rounded-full", c.kind === "tripwire" ? "bg-healthy" : "bg-brand")} />
                    <span className="text-sm">{c.label}</span>
                    <span className="text-muted-foreground ml-auto text-xs">{c.kind === "tripwire" ? "opens incidents" : "advisory score"}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, hint, good }: { label: string; value: string; hint: string; good?: boolean }) {
  return (
    <div className="border-border bg-background/40 rounded-2xl border p-4">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className={cn("mt-1.5 text-2xl font-semibold", good && "text-healthy")}>{value}</p>
      <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
    </div>
  );
}
