"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Loader2, Play, Sparkles } from "lucide-react";
import { getDrill, startDrill, stopDrill, type DrillStatus } from "@/lib/api";
import { useNow, usePoll } from "@/lib/use-poll";
import { btn } from "@/components/control/panel";
import { cn } from "@/lib/utils";

const STEPS: { key: DrillStatus["state"]; label: string }[] = [
  { key: "starting", label: "Plant bug" },
  { key: "deploying", label: "Deploy" },
  { key: "traffic", label: "Traffic" },
  { key: "detecting", label: "Detect" },
  { key: "fixing", label: "Diagnose + fix" },
  { key: "awaiting_approval", label: "Approve" },
  { key: "verifying", label: "Verify" },
  { key: "done", label: "Fixed" },
];
const ORDER = STEPS.map((s) => s.key);

/** States in which the drill's own APIs are up and mission control should read them. */
export const drillServing = (d?: DrillStatus | null) =>
  !!d && !!d.running && ["traffic", "detecting", "fixing", "awaiting_approval", "verifying", "done", "expired"].includes(d.state);

export function DrillBar() {
  const drill = usePoll(getDrill, 2000);
  const now = useNow(1000);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const d = drill.data;
  // Only while its process is alive: a server restart ends a test incident even if its file says otherwise.
  const active = !!d && d.state !== "idle" && !!d.running;
  const at = d ? ORDER.indexOf(d.state) : -1;
  const elapsed = d?.started_at && now ? Math.max(0, Math.round((now - Date.parse(d.started_at)) / 1000)) : 0;

  const start = async () => {
    setBusy(true);
    setErr(null);
    try {
      await startDrill();
      drill.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!active)
    return (
      <div className="border-border bg-card flex flex-wrap items-center gap-5 rounded-xl border border-dashed px-6 py-5">
        <span className="border-brand/25 bg-brand/10 text-brand grid size-11 shrink-0 place-items-center rounded-xl border">
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold tracking-tight">Run a test incident</p>
          <p className="text-muted-foreground text-sm">
            Like a fire drill for your agent: Antibody breaks an isolated copy on purpose, sends real traffic, then catches,
            diagnoses and fixes it while you watch. You approve the fix. Takes about 3 minutes.
          </p>
          {err && <p className="text-infected mt-1 text-sm">{err}</p>}
          {d?.ended && d.state !== "idle" && <p className="text-muted-foreground mt-1 text-sm">Last test incident: {d.message}</p>}
        </div>
        <button
          onClick={start}
          disabled={busy}
          className={btn.secondary}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-3.5 fill-current" />} Start a test incident
        </button>
      </div>
    );

  const failed = d!.state === "failed" || d!.state === "expired";
  const finished = failed || d!.state === "done";
  const stop = async () => {
    setBusy(true);
    try {
      await stopDrill();
      drill.refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("bg-card relative overflow-hidden rounded-xl border px-6 py-5", failed ? "border-border" : "border-brand/35")}
    >
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-brand flex items-center gap-2 text-sm font-medium">
          <span className="bg-brand size-2 animate-pulse rounded-full" /> Test incident
        </span>
        <p className="font-medium">{d!.message}</p>
        <span className="text-muted-foreground ml-auto font-mono text-sm tabular-nums">
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
        </span>
        {finished ? (
          <button onClick={start} disabled={busy} className={cn(btn.primary, "py-1.5")}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5 fill-current" />} Run another
          </button>
        ) : (
          <button onClick={stop} disabled={busy} className={cn(btn.secondary, "px-3 py-1 text-xs")}>
            Stop
          </button>
        )}
      </div>
      <ol className="mt-4 grid grid-cols-4 gap-2 md:grid-cols-8">
        {STEPS.map((s, i) => (
          <li key={s.key}>
            <div
              className={cn(
                "h-1 rounded-full",
                i < at || d!.state === "done" ? "bg-healthy" : i === at ? (failed ? "bg-infected" : "bg-brand animate-pulse") : "bg-muted",
              )}
            />
            <p className={cn("mt-1.5 text-xs", i === at ? "text-foreground font-medium" : "text-muted-foreground")}>{s.label}</p>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
        <span className="text-muted-foreground">
          Runs on an isolated copy of your agent; production and GitHub are never touched. Everything else is real: the bug&apos;s
          commit, traffic, detection, diagnosis, the fix and its proof. Only the API outage is simulated.
        </span>
        {d!.incident_id && (
          <Link href={`/incidents/${encodeURIComponent(d!.incident_id)}`} className="text-foreground ml-auto inline-flex items-center gap-1.5 font-medium hover:underline">
            Watch Antibody work {d!.state === "awaiting_approval" ? "· approve the fix" : ""} <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>
    </motion.div>
  );
}
