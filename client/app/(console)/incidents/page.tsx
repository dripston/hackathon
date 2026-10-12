"use client";

import Link from "next/link";
import { ChevronRight, Siren } from "lucide-react";
import { getIncidents } from "@/lib/api";
import { useNow, usePoll } from "@/lib/use-poll";
import { Dot, Empty, Page, PageHeader, Panel, Pill, STATUS_LABEL, STATUS_TONE, Stats, TableHead, label } from "@/components/control/panel";
import { RunButton } from "@/components/control/run-button";
import { ago } from "@/components/console/ui";

const ACTIVE = new Set(["open", "diagnosing", "simulating", "fixing", "awaiting_approval"]);
const COLS = "minmax(0,1fr) 170px 120px 110px 20px";

export default function IncidentsPage() {
  const list = usePoll(getIncidents, 2000);
  const now = useNow(5000);
  const items = list.data ?? [];
  const open = items.filter((i) => ACTIVE.has(i.status)).length;
  const resolved = items.filter((i) => i.status === "resolved").length;

  return (
    <Page>
      <PageHeader
        title="Incidents"
        description="Each one was caught in production, traced to a commit, fixed on a family of variants and approved by a human."
      />
      <Stats
        items={[
          { label: "Open", value: items.length ? open : "—", tone: open ? "brand" : undefined, hint: open ? "Antibody is working on it" : "nothing needs you" },
          { label: "Resolved", value: items.length ? resolved : "—", tone: resolved ? "healthy" : undefined, hint: "merged after approval" },
          { label: "Escalated", value: items.length ? items.filter((i) => i.status === "escalated").length : "—", hint: "handed to a human" },
        ]}
      />
      <Panel flush>
        <TableHead cols={COLS}>
          <span>Incident</span>
          <span>Status</span>
          <span>Opened</span>
          <span>Runs affected</span>
          <span />
        </TableHead>
        {!items.length && (
          <Empty icon={<Siren className="size-5" />} title={list.error ? "Antibody is unreachable" : "No incidents yet"}>
            {list.error ?? "When a silent failure keeps firing, it shows up here. Start a test incident to see the whole flow."}
            {!list.error && <div className="mt-4 flex justify-center"><RunButton /></div>}
          </Empty>
        )}
        <ul className="divide-border divide-y">
          {items.map((i) => {
            const live = ACTIVE.has(i.status);
            return (
              <li key={i.id}>
                <Link
                  href={`/incidents/${encodeURIComponent(i.id)}`}
                  className="group hover:bg-accent/50 grid items-center gap-4 px-5 py-3.5 transition-colors"
                  style={{ gridTemplateColumns: COLS }}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Dot tone={live ? "brand" : i.status === "resolved" ? "healthy" : "infected"} pulse={live} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{label(i.detection)}</span>
                      <span className="text-muted-foreground block truncate font-mono text-xs">{i.id}</span>
                    </span>
                  </span>
                  <span>
                    <Pill tone={STATUS_TONE[i.status]} dot>{STATUS_LABEL[i.status] ?? i.status}</Pill>
                  </span>
                  <span className="text-muted-foreground text-sm">{ago(i.first_seen, now)}</span>
                  <span className="text-muted-foreground font-mono text-sm tabular-nums">{i.trace_ids?.length ?? "—"}</span>
                  <ChevronRight className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      </Panel>
    </Page>
  );
}
