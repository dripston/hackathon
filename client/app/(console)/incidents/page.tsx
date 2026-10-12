"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getIncidents } from "@/lib/api";
import { useNow, usePoll } from "@/lib/use-poll";
import { Page, PageHeader, Panel, Pill, STATUS_LABEL, STATUS_TONE, label } from "@/components/control/panel";
import { ago, ErrorNote, MockBadge } from "@/components/console/ui";

export default function IncidentsPage() {
  const list = usePoll(getIncidents, 3000);
  const now = useNow(5000);
  const [filter, setFilter] = useState("all");
  const rows = (list.data ?? []).filter(i => filter === "all" || (filter === "review" ? ["awaiting_approval", "escalated"].includes(i.status) : i.status === "resolved"));
  return <Page><PageHeader title="Understand each issue." description="Follow a failure from the first signal to the proposed fix. Issues needing your review are one click away." actions={<MockBadge show={list.mock} />} />
    <div className="flex flex-wrap gap-2">{[{ id: "all", name: "All issues" }, { id: "review", name: "Needs your attention" }, { id: "resolved", name: "Resolved" }].map(f => <button key={f.id} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className={`rounded-lg border px-4 py-2 text-sm ${filter === f.id ? "bg-foreground text-background" : "text-muted-foreground"}`}>{f.name}</button>)}</div>
    <ErrorNote error={list.error} updatedAt={list.updatedAt} />
    <Panel>{list.loading && <p>Loading issues…</p>}{list.data && rows.length === 0 && !list.error && <p className="text-muted-foreground py-8 text-center">{filter === "all" ? "No incidents recorded yet. Repeated check failures will appear here." : "No issues match this view."}</p>}
      <ul className="divide-border divide-y">{rows.map(i => <li key={i.id}><Link href={`/incidents/${encodeURIComponent(i.id)}`} className="group block py-5 first:pt-0"><div className="mb-3 flex flex-wrap items-center gap-3"><Pill tone={STATUS_TONE[i.status]}>{STATUS_LABEL[i.status]}</Pill><span className="text-muted-foreground text-sm">Opened {ago(i.first_seen, now)}</span></div><div className="flex items-center justify-between gap-4"><h2 className="text-lg font-medium">{label(i.detection)}</h2><ArrowRight className="size-5 shrink-0 transition-transform group-hover:translate-x-1" /></div><p className="text-muted-foreground mt-2 text-sm">{i.trace_ids.length} linked traces · {i.workflow} · {i.status === "awaiting_approval" ? "Review the tested fix and make a decision" : i.status === "escalated" ? "Human help needed to continue" : "View the investigation and evidence"}</p></Link></li>)}</ul>
    </Panel>
  </Page>;
}
