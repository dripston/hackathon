"use client";

import { getTrust } from "@/lib/api";
import type { TrustMeasured } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";
import { ErrorNote, LabelBadge, PageHeader, Panel, Stat } from "@/components/console/ui";

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export default function TrustPage() {
  const trust = usePoll(getTrust, 0);
  const t = trust.data;
  const measured = t && "label" in t ? (t as TrustMeasured) : null;

  return (
    <>
      <PageHeader title="Why believe us">{measured && <LabelBadge label={measured.label} />}</PageHeader>
      <ErrorNote error={trust.error} />
      {trust.loading && <p className="text-muted-foreground">Loading trust report…</p>}

      {t && !measured && (
        <Panel>
          <p className="text-xl">Not measured yet.</p>
          <p className="text-muted-foreground mt-2">
            This page fills in from <code className="font-mono">evidence/trust.json</code> once the backtest, planted-bug run and
            false-alarm run are done. No numbers are shown until they come from a real run.
          </p>
        </Panel>
      )}

      {measured && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Stat
              label="Would have blocked (seeded bug commits)"
              value={`${measured.would_have_blocked.caught}/${measured.would_have_blocked.total}`}
            />
            <Stat
              label="Planted bugs caught"
              value={pct(measured.planted_bugs.caught, measured.planted_bugs.total)}
            />
            <Stat
              label="False alarms on harmless changes"
              value={`${measured.false_alarms.alarms}/${measured.false_alarms.harmless_changes}`}
            />
          </div>
          {measured.would_have_blocked.notes && (
            <p className="text-muted-foreground mt-4">{measured.would_have_blocked.notes}</p>
          )}
          <Panel title={`Misses (${measured.planted_bugs.misses.length})`} className="mt-6">
            {measured.planted_bugs.misses.length ? (
              <ul className="space-y-3">
                {measured.planted_bugs.misses.map((m) => (
                  <li key={m.bug}>
                    <span className="text-infected font-mono">{m.bug}</span>
                    <p className="text-muted-foreground">{m.why}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No misses recorded.</p>
            )}
          </Panel>
        </>
      )}
    </>
  );
}
