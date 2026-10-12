"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Loader2, X } from "lucide-react";
import { getAftercare, getBrief, getGate, getIncident, getTrust } from "@/lib/api";
import { useNow, usePoll } from "@/lib/use-poll";
import { useEvents } from "@/lib/use-events";
import { IncidentStages, STAGES, currentStage, stageStates } from "@/components/story/incident-player";
import { Dot, Page, PageHeader, Pill, STATUS_LABEL, STATUS_TONE, label } from "@/components/control/panel";
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
    <Page wide>
      <PageHeader
        meta={
          <>
            <Link href="/incidents" className="hover:text-foreground inline-flex items-center gap-1 transition-colors">
              <ArrowLeft className="size-3.5" /> Incidents
            </Link>
            <span className="opacity-40">/</span>
            <span className="font-mono text-xs">{d.incident.id}</span>
          </>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {label(d.incident.detection)}
            <Pill tone={STATUS_TONE[d.incident.status]} dot>{STATUS_LABEL[d.incident.status] ?? d.incident.status}</Pill>
          </span>
        }
        description={
          <span className="flex items-center gap-2">
            {active && <Dot tone="brand" pulse />}
            {active ? "Antibody is working on this now" : "Handled end to end by Antibody"} · opened {ago(d.incident.first_seen, now)}
          </span>
        }
        actions={
          <div className="border-border bg-card flex rounded-lg border p-0.5 text-[13px]">
            {(["workspace", "summary"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn("rounded-md px-3 py-1.5 transition-colors", view === v ? "bg-accent text-foreground font-medium" : "text-muted-foreground hover:text-foreground")}
              >
                {v === "workspace" ? "Live workspace" : "Summary"}
              </button>
            ))}
          </div>
        }
      />

      {/* Stage stepper */}
      <ol className="border-border bg-card grid grid-cols-3 overflow-hidden rounded-xl border md:grid-cols-6">
        {STAGES.map((s, i) => (
          <li
            key={s.key}
            className={cn(
              "border-border relative flex items-center gap-2.5 border-r px-4 py-3 last:border-r-0",
              i === cur && active && "bg-brand/[0.06]",
            )}
          >
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold",
                states[i] === "done" && "bg-healthy/15 text-healthy",
                states[i] === "current" && "bg-brand/20 text-brand",
                states[i] === "failed" && "bg-infected/15 text-infected",
                states[i] === "pending" && "bg-muted text-muted-foreground",
              )}
            >
              {states[i] === "done" ? <Check className="size-3" /> : states[i] === "current" ? <Loader2 className="size-3 animate-spin" /> : states[i] === "failed" ? <X className="size-3" /> : i + 1}
            </span>
            <span className={cn("text-[13px]", states[i] === "pending" ? "text-muted-foreground" : "text-foreground")}>{s.label}</span>
            <span
              className={cn(
                "absolute inset-x-0 bottom-0 h-0.5",
                states[i] === "done" && "bg-healthy/60",
                states[i] === "current" && "bg-brand animate-pulse",
                states[i] === "failed" && "bg-infected",
              )}
            />
          </li>
        ))}
      </ol>

      {view === "workspace" ? (
        <div className="grid gap-5 xl:grid-cols-[5fr_7fr]">
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
        <div>
          <IncidentStages
            ctx={{ detail: d, brief: brief.data?.text, trust: trust.data, gate: gate.data, aftercare: after.data, live: true, onChanged: detail.refresh }}
            stage={stage ?? cur}
            onStage={setStage}
            states={states}
          />
        </div>
      )}
    </Page>
  );
}
