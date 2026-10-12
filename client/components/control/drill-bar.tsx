"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Loader2, Play, Sparkles } from "lucide-react";
import { getDrill, startDrill, stopDrill, type DrillStatus } from "@/lib/api";
import { useNow, usePoll } from "@/lib/use-poll";
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
      <div className="border-border bg-card/40 relative flex flex-wrap items-center gap-5 overflow-hidden rounded-2xl border px-6 py-5">
        <div className="bg-brand/15 pointer-events-none absolute -left-10 size-40 rounded-full blur-3xl" aria-hidden />
        <Sparkles className="text-brand relative size-7" />
        <div className="relative min-w-0 flex-1">
          <p className="text-lg font-semibold">Trigger a test incident</p>
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
          className="bg-brand text-background hover:bg-brand/90 glow-brand relative inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-medium transition-all hover:scale-[1.02] disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4 fill-current" />} Trigger test incident
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
      className={cn("relative overflow-hidden rounded-2xl border px-6 py-5", failed ? "border-border bg-card/40" : "border-brand/40 bg-brand/[0.06] glow-brand")}
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
          <button onClick={start} disabled={busy} className="bg-brand text-background hover:bg-brand/90 inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium disabled:opacity-60">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5 fill-current" />} Run another
          </button>
        ) : (
          <button onClick={stop} disabled={busy} className="border-border text-muted-foreground hover:text-foreground rounded-full border px-3 py-1 text-xs disabled:opacity-60">
            Stop
          </button>
        )}
      </div>
      <ol className="mt-4 grid grid-cols-4 gap-2 md:grid-cols-8">
        {STEPS.map((s, i) => (
          <li key={s.key}>
            <div
              className={cn(
                "h-1.5 rounded-full",
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
