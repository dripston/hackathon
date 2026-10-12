"use client";

import Link from "next/link";
import { ArrowRight, Loader2, Phone, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { getIncident, getIncidents } from "@/lib/api";
import { useNow, usePoll } from "@/lib/use-poll";
import type { Incident, IncidentDetail } from "@/lib/types";
import { STAGES, currentStage, stageStates } from "@/components/story/incident-player";
import { Panel, Pill, STATUS_LABEL, STATUS_TONE } from "@/components/control/panel";
import { ago } from "@/components/console/ui";
import { short } from "@/lib/story/case";
import { cn } from "@/lib/utils";

const ACTIVE = new Set(["open", "diagnosing", "simulating", "fixing", "awaiting_approval"]);

/** The incident on screen: the active one (live, every 2 s), else the most recent. */
export function IncidentPanel() {
  const list = usePoll(getIncidents, 2000);
  const incidents = list.data ?? [];
  const active = incidents.find((i) => ACTIVE.has(i.status));
  const focus = active ?? incidents[0];
  return (
    <Panel
      title={active ? "Active incident" : "Incidents"}
      live={!!active}
      className="min-h-[560px]"
      action={active ? <Pill tone="infected">live</Pill> : <Pill tone="healthy">all clear</Pill>}
    >
      {!focus && <p className="text-muted-foreground text-sm">{list.error ? `Antibody unreachable: ${list.error}` : "No incidents yet."}</p>}
      {focus && <Focus key={focus.id} inc={focus} live={!!active} />}
    </Panel>
  );
}

function Focus({ inc, live }: { inc: Incident; live: boolean }) {
  const detail = usePoll(() => getIncident(inc.id), live ? 2000 : 15000, inc.id);
  const now = useNow(1000);
  const d = detail.data;
  if (!d) return <p className="text-muted-foreground flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> loading {inc.id}…</p>;
  const states = stageStates(d);
  const cur = currentStage(d);
  const attempts = d.attempts ?? [];
  const accepted = attempts.find((a) => a.accepted);
  const base = d.families.find((f) => f.candidate === "baseline");
  const res = d.resolution;

  return (
    <div className="flex h-full flex-col">
      {!live && (
        <div className="border-healthy/30 bg-healthy/[0.05] mb-5 flex items-center gap-3 rounded-xl border px-4 py-3">
          <ShieldCheck className="text-healthy size-5" />
          <p className="text-sm">
            <span className="font-medium">No open incidents.</span> <span className="text-muted-foreground">Showing the most recent one.</span>
          </p>
        </div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-infected font-mono text-sm">{d.incident.detection}</p>
          <p className="text-muted-foreground mt-1 truncate font-mono text-xs">{d.incident.id}</p>
        </div>
        <div className="text-right">
          <Pill tone={STATUS_TONE[d.incident.status]}>{STATUS_LABEL[d.incident.status] ?? d.incident.status}</Pill>
          <p className="text-muted-foreground mt-1.5 font-mono text-xs">opened {ago(d.incident.first_seen, now)}</p>
        </div>
      </div>

      {/* Stage tracker */}
      <ol className="mt-6 grid grid-cols-6 gap-1.5">
        {STAGES.map((s, i) => (
          <li key={s.key} className="min-w-0">
            <div
              className={cn(
                "h-1.5 rounded-full",
                states[i] === "done" && "bg-healthy",
                states[i] === "current" && "bg-brand animate-pulse",
                states[i] === "failed" && "bg-infected",
                states[i] === "pending" && "bg-muted",
              )}
            />
            <p className={cn("mt-2 truncate text-xs", i === cur ? "text-foreground font-medium" : "text-muted-foreground")}>{s.label}</p>
          </li>
        ))}
      </ol>

      {/* What's happening right now */}
      <motion.div key={d.incident.status} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-3">
        <Fact label="Cause" value={d.diagnosis ? `${short(d.diagnosis.commit_sha)} · ${d.diagnosis.fix_kind}` : null} pending="reading git history + Entire checkpoint…" />
        {d.diagnosis?.reasoning_excerpt && (
          <blockquote className="border-healthy/40 text-muted-foreground border-l-2 pl-3 text-sm italic">
            &ldquo;{d.diagnosis.reasoning_excerpt.slice(0, 160)}
            {d.diagnosis.reasoning_excerpt.length > 160 ? "…" : ""}&rdquo;
          </blockquote>
        )}
        <Fact label="Family" value={d.scenarios?.length ? `${d.scenarios.length} variants` : null} pending="breeding variants…" />
        <Fact
          label="Proof"
          value={
            accepted?.result && base
              ? `must_fix ${base.must_fix_passed}/${base.must_fix_total} → ${accepted.result.must_fix_passed}/${accepted.result.must_fix_total} · healthy ${accepted.result.must_not_change_passed}/${accepted.result.must_not_change_total}`
              : base
                ? `baseline must_fix ${base.must_fix_passed}/${base.must_fix_total}; ${attempts.length ? `attempt ${attempts.length} running…` : "writing a fix…"}`
                : null
          }
          pending="replaying the family…"
          tone={accepted ? "healthy" : undefined}
        />
        <Fact
          label="Decision"
          value={
            res?.approval
              ? `"${res.approval.phrase}" · ${res.approval.channel}${res.merged ? " · merged" : ""}`
              : d.incident.status === "awaiting_approval"
                ? "calling the on-call engineer…"
                : d.incident.status === "escalated"
                  ? "escalated to a human"
                  : null
          }
          pending="waiting for a proven fix"
          tone={res?.approval ? "healthy" : undefined}
        />
      </motion.div>

      {d.incident.status === "awaiting_approval" && (
        <div className="border-brand/30 bg-brand/[0.07] mt-5 flex items-center gap-3 rounded-xl border px-4 py-3">
          <Phone className="text-brand size-4 animate-pulse" />
          <p className="text-sm">
            Waiting for <span className="font-mono">approve fix {res?.accepted_fix_id?.replace("fix_", "")}</span>, by voice on Telegram or typed on the incident page.
          </p>
        </div>
      )}

      <Link
        href={`/incidents/${encodeURIComponent(d.incident.id)}`}
        className="bg-foreground text-background hover:bg-foreground/90 mt-auto inline-flex w-fit items-center gap-2 self-start rounded-full px-4 py-2 text-sm font-medium transition-colors"
      >
        {live ? "Watch Antibody work" : "Open the incident"} <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}

function Fact({ label, value, pending, tone }: { label: string; value: string | null; pending: string; tone?: "healthy" }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-baseline gap-3">
      <span className="text-muted-foreground font-mono text-xs tracking-wider uppercase">{label}</span>
      {value ? (
        <span className={cn("font-mono text-sm", tone === "healthy" && "text-healthy")}>{value}</span>
      ) : (
        <span className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-3.5 animate-spin" /> {pending}
        </span>
      )}
    </div>
  );
}
