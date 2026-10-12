"use client";

import Link from "next/link";
import { Bot, Plus, Wrench } from "lucide-react";
import { getIncidents, getRuns, getSystemInfo } from "@/lib/api";
import { useNow, usePoll } from "@/lib/use-poll";
import { ago } from "@/components/console/ui";
import { Page, PageHeader, Panel, Pill, Stats, btn, label } from "@/components/control/panel";
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
    <Page>
      <PageHeader
        title="Agents"
        description="The AI agents Antibody watches in production."
        actions={
          <Link href="/connect" className={btn.secondary}>
            <Plus className="size-4" /> Connect an agent
          </Link>
        }
      />

      {!a && <p className="text-muted-foreground text-sm">Loading…</p>}
      {a && (
        <>
          <Panel>
            <div className="flex flex-wrap items-start gap-4">
              <span className="border-border bg-muted/60 grid size-12 place-items-center rounded-xl border">
                <Bot className="size-6" strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-lg font-semibold tracking-tight">{a.name}</h2>
                  <Pill tone="healthy" dot>Monitored</Pill>
                  <Pill>Production</Pill>
                </div>
                <p className="text-muted-foreground mt-1 text-sm">{a.description}</p>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                  <Meta k="Workflow" v={a.workflow} />
                  <Meta k="Model" v={`${a.llm.provider} · ${a.llm.model}`} />
                  <Meta k="Prompt" v={a.prompt_version} />
                  <Meta k="Tool data" v={a.data_mode === "replay" ? "recorded responses" : "live"} />
                </div>
              </div>
            </div>
          </Panel>

          <Stats
            items={[
              { label: "Health", value: health == null ? "—" : `${health}%`, hint: `clean runs, last ${runs.length}`, tone: health != null && health >= 95 ? "healthy" : health != null ? "infected" : undefined },
              { label: "Grounding (Jev)", value: grounded == null ? "—" : grounded.toFixed(2), hint: "average score, 0 to 1" },
              { label: "Incidents", value: incidents.length, hint: `${incidents.filter((i) => i.status === "resolved").length} fixed` },
              { label: "Last incident", value: incidents[0] ? ago(incidents[0].first_seen, now) : "never", hint: incidents[0] ? label(incidents[0].detection) : "" },
            ]}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Tools" description="What the agent calls on every request" flush>
              <ul className="divide-border divide-y">
                {a.tools.map((t) => (
                  <li key={t} className="flex items-center gap-3 px-5 py-3">
                    <Wrench className="text-muted-foreground size-4" strokeWidth={1.75} />
                    <span className="font-mono text-[13px]">{t}</span>
                    <span className="text-muted-foreground ml-auto text-xs">{a.data_mode === "replay" ? "recorded" : "live"}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Checks on every run" description="Tripwires open incidents; Jev is advisory" flush>
              <ul className="divide-border divide-y">
                {a.checks.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                    <span className={cn("size-1.5 rounded-full", c.kind === "tripwire" ? "bg-healthy" : "bg-brand")} />
                    <span className="text-sm">{c.label}</span>
                    <span className="ml-auto">
                      <Pill tone={c.kind === "tripwire" ? undefined : "brand"}>{c.kind === "tripwire" ? "Opens incidents" : "Advisory"}</Pill>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}
    </Page>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <span>
      <span className="text-muted-foreground">{k} </span>
      <span className="font-mono">{v}</span>
    </span>
  );
}
