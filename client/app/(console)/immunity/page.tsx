"use client";

import { Forecasts, GatePanel } from "@/components/control/side-panels";
import { getTrust } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { Panel } from "@/components/control/panel";
import { cn } from "@/lib/utils";

export default function ImmunityPage() {
  const trust = usePoll(getTrust, 15000).data;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Immunity</h1>
        <p className="text-muted-foreground mt-1">Every fixed incident becomes a family of tests that guards future deploys, plus forecasts of what is about to break.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <GatePanel />
        <Forecasts />
      </div>
      <Panel title="Why believe it · backtest on planted bugs">
        {!trust && <p className="text-muted-foreground text-sm">Loading…</p>}
        {trust && (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">
              The gate would have blocked <span className="text-foreground font-medium">{trust.would_have_blocked} of {trust.seeded_bugs.length}</span> planted bugs before deploy, with{" "}
              <span className="text-foreground font-medium">{trust.false_alarms} false alarm{trust.false_alarms === 1 ? "" : "s"}</span> on {trust.false_alarm_checks} clean commit{trust.false_alarm_checks === 1 ? "" : "s"}.
            </p>
            <ul className="space-y-2">
              {trust.seeded_bugs.map((b) => (
                <li key={b.commit} className="border-border flex items-start gap-3 rounded-xl border p-3">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", b.would_have_blocked ? "bg-healthy" : "bg-muted-foreground")} />
                  <span className="min-w-0 flex-1">
                    <span className="block">{b.bug}</span>
                    <span className="text-muted-foreground text-sm">{b.note}</span>
                  </span>
                  <span className={cn("text-sm", b.would_have_blocked ? "text-healthy" : "text-muted-foreground")}>{b.would_have_blocked ? "blocked" : "missed"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>
    </div>
  );
}
