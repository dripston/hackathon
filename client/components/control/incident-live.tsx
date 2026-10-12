"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Loader2, X } from "lucide-react";
import { getAftercare, getBrief, getGate, getIncident, getTrust } from "@/lib/api";
import { useNow, usePoll } from "@/lib/use-poll";
import { useEvents } from "@/lib/use-events";
import { IncidentStages, STAGES, currentStage, stageStates } from "@/components/story/incident-player";
import { Pill, STATUS_LABEL, STATUS_TONE } from "@/components/control/panel";
import { ago } from "@/components/console/ui";
import { Terminal } from "@/components/workspace/terminal";
import { Editor } from "@/components/workspace/editor";
import { Tests } from "@/components/workspace/tests";
import { PullRequest } from "@/components/workspace/pull-request";
import { cn } from "@/lib/utils";

/** One incident, live: a workspace showing Antibody's real work as it happens, plus the six-stage summary. */
export function IncidentLive({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const detail = usePoll(() => getIncident(id), 2000, id);
  const brief = usePoll(() => getBrief(id), 5000, id);
  const trust = usePoll(getTrust, 15000);
  const gate = usePoll(getGate, 5000);
  const after = usePoll(getAftercare, 3000);
  const events = useEvents(id);
  const now = useNow(1000);
  const d = detail.data;
  const [view, setView] = useState<"workspace" | "summary" | null>(null);
  const [stage, setStage] = useState<number | null>(null);
  // Events present on first load are history: shown instantly. Anything after that animates in.
  const freshFrom = useRef<number | null>(null);
  if (freshFrom.current === null && detail.data) freshFrom.current = (events[events.length - 1]?.seq ?? 0) + 1;

  useEffect(() => {
    if (view === null && d) setView(events.length || !["resolved", "escalated"].includes(d.incident.status) ? "workspace" : "summary");
  }, [view, d, events.length]);

  if (!d) return <p className="text-muted-foreground">{detail.error ? `Couldn't load ${id}: ${detail.error}` : `Loading ${id}…`}</p>;

  const states = stageStates(d);
  const cur = currentStage(d);
  const active = !["resolved", "escalated"].includes(d.incident.status);

  return (
    <div>
      <Link href="/incidents" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft className="size-4" /> Incidents
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            {active && <span className="bg-brand size-2 animate-pulse rounded-full" />}
            {active ? "Antibody is working on this now" : "Incident"} · opened {ago(d.incident.first_seen, now)}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{d.incident.detection.replace(/^tw_/, "").replaceAll("_", " ")}</h1>
          <p className="text-muted-foreground mt-1 font-mono text-xs">{d.incident.id}</p>
        </div>
        <div className="flex items-center gap-3">
          <Pill tone={STATUS_TONE[d.incident.status]}>{STATUS_LABEL[d.incident.status] ?? d.incident.status}</Pill>
          <div className="border-border bg-card/60 flex rounded-full border p-1 text-sm">
            {(["workspace", "summary"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={cn("rounded-full px-3.5 py-1 capitalize transition-colors", view === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
                {v === "workspace" ? "Live workspace" : "Summary"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stage stepper */}
      <ol className="border-border bg-card/50 mt-6 grid grid-cols-3 gap-2 rounded-2xl border p-3 md:grid-cols-6">
        {STAGES.map((s, i) => (
          <li key={s.key} className={cn("flex items-center gap-2.5 rounded-xl px-3 py-2", i === cur && active && "bg-accent")}>
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full text-[11px]",
                states[i] === "done" && "bg-healthy text-background",
                states[i] === "current" && "bg-brand text-background",
                states[i] === "failed" && "bg-infected text-background",
                states[i] === "pending" && "bg-muted text-muted-foreground",
              )}
            >
              {states[i] === "done" ? <Check className="size-3.5" /> : states[i] === "current" ? <Loader2 className="size-3.5 animate-spin" /> : states[i] === "failed" ? <X className="size-3.5" /> : i + 1}
            </span>
            <span className={cn("text-sm", states[i] === "pending" ? "text-muted-foreground" : "text-foreground")}>{s.label}</span>
          </li>
        ))}
      </ol>

      {view === "workspace" ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[5fr_7fr]">
          <Terminal events={events} freshFrom={freshFrom.current ?? 0} />
          <Editor events={events} freshFrom={freshFrom.current ?? 0} />
          <Tests events={events} />
          <PullRequest events={events} detail={d} onChanged={detail.refresh} />
          {!events.length && (
            <p className="text-muted-foreground text-sm xl:col-span-2">
              This incident was handled before live events were recorded. The Summary shows everything it did.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-5">
          <IncidentStages
            ctx={{ detail: d, brief: brief.data?.text, trust: trust.data, gate: gate.data, aftercare: after.data, live: true, onChanged: detail.refresh }}
            stage={stage ?? cur}
            onStage={setStage}
            states={states}
          />
        </div>
      )}
    </div>
  );
}
