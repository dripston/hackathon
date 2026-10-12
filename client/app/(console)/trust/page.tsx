"use client";

import Link from "next/link";
import { getTrust } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { ErrorNote, LabelBadge, PageHeader, Panel, Stat, MockBadge } from "@/components/console/ui";

const pct = (value: number | null) => value == null ? "—" : `${Math.round(value * 100)}%`;
export default function TrustPage() {
  const trust = usePoll(getTrust);
  const t = trust.data;
  return <>
    <PageHeader title="Why believe us" mock={trust.mock} />
    <ErrorNote error={trust.error} updatedAt={trust.updatedAt} />
    {trust.loading && <p>Loading trust report…</p>}
    {t && <>
      <div className="mb-5 flex flex-wrap gap-2"><LabelBadge label={t.label} /><LabelBadge label={t.seeded_label} /></div>
      {t.status === "not_measured_yet" ? <Panel>Not measured yet: the backtest runs after the first merge.</Panel> : <>
        <div className="grid gap-4 md:grid-cols-3">
          <Stat label="Would have blocked · planted bugs" value={`${t.would_have_blocked} of ${t.seeded_bugs.length}`} />
          <Stat label="Planted-bug catch rate" value={pct(t.catch_rate)} />
          <Stat label={`False alarms · ${pct(t.false_alarm_rate)}`} value={`${t.false_alarms} of ${t.false_alarm_checks}`} />
        </div>
        <p className="text-muted-foreground mt-3 text-sm">Measured against seeded bugs and {t.false_alarm_checks} clean checks. {t.created_at && `Recorded ${new Date(t.created_at).toLocaleString()}.`}</p>
      </>}
      <Panel title="Seeded bugs" className="mt-6"><ul className="space-y-5">{t.seeded_bugs.map(b => <li key={b.commit}>
        <p className="font-medium">{b.bug}</p><p className="text-muted-foreground break-all font-mono text-sm">{b.check} · {b.commit.slice(0, 10)}</p>
        <p>Caught in monitored traffic: {b.caught_in_production ? "yes" : "no"} · Gate would block: {t.status !== "measured" ? "not measured" : b.would_have_blocked ? "yes" : "no"}</p>
        <p className="text-muted-foreground">{b.note}</p>{b.incident_id && <Link href={`/incidents/${b.incident_id}`} className="underline">View incident →</Link>}
      </li>)}</ul></Panel>
      {t.status === "measured" && <Panel title={`Misses (${t.misses.length})`} className="mt-6">
        {t.misses.length ? <ul className="space-y-3">{t.misses.map(m => <li key={m.commit}><p className="text-infected">{m.bug}</p><p>{m.note}</p></li>)}</ul> : <p>No misses recorded.</p>}
      </Panel>}
      {t.families.length > 0 && <Panel title="Backtest families" className="mt-6"><ul className="space-y-4">{t.families.map(f => <li key={f.incident_id}><MockBadge show={f.mock} /><Link className="break-all underline" href={`/incidents/${f.incident_id}`}>{f.incident_id}</Link><p>{f.bad}</p><p className="text-muted-foreground">Clean parent: {f.parent}</p></li>)}</ul></Panel>}
    </>}
  </>;
}
