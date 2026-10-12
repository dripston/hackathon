"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { getDrill, startDrill } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { btn } from "@/components/control/panel";
import { cn } from "@/lib/utils";

const BUSY = new Set(["starting", "deploying", "traffic", "detecting", "fixing", "awaiting_approval", "verifying"]);

/** One click: a brand-new live incident through the whole pipeline. Replaces a finished run. */
export function RunButton({ className }: { className?: string }) {
  const drill = usePoll(getDrill, 2000);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const d = drill.data;
  const inFlight = !!d && !!d.running && BUSY.has(d.state);

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
      <span className={cn("border-brand/25 bg-brand/10 text-brand inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] font-medium", className)}>
        <span className="bg-brand size-1.5 animate-pulse rounded-full" /> Test incident running
      </span>
    );
  return (
    <button
      onClick={run}
      disabled={busy}
      title={err ?? "Like a fire drill: a real bug in an isolated copy of your agent, real traffic, and Antibody handles it end to end"}
      className={cn(btn.primary, "px-3 py-1.5 text-[13px]", className)}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3 fill-current" />}
      Trigger test incident
    </button>
  );
}
