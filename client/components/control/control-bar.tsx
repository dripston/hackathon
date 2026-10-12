"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { getDrill, getSystem, setDrillMode } from "@/lib/api";
import { drillServing } from "@/components/control/drill-bar";
import { useNow, usePoll } from "@/lib/use-poll";
import { Mark } from "@/components/story/site-header";
import { cn } from "@/lib/utils";

const MODULE_LABEL: Record<string, string> = { detection: "Patient + detection", antibody: "Antibody", voice: "Voice on-call" };

export function ControlBar() {
  const path = usePathname();
  const sys = usePoll(getSystem, 5000);
  const drill = usePoll(getDrill, 2000);
  const inDrill = drillServing(drill.data);
  // While a drill runs, every console panel reads the drill's sandboxed patient and Antibody.
  useEffect(() => setDrillMode(inDrill), [inDrill]);
  const now = useNow(1000);
  const mods = sys.data?.modules ?? {};
  const pills = [
    ...Object.entries(MODULE_LABEL).map(([k, label]) => ({ label, ok: mods[k] === "connected", known: k in mods })),
    { label: "Watcher", ok: sys.data?.watcher === "running", known: !!sys.data },
  ];
  return (
    <header className="border-border bg-background/80 sticky top-0 z-30 border-b backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1800px] items-center gap-6 px-6">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <Mark /> Antibody
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {[
            { href: "/live", label: "Overview", on: path === "/live" },
            { href: "/traffic", label: "Traffic", on: path.startsWith("/traffic") },
            { href: "/incidents", label: "Incidents", on: path.startsWith("/incidents") },
            { href: "/immunity", label: "Immunity", on: path.startsWith("/immunity") },
          ].map((l) => (
            <Link key={l.href} href={l.href} className={cn("rounded-full px-3.5 py-1.5 transition-colors", l.on ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {l.label}
            </Link>
          ))}
          {inDrill && <span className="bg-brand/15 text-brand ml-2 rounded-full px-3 py-1.5 text-xs font-medium">Live drill</span>}
        </nav>
        <div className="ml-auto hidden items-center gap-2 lg:flex">
          {pills.map((p) => (
            <span key={p.label} className="border-border flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
              <span className={cn("size-1.5 rounded-full", !p.known ? "bg-muted-foreground" : p.ok ? "bg-healthy animate-vital" : "bg-infected")} />
              {p.label}
            </span>
          ))}
        </div>
        <span className="text-muted-foreground hidden font-mono text-xs tabular-nums sm:block">
          {now ? new Date(now).toISOString().slice(11, 19) : "--:--:--"} UTC
        </span>
      </div>
    </header>
  );
}
