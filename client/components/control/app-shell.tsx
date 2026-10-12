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
    <div className="flex min-h-screen w-full">
      <aside className="border-border bg-card/40 sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r lg:flex">
        <Link href="/" className="flex items-center gap-2.5 px-5 pt-5 pb-4 text-lg font-semibold tracking-tight">
          <Mark /> Antibody
        </Link>
        <button className="border-border bg-background/40 hover:bg-accent/50 mx-3 flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors">
          <span className="bg-brand text-background grid size-8 place-items-center rounded-lg text-sm font-bold">a</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">airo</span>
            <span className="text-muted-foreground block truncate text-xs">sales-research-agent</span>
          </span>
          <ChevronsUpDown className="text-muted-foreground size-4" />
        </button>
        <nav className="mt-4 flex-1 space-y-5 overflow-y-auto px-3">
          {NAV.map((g) => (
            <div key={g.group}>
              <p className="text-muted-foreground px-3 pb-1.5 text-[11px] font-medium tracking-wider uppercase">{g.group}</p>
              <ul className="space-y-0.5">
                {g.items.map(({ href, label, icon: Icon, badge }) => {
                  const on = href === "/incidents" ? path.startsWith("/incidents") : path === href || path.startsWith(href + "/");
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                          on ? "bg-accent text-foreground font-medium" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                        )}
                      >
                        <Icon className="size-4" />
                        <span className="flex-1">{label}</span>
                        {badge && open > 0 && <span className="bg-brand text-background rounded-full px-1.5 text-[11px] font-semibold">{open}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-border space-y-3 border-t p-4">
          <Link href="/integrations" className="flex items-center gap-2 text-xs">
            <span className={cn("size-2 rounded-full", !sys ? "bg-muted-foreground" : allUp ? "bg-healthy" : "bg-infected")} />
            <span className="text-muted-foreground">{!sys ? "Checking systems…" : allUp ? "All systems operational" : "Some systems degraded"}</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="bg-accent grid size-8 place-items-center rounded-full text-sm font-semibold">R</span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">Rehaan</span>
              <span className="text-muted-foreground block text-xs">On call · airo</span>
            </span>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border bg-background/80 sticky top-0 z-30 flex h-14 items-center gap-4 border-b px-6 backdrop-blur-md lg:px-8">
          <Link href="/" className="lg:hidden">
            <Mark />
          </Link>
          <p className="text-muted-foreground text-sm">
            airo <span className="opacity-50">/</span> sales-research-agent <span className="opacity-50">/</span>{" "}
            <span className="text-foreground font-medium">{title}</span>
          </p>
          {inDrill && <span className="bg-brand/15 text-brand rounded-full px-2.5 py-1 text-xs font-medium">Test incident</span>}
          <span className="text-muted-foreground ml-auto hidden font-mono text-xs tabular-nums sm:block">
            {now ? new Date(now).toISOString().slice(11, 19) : "--:--:--"} UTC
          </span>
          <RunButton />
        </header>
        <main className="soft-grid w-full flex-1 px-6 py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
