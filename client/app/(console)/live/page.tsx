"use client";

import Link from "next/link";
import { ArrowRight, Check, Search, ShieldCheck, Wrench } from "lucide-react";
import { getGate, getIncidents, getOverview, getRuns, getSystemInfo } from "@/lib/api";
import { useNow, usePoll } from "@/lib/use-poll";
import { Page, PageHeader, Panel, Pill, Stats, STATUS_LABEL, STATUS_TONE, label, btn } from "@/components/control/panel";
import { ErrorNote, MockBadge, ago } from "@/components/console/ui";
import { DrillBar } from "@/components/control/drill-bar";

export default function Overview() {
  const overview = usePoll(getOverview, 3000);
  const incidents = usePoll(getIncidents, 3000);
  const runs = usePoll(() => getRuns(5), 5000);
  const gate = usePoll(getGate, 5000);
  const info = usePoll(getSystemInfo, 30000);
  const now = useNow(5000);
  const o = overview.data;
  const needingDecision = incidents.data?.filter(i => ["awaiting_approval", "escalated"].includes(i.status)) ?? [];
  const inProgress = incidents.data?.filter(i => !["resolved", "awaiting_approval", "escalated"].includes(i.status)) ?? [];
  const featured = [...needingDecision, ...inProgress, ...(incidents.data?.filter(i => i.status === "resolved") ?? [])].slice(0, 3);
  return <Page wide>
    <PageHeader title="Know what your agent is doing." description="Antibody finds answers that look successful but are wrong, investigates the cause, and tests a fix for you to review." meta={<><span>YOUR AGENT, AT A GLANCE</span><MockBadge show={overview.mock || incidents.mock} /></>} />
    <section className="border-border bg-card grid overflow-hidden rounded-2xl border lg:grid-cols-[1.1fr_1fr]">
      <div className="p-6 sm:p-8">
        <p className="text-muted-foreground text-sm">What we’re protecting</p>
        <h2 className="mt-2 text-2xl font-semibold">{info.data?.agent.name ?? "Your connected agent"}</h2>
        <p className="text-muted-foreground mt-3 max-w-xl leading-7">{info.data?.agent.description ?? "Agent details appear here when the workspace responds."}</p>
        <ErrorNote error={info.error} updatedAt={info.updatedAt} />
        {info.data && <div className="mt-5 flex flex-wrap gap-2"><Pill>{info.data.agent.data_mode === "replay" ? "RECORDED · tool data" : `${info.data.agent.data_mode.toUpperCase()} · tool data`}</Pill><Pill>{info.data.agent.llm.model || "Model not configured"}</Pill></div>}
        <Link href="/agents" className="mt-5 inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4">See agent and checks <ArrowRight className="size-4" /></Link>
      </div>
      <div className="border-border bg-sidebar/40 border-t p-6 sm:p-8 lg:border-l lg:border-t-0">
        <p className="text-muted-foreground text-sm">How Antibody helps</p>
        <ol className="mt-5 space-y-5">{[
          { icon: Search, title: "Find the failure", text: "Compare the answer with what its tools actually returned." },
          { icon: Wrench, title: "Test a repair", text: "Reproduce the problem and check related cases still work." },
          { icon: ShieldCheck, title: "You review. Antibody remembers.", text: "Approve the fix; keep its tests to catch the same mistake again." },
        ].map(({ icon: Icon, title, text }, i) => <li key={title} className="flex gap-4"><span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg"><Icon className="size-4" /></span><div><p className="font-medium">{i + 1}. {title}</p><p className="text-muted-foreground mt-1 text-sm leading-6">{text}</p></div></li>)}</ol>
      </div>
    </section>
    <ErrorNote error={overview.error} updatedAt={overview.updatedAt} />
    <Stats items={[
      { label: "Agent runs", value: o?.runs_last_10_min ?? "—", hint: "In the last 10 minutes" },
      { label: "Runs with a detected failure", value: o?.silent_failures_last_10_min ?? "—", hint: o?.silent_failure_rate == null ? "No rate available yet" : `${Math.round(o.silent_failure_rate * 100)}% of recent runs`, tone: o?.silent_failures_last_10_min ? "infected" : undefined },
      { label: "Fixes awaiting your review", value: o?.awaiting_approval ?? "—", hint: "Nothing merges without approval", tone: o?.awaiting_approval ? "brand" : undefined },
      { label: "Latest release check", value: gate.error ? "Unavailable" : gate.loading ? "Loading…" : !gate.data ? "Not checked" : gate.data.verdict === "safe" ? "Passed" : "Blocked", hint: gate.error ? "Report unavailable" : gate.data ? `${gate.data.families.length} saved test groups` : "No result to claim yet", tone: gate.error ? undefined : gate.data?.verdict === "blocked" ? "infected" : gate.data ? "healthy" : undefined },
    ]} />
    <div className="grid items-start gap-6 xl:grid-cols-[1.3fr_1fr]">
      <Panel title="Needs your attention" description="Start here. Review a proposed fix or help with an unresolved issue." action={<MockBadge show={incidents.mock} />}>
        <ErrorNote error={incidents.error} updatedAt={incidents.updatedAt} />
        {incidents.loading && <p className="text-muted-foreground">Loading issues…</p>}
        {incidents.data && !incidents.error && needingDecision.length === 0 && <p className="bg-healthy/5 mb-5 flex gap-3 rounded-lg p-4 text-sm"><Check className="text-healthy size-5 shrink-0" />No human decisions waiting.{inProgress.length ? ` Antibody is working on ${inProgress.length} issue(s).` : " Recent issues are shown below."}</p>}
        <ul className="divide-border divide-y">{featured.map(i => <li key={i.id} className="py-4 first:pt-0">
          <div className="mb-2 flex flex-wrap items-center gap-2"><Pill tone={STATUS_TONE[i.status]}>{STATUS_LABEL[i.status]}</Pill><span className="text-muted-foreground text-xs">{ago(i.first_seen, now)}</span></div>
          <Link href={`/incidents/${encodeURIComponent(i.id)}`} className="group flex items-center justify-between gap-4 font-medium leading-6">{label(i.detection)}<ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-1" /></Link>
          <p className="text-muted-foreground mt-2 text-sm">{i.status === "awaiting_approval" ? "A candidate passed its checks. Open the issue to review the evidence." : i.status === "escalated" ? "Antibody needs help. Inspect the attempted fixes and what failed." : i.status === "resolved" ? "Open the record to see the outcome and approval." : "Follow the investigation and repair progress."}</p>
        </li>)}</ul>
        {incidents.data?.length === 0 && !incidents.error && <p className="text-muted-foreground text-sm">No issues recorded yet. Repeated check failures will appear here.</p>}
        <Link href="/incidents" className={`${btn.secondary} mt-5`}>View all issues <ArrowRight className="size-4" /></Link>
      </Panel>
      <Panel title="Recent agent activity" description="The latest answers and their checks." action={<MockBadge show={runs.mock} />}>
        <ErrorNote error={runs.error} updatedAt={runs.updatedAt} />
        {runs.loading && <p>Loading activity…</p>}
        <ul className="divide-border divide-y">{runs.data?.map(r => <li key={r.run.run_id} className="flex flex-wrap items-center justify-between gap-2 py-4 first:pt-0"><div><p className="font-medium">{r.run.input.domain}</p><p className="text-muted-foreground mt-1 text-xs">{r.run.output ? "Research brief returned" : "No brief returned"} · {ago(r.run.started_at, now)}</p></div><Pill tone={r.score.violations.length ? "infected" : "muted"}>{r.score.violations.length ? "Issue detected" : "No violations recorded"}</Pill></li>)}</ul>
        {runs.data?.length === 0 && <p className="text-muted-foreground">No agent runs recorded yet.</p>}
        <Link href="/traffic" className="mt-5 inline-flex items-center gap-2 text-sm underline underline-offset-4">Explore answers and checks <ArrowRight className="size-4" /></Link>
      </Panel>
    </div>
    <ErrorNote error={gate.error} updatedAt={gate.updatedAt} />
    <details className="border-border rounded-xl border p-5"><summary className="cursor-pointer font-medium">Want to see the full process? Run an isolated demonstration.</summary><p className="text-muted-foreground my-4 text-sm leading-6">This deliberately introduces a bug in a separate copy. It can use model credits. Demonstration results are separate from normal monitoring.</p><DrillBar /></details>
  </Page>;
}
