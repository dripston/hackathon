"use client";

import Link from "next/link";
import AnimatedContent from "@/components/AnimatedContent";
import { getTrust } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { ErrorNote, LabelBadge, MockBadge } from "@/components/console/ui";

export function Evidence() {
  const report = usePoll(getTrust, 10000);
  const t = report.data;
  const measured = t?.status === "measured";
  const stats = [
    { value: measured ? `${t.would_have_blocked} of ${t.seeded_bugs.length}` : "—", label: "planted bugs the gate would block" },
    { value: measured && t.catch_rate != null ? `${Math.round(t.catch_rate * 100)}%` : "—", label: "planted-bug catch rate" },
    { value: measured ? `${t.false_alarms} of ${t.false_alarm_checks}` : "—", label: "false alarms on clean checks" },
  ];
  return <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
    <AnimatedContent distance={40}><p className="font-mono text-xs tracking-widest text-emerald-400 uppercase">Evidence, not promises <MockBadge show={report.mock} /></p><h2 className="mt-3 max-w-2xl text-3xl font-semibold sm:text-4xl">Backtested, measured on planted bugs, and honest about false alarms.</h2></AnimatedContent>
    <ErrorNote error={report.error} updatedAt={report.updatedAt} />
    <dl className="mt-12 grid gap-4 sm:grid-cols-3">{stats.map(s => <div key={s.label} className="border-border bg-card/40 rounded-2xl border p-6"><dt className="text-muted-foreground text-sm">{s.label}</dt><dd className="mt-2 text-5xl font-semibold">{s.value}</dd></div>)}</dl>
    {t && <div className="mt-4 flex flex-wrap gap-2"><LabelBadge label={t.label} /><LabelBadge label={t.seeded_label} /></div>}
    {t && !measured && <p className="mt-4">Not measured yet.</p>}
    <Link href="/trust" className="mt-4 inline-block underline">Inspect results and misses →</Link>
  </section>;
}
