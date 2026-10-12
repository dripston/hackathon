"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { getDrill, startDrill } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { cn } from "@/lib/utils";

const BUSY = new Set(["starting", "deploying", "traffic", "detecting", "fixing", "awaiting_approval", "verifying"]);

/** One click: a brand-new live incident through the whole pipeline. Replaces a finished run. */
export function RunButton({ className }: { className?: string }) {
  const drill = usePoll(getDrill, 2000);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const d = drill.data;
  const inFlight = !!d && !d.ended && BUSY.has(d.state);

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      await startDrill();
      drill.refresh();
      router.push("/live");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (inFlight)
    return (
      <span className={cn("bg-brand/15 text-brand inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium", className)}>
        <span className="bg-brand size-2 animate-pulse rounded-full" /> Run in progress
      </span>
    );
  return (
    <button
      onClick={run}
      disabled={busy}
      title={err ?? "Plant a real bug in a sandbox, send traffic, and watch Antibody catch, fix and prove it"}
      className={cn(
        "bg-brand text-background hover:bg-brand/90 glow-brand inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition-all hover:scale-[1.03] disabled:opacity-60",
        className,
      )}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5 fill-current" />}
      Run new incident
    </button>
  );
}
