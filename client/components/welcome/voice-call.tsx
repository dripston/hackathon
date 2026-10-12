"use client";

import Link from "next/link";
import { PhoneCall } from "lucide-react";
import AnimatedContent from "@/components/AnimatedContent";
import { getBrief, getIncident, getIncidents } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { ErrorNote, MockBadge } from "@/components/console/ui";

export function VoiceCall() {
  const incidents = usePoll(getIncidents, 10000);
  const incident = incidents.data?.[0];
  return <section id="incident" className="mx-auto max-w-4xl px-4 py-24 sm:px-6">
    <AnimatedContent distance={40}>
      <p className="font-mono text-xs tracking-widest text-amber-400 uppercase">On-call brief <MockBadge show={incidents.mock} /></p>
      <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">Review the evidence. Make the decision.</h2>
      <ErrorNote error={incidents.error} updatedAt={incidents.updatedAt} />
      {incident ? <IncidentBrief key={incident.id} id={incident.id} /> : <p className="mt-6 text-muted-foreground">{incidents.loading ? "Loading incidents…" : incidents.error ? "Incident data unavailable." : "No incidents recorded yet."}</p>}
    </AnimatedContent>
  </section>;
}
function IncidentBrief({ id }: { id: string }) {
  const brief = usePoll(() => getBrief(id), 10000, id);
  const detail = usePoll(() => getIncident(id), 10000, id);
  const approval = detail.data?.resolution?.approval;
  return <div className="border-border bg-card/50 mt-8 rounded-2xl border p-6">
    <div className="text-muted-foreground flex items-center gap-2 font-mono text-sm"><PhoneCall className="size-4" /> Telegram on-call · {detail.data?.incident.status.replace(/_/g, " ") ?? "loading"} <MockBadge show={brief.mock || detail.mock} /></div>
    <ErrorNote error={brief.error} updatedAt={brief.updatedAt} /><ErrorNote error={detail.error} updatedAt={detail.updatedAt} />
    <p className="mt-4 text-lg leading-8">{brief.data?.text}</p>
    {approval && <p className="mt-4 text-emerald-400">Approved via {approval.channel}: “{approval.phrase}”</p>}
    <Link href={`/incidents/${id}`} className="mt-4 inline-block underline">Inspect this incident →</Link>
  </div>;
}
