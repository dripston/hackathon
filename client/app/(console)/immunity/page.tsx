"use client";

import { Forecasts, GatePanel } from "@/components/control/side-panels";
import { getTrust } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { Page, PageHeader, Panel, Pill } from "@/components/control/panel";
import { cn } from "@/lib/utils";

export default function ImmunityPage() {
  const trust = usePoll(getTrust, 15000).data;
  return (
    <Page>
      <PageHeader title="Guardrails" description="Every fixed incident becomes a family of tests that guards future deploys, plus forecasts of what is about to break." />
      <div className="grid gap-6 lg:grid-cols-2">
        <GatePanel />
        <Forecasts />
      </div>
      <Panel title="Backtest on planted bugs" description="Why the gate can be trusted" flush>
        {!trust && <p className="text-muted-foreground p-5 text-sm">Loading…</p>}
        {trust && (
          <div>
            <p className="text-muted-foreground border-border border-b px-5 py-3.5 text-sm">
              The gate would have blocked <span className="text-foreground font-medium">{trust.would_have_blocked} of {trust.seeded_bugs.length}</span> planted bugs before deploy, with{" "}
              <span className="text-foreground font-medium">{trust.false_alarms} false alarm{trust.false_alarms === 1 ? "" : "s"}</span> on {trust.false_alarm_checks} clean commit{trust.false_alarm_checks === 1 ? "" : "s"}.
            </p>
            <ul className="divide-border divide-y">
              {trust.seeded_bugs.map((b) => (
                <li key={b.commit} className="flex items-start gap-3 px-5 py-3.5">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", b.would_have_blocked ? "bg-healthy" : "bg-muted-foreground")} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{b.bug}</span>
                    <span className="text-muted-foreground text-sm">{b.note}</span>
                  </span>
                  <Pill tone={b.would_have_blocked ? "healthy" : "muted"} dot>{b.would_have_blocked ? "Blocked" : "Missed"}</Pill>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>
    </Page>
  );
}
