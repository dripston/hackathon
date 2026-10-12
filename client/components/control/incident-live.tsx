"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAftercare, getBrief, getGate, getIncident, getTrust } from "@/lib/api";
import { useNow, usePoll } from "@/lib/use-poll";
import { IncidentStages, currentStage, stageStates } from "@/components/story/incident-player";
import { Pill, STATUS_LABEL, STATUS_TONE } from "@/components/control/panel";
import { ago } from "@/components/console/ui";

/** One incident, live: the same six stages as the landing replay, following the pipeline in real time. */
export function IncidentLive({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const detail = usePoll(() => getIncident(id), 2000, id);
  const brief = usePoll(() => getBrief(id), 5000, id);
  const trust = usePoll(getTrust, 15000);
  const gate = usePoll(getGate, 5000);
  const after = usePoll(getAftercare, 3000);
  const now = useNow(1000);
  const d = detail.data;
  const [stage, setStage] = useState<number | null>(null);
  const follow = useRef(true);
  const cur = d ? currentStage(d) : 0;

  // Follow the pipeline until the viewer clicks a stage themselves.
  useEffect(() => {
    if (d && follow.current) setStage(cur);
  }, [d, cur]);

  if (!d)
    return (
      <p className="text-muted-foreground">
        {detail.error ? `Couldn't load ${id}: ${detail.error}` : `Loading ${id}…`}
      </p>
    );

  const active = !["resolved", "escalated"].includes(d.incident.status);
  return (
    <div>
      <Link href="/live" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft className="size-4" /> Mission control
      </Link>
      <div className="mt-4 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow flex items-center gap-2">
            {active && <span className="bg-infected animate-vital size-1.5 rounded-full" />}
            Incident · opened {ago(d.incident.first_seen, now)}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            <span className="text-infected">{d.incident.detection}</span>
          </h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm">{d.incident.id}</p>
        </div>
        <Pill tone={STATUS_TONE[d.incident.status]}>{STATUS_LABEL[d.incident.status] ?? d.incident.status}</Pill>
      </div>
      <IncidentStages
        ctx={{ detail: d, brief: brief.data?.text, trust: trust.data, gate: gate.data, aftercare: after.data, live: true, onChanged: detail.refresh }}
        stage={stage ?? cur}
        onStage={(i) => {
          follow.current = i === cur;
          setStage(i);
        }}
        states={stageStates(d)}
      />
    </div>
  );
}
