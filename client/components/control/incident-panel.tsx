"use client";

import Link from "next/link";
import { ArrowRight, Loader2, Phone } from "lucide-react";
import { motion } from "motion/react";
import { getIncident, getIncidents } from "@/lib/api";
import { useNow, usePoll } from "@/lib/use-poll";
import type { Incident, IncidentDetail } from "@/lib/types";
import { STAGES, currentStage, stageStates } from "@/components/story/incident-player";
import { Panel, Pill, STATUS_LABEL, STATUS_TONE, btn, label } from "@/components/control/panel";
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
      title={active ? "Active incident" : "Latest incident"}
      live={!!active}
      action={active ? <Pill tone="brand" dot>Live</Pill> : <Pill tone="healthy" dot>No open incidents</Pill>}
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
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-base font-semibold tracking-tight">{label(d.incident.detection)}</p>
          <p className="text-muted-foreground mt-0.5 truncate text-xs">
            Opened {ago(d.incident.first_seen, now)} · <span className="font-mono">{d.incident.id.replace(/_tw_.*/, "")}</span>
          </p>
        </div>
        <Pill tone={STATUS_TONE[d.incident.status]} dot>{STATUS_LABEL[d.incident.status] ?? d.incident.status}</Pill>
      </div>

      {/* Stage tracker */}
      <ol className="mt-5 grid grid-cols-6 gap-1.5">
        {STAGES.map((s, i) => (
          <li key={s.key} className="min-w-0">
            <div
              className={cn(
                "h-1 rounded-full",
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
      <motion.dl key={d.incident.status} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="border-border divide-border mt-5 divide-y rounded-lg border">
        <Fact label="Cause" value={d.diagnosis ? `${short(d.diagnosis.commit_sha)} · ${d.diagnosis.fix_kind}` : null} pending="reading git history + Entire checkpoint…" />
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
      </motion.dl>

      {d.diagnosis?.reasoning_excerpt && (
        <p className="text-muted-foreground mt-4 line-clamp-2 text-[13px] leading-relaxed">
          <span className="text-foreground/80 font-medium">Why it broke: </span>&ldquo;{d.diagnosis.reasoning_excerpt}&rdquo;
        </p>
      )}

      {d.incident.status === "awaiting_approval" && (
        <div className="border-brand/30 bg-brand/[0.07] mt-4 flex items-center gap-3 rounded-lg border px-4 py-3">
          <Phone className="text-brand size-4 animate-pulse" />
          <p className="text-sm">
            Waiting for <span className="font-mono">approve fix {res?.accepted_fix_id?.replace("fix_", "")}</span>, by voice on Telegram or typed on the incident page.
          </p>
        </div>
      )}

      <Link
        href={`/incidents/${encodeURIComponent(d.incident.id)}`}
        className={`${live ? btn.primary : btn.secondary} mt-5 w-fit self-start`}
      >
        {live ? "Watch Antibody work" : "Open the incident"} <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}

function Fact({ label, value, pending, tone }: { label: string; value: string | null; pending: string; tone?: "healthy" }) {
  return (
    <div className="grid grid-cols-[96px_1fr] items-baseline gap-3 px-4 py-2.5">
      <dt className="text-muted-foreground text-[13px]">{label}</dt>
      {value ? (
        <dd className={cn("truncate font-mono text-[13px]", tone === "healthy" && "text-healthy")}>{value}</dd>
      ) : (
        <dd className="text-muted-foreground flex items-center gap-2 text-[13px]">
          <Loader2 className="size-3.5 animate-spin" /> {pending}
        </dd>
      )}
    </div>
  );
}
