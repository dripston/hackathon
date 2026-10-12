"use client";

import { Forecasts, GatePanel } from "@/components/control/side-panels";
import { getTrust } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { Page, PageHeader, Panel, Pill, Stats } from "@/components/control/panel";
import { ErrorNote, MockBadge } from "@/components/console/ui";

export default function ImmunityPage() {
  const report = usePoll(getTrust, 15000);
  const trust = report.data;
  const measured = trust?.status === "measured";
  return <Page>
    <PageHeader title="Will the same mistake happen again?" description="Each saved issue contributes cases to replay before a release. These reports show what was checked and what the checks missed." />
    <div className="grid items-start gap-6 lg:grid-cols-2"><GatePanel /><Forecasts /></div>
    <Panel title="How well do the checks catch known bugs?" description="A retrospective replay against deliberately planted bugs, not a production accuracy score." action={<MockBadge show={report.mock} />}>
      <ErrorNote error={report.error} updatedAt={report.updatedAt} />
      {report.loading && <p>Loading replay results…</p>}
      {trust && <div className="space-y-5">
        <div className="flex flex-wrap gap-2"><Pill>{trust.label}</Pill><Pill>{trust.seeded_label}</Pill></div>
        {!measured && <p className="bg-muted rounded-lg p-4 text-sm">Not measured yet. Known bugs are listed below; no catch rate or false alarm rate is available.</p>}
        {measured && <><Stats items={[
          { label: "Planted bugs blocked", value: `${trust.would_have_blocked}/${trust.seeded_bugs.length}`, hint: "From the recorded replay" },
          { label: "Known misses", value: trust.misses.length, hint: "Bugs the gate did not block", tone: trust.misses.length ? "infected" : undefined },
          { label: "False alarms", value: `${trust.false_alarms}/${trust.false_alarm_checks}`, hint: "Clean revisions incorrectly blocked" },
        ]} />{trust.created_at && <p className="text-muted-foreground text-xs">Recorded {trust.created_at}</p>}</>}
        <ul className="divide-border divide-y">{trust.seeded_bugs.map(b => <li key={b.commit + b.check} className="flex flex-wrap items-start gap-3 py-4">
          <div className="min-w-0 flex-1"><p className="font-medium">{b.bug}</p><p className="text-muted-foreground mt-1 text-sm leading-6">{b.note}</p></div>
          <Pill tone={!measured ? "muted" : b.would_have_blocked ? "healthy" : "infected"}>{!measured ? "Not measured" : b.would_have_blocked ? "Would block" : "Missed"}</Pill>
        </li>)}</ul>
      </div>}
    </Panel>
  </Page>;
}
