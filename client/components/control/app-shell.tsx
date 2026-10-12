"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bot,
  ChevronsUpDown,
  GitPullRequest,
  LayoutDashboard,
  Plug,
  Rocket,
  Settings,
  ShieldCheck,
  Siren,
} from "lucide-react";
import { getDrill, getIncidents, getSystem, setDrillMode } from "@/lib/api";
import { useNow, usePoll } from "@/lib/use-poll";
import { drillServing } from "@/components/control/drill-bar";
import { RunButton } from "@/components/control/run-button";
import { Mark } from "@/components/story/site-header";
import { cn } from "@/lib/utils";

const ACTIVE = new Set(["open", "diagnosing", "simulating", "fixing", "awaiting_approval"]);

const NAV = [
  {
    group: "Monitor",
    items: [
      { href: "/live", label: "Overview", icon: LayoutDashboard },
      { href: "/traffic", label: "Traffic", icon: Activity },
      { href: "/incidents", label: "Incidents", icon: Siren, badge: true },
      { href: "/fixes", label: "Fixes", icon: GitPullRequest },
    ],
  },
  {
    group: "Protect",
    items: [
      { href: "/immunity", label: "Guardrails", icon: ShieldCheck },
      { href: "/agents", label: "Agents", icon: Bot },
    ],
  },
  {
    group: "Setup",
    items: [
      { href: "/integrations", label: "Integrations", icon: Plug },
      { href: "/settings", label: "Settings", icon: Settings },
      { href: "/connect", label: "Connect an agent", icon: Rocket },
    ],
  },
];

const TITLES: [string, string][] = [
  ["/live", "Overview"],
  ["/traffic", "Traffic"],
  ["/incidents/", "Incident"],
  ["/incidents", "Incidents"],
  ["/fixes", "Fixes"],
  ["/immunity", "Guardrails"],
  ["/agents", "Agents"],
  ["/integrations", "Integrations"],
  ["/settings", "Settings"],
  ["/connect", "Connect an agent"],
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const drill = usePoll(getDrill, 2000);
  const inDrill = drillServing(drill.data);
  // While a test incident runs, every page reads its isolated agent and Antibody.
  useEffect(() => setDrillMode(inDrill), [inDrill]);
  const incidents = usePoll(getIncidents, 5000).data ?? [];
  const open = incidents.filter((i) => ACTIVE.has(i.status)).length;
  const sys = usePoll(getSystem, 5000).data;
  const allUp = !!sys && Object.values(sys.modules).every((m) => m === "connected") && sys.watcher === "running";
  const now = useNow(1000);
  const title = TITLES.find(([p]) => path.startsWith(p))?.[1] ?? "Antibody";

  return (
    <div className="bg-sidebar flex min-h-screen w-full">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col lg:flex">
        <Link href="/" className="flex items-center gap-2 px-5 pt-5 pb-4 text-[15px] font-semibold tracking-tight">
          <Mark className="size-5" /> Antibody
        </Link>
        <button className="hover:bg-sidebar-accent mx-2.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors">
          <span className="grid size-7 place-items-center rounded-md bg-gradient-to-br from-[oklch(0.8_0.13_165)] to-[oklch(0.74_0.13_285)] text-[13px] font-bold text-black/80">
            a
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] leading-tight font-medium">airo</span>
            <span className="text-muted-foreground block truncate text-xs leading-tight">sales-research-agent</span>
          </span>
          <ChevronsUpDown className="text-muted-foreground size-3.5" />
        </button>
        <nav className="mt-5 flex-1 space-y-6 overflow-y-auto px-2.5">
          {NAV.map((g) => (
            <div key={g.group}>
              <p className="text-muted-foreground/70 px-2.5 pb-1.5 text-[11px] font-medium">{g.group}</p>
              <ul className="space-y-px">
                {g.items.map(({ href, label, icon: Icon, badge }) => {
                  const on = href === "/incidents" ? path.startsWith("/incidents") : path === href || path.startsWith(href + "/");
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13.5px] transition-colors",
                          on ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                        )}
                      >
                        <Icon className={cn("size-4", on ? "text-foreground" : "opacity-80")} strokeWidth={1.75} />
                        <span className="flex-1">{label}</span>
                        {badge && open > 0 && (
                          <span className="bg-brand/20 text-brand rounded px-1.5 text-[11px] font-semibold tabular-nums">{open}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="space-y-1 p-2.5">
          <Link href="/integrations" className="hover:bg-sidebar-accent/60 flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs transition-colors">
            <span className={cn("size-1.5 rounded-full", !sys ? "bg-muted-foreground" : allUp ? "bg-healthy" : "bg-infected")} />
            <span className="text-muted-foreground">{!sys ? "Checking systems…" : allUp ? "All systems operational" : "Some systems degraded"}</span>
          </Link>
          <div className="flex items-center gap-2.5 rounded-md px-2.5 py-2">
            <span className="bg-sidebar-accent grid size-7 place-items-center rounded-full text-xs font-semibold">R</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] leading-tight font-medium">Rehaan</span>
              <span className="text-muted-foreground block text-xs leading-tight">On call</span>
            </span>
            <span className="bg-healthy/15 text-healthy rounded px-1.5 py-0.5 text-[10px] font-medium">ON CALL</span>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:h-screen lg:py-2 lg:pr-2">
        <div className="border-border bg-background flex min-h-0 flex-1 flex-col lg:overflow-y-auto lg:rounded-xl lg:border">
          <header className="border-border bg-background/85 sticky top-0 z-30 flex h-12 items-center gap-3 border-b px-5 backdrop-blur-md lg:px-6">
            <Link href="/" className="lg:hidden">
              <Mark className="size-5" />
            </Link>
            <p className="text-muted-foreground flex min-w-0 items-center gap-1.5 truncate text-[13px]">
              <span className="hidden sm:inline">airo</span>
              <span className="hidden opacity-40 sm:inline">/</span>
              <span className="hidden md:inline">sales-research-agent</span>
              <span className="hidden opacity-40 md:inline">/</span>
              <span className="text-foreground font-medium">{title}</span>
            </p>
            {inDrill && <span className="bg-brand/12 text-brand border-brand/25 rounded-md border px-2 py-0.5 text-xs font-medium">Test incident</span>}
            <span className="text-muted-foreground ml-auto hidden font-mono text-xs tabular-nums sm:block">
              {now ? new Date(now).toISOString().slice(11, 19) : "--:--:--"} UTC
            </span>
            <RunButton />
          </header>
          <main className="w-full flex-1 px-5 py-8 lg:px-10">{children}</main>
        </div>
      </div>
    </div>
  );
}
