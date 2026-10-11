"use client";

import { getTrust } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { LabelBadge, PageHeader, Panel, PollNote, Stat, stamp } from "@/components/console/ui";
import { cn } from "@/lib/utils";

const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);
const Tick = ({ ok }: { ok: boolean }) => (
  <span className={ok ? "text-healthy" : "text-infected"} aria-label={ok ? "yes" : "no"}>
    {ok ? "✓" : "✗"}
  </span>
);

export default function TrustPage() {
  const trust = usePoll(getTrust, 10_000);
  const t = trust.data;
  const measured = t?.status === "measured" ? t : null;

  return (
    <>
      <PageHeader title="Why believe us" mock={trust.mock}>
        {t?.snapshot && <LabelBadge label="snapshot" />}
        {measured && <LabelBadge label={measured.label.split(" ")[0]} />}
        {measured && <LabelBadge label={measured.seeded_label.split(":")[0]} />}
      </PageHeader>
      <PollNote poll={trust} />
      {trust.loading && <p className="text-muted-foreground">Loading trust report…</p>}

      {t && !measured && (
        <Panel>
          <p className="text-xl">Not measured yet: the backtest runs after the first merge.</p>
          <p className="text-muted-foreground mt-2">No numbers are shown until they come from a real run.</p>
        </Panel>
      )}

      {measured && (
        <>
          <p className="text-muted-foreground mb-4">
            {measured.label}. {measured.seeded_label}
            {measured.created_at && <> Measured {stamp(measured.created_at)}.</>}
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <Stat
              label="Would have blocked before deploy"
              value={`${measured.would_have_blocked} of ${measured.seeded_bugs.length}`}
              tone={measured.would_have_blocked === measured.seeded_bugs.length ? "healthy" : undefined}
            />
            <Stat label="Catch rate" value={pct(measured.catch_rate)} />
            <Stat
              label={`False alarms on ${measured.false_alarm_checks} clean commit${measured.false_alarm_checks === 1 ? "" : "s"}`}
              value={`${measured.false_alarms} of ${measured.false_alarm_checks}`}
              tone={measured.false_alarms === 0 ? "healthy" : "infected"}
            />
          </div>

          <Panel title="Seeded bugs" className="mt-6">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead className="text-muted-foreground text-sm">
                <tr>
                  <th className="pb-3 font-normal">Bug</th>
                  <th className="pb-3 font-normal">Tripwire</th>
                  <th className="pb-3 text-center font-normal">Caught in production</th>
                  <th className="pb-3 text-center font-normal">Gate would block</th>
                  <th className="pb-3 font-normal">Note</th>
                </tr>
              </thead>
              <tbody>
                {measured.seeded_bugs.map((b) => (
                  <tr key={b.commit} className="border-border border-t align-top">
                    <td className="py-3 pr-4">{b.bug}</td>
                    <td className="py-3 pr-4 font-mono text-sm">{b.check}</td>
                    <td className="py-3 text-center">
                      <Tick ok={b.caught_in_production} />
                    </td>
                    <td className="py-3 text-center">
                      <Tick ok={b.would_have_blocked} />
                    </td>
                    <td className={cn("py-3 pl-4 text-sm", b.would_have_blocked ? "text-muted-foreground" : "text-infected")}>{b.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Panel>

          <Panel title={`Misses (${measured.misses.length})`} className="mt-6">
            {measured.misses.length ? (
              <ul className="space-y-3">
                {measured.misses.map((m) => (
                  <li key={m.commit}>
                    <span className="text-infected">{m.bug}</span>
                    <p className="text-muted-foreground">{m.note}</p>
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
