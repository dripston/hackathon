"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ArrowUpRight, BookOpen, Bot, LayoutDashboard, Plug, Settings, ShieldCheck, Siren } from "lucide-react";
import { getDrill, getIncidents, getSystem, setDrillMode, USE_MOCK } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { drillServing } from "./drill-bar";
import { Mark } from "@/components/story/site-header";
import { cn } from "@/lib/utils";

const PRIMARY = [
  { href: "/live", label: "Overview", icon: LayoutDashboard },
  { href: "/incidents", label: "Issues", icon: Siren },
  { href: "/traffic", label: "Agent activity", icon: Activity },
  { href: "/immunity", label: "Release checks", icon: ShieldCheck },
  { href: "/evidence", label: "Evidence", icon: BookOpen },
];
const SETUP = [
  { href: "/agents", label: "Your agent", icon: Bot },
  { href: "/integrations", label: "Connections", icon: Plug },
  { href: "/settings", label: "Configuration", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const drill = usePoll(getDrill, 3000);
  const inDrill = drillServing(drill.data);
  useEffect(() => { setDrillMode(inDrill); return () => setDrillMode(false); }, [inDrill]);
  const incidents = usePoll(getIncidents, 5000);
  const decisions = incidents.data?.filter(i => ["awaiting_approval", "escalated"].includes(i.status)).length ?? 0;
  const system = usePoll(getSystem, 5000);
  const healthy = !!system.data?.ok && !system.error;
  const title = [...PRIMARY, ...SETUP].find(n => path === n.href || path.startsWith(n.href + "/"))?.label ?? "Workspace";
  const nav = (items: typeof PRIMARY) => items.map(({ href, label, icon: Icon }) => {
    const active = path === href || path.startsWith(href + "/");
    return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors", active ? "bg-sidebar-accent text-foreground font-medium" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground")}>
      <Icon className="size-4 shrink-0" /><span>{label}</span>
      {href === "/incidents" && decisions > 0 && <span className="bg-infected/15 text-infected ml-auto rounded px-2 text-xs">{decisions}</span>}
    </Link>;
  });
  return <div className="bg-sidebar flex min-h-screen w-full">
    <a href="#workspace-content" className="bg-background fixed left-4 top-2 z-50 -translate-y-20 rounded p-3 focus:translate-y-0">Skip to content</a>
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r lg:flex">
      <Link href="/live" className="flex items-center gap-3 px-6 py-7 text-xl font-semibold"><Mark className="size-6" />Antibody</Link>
      <p className="text-muted-foreground px-6 pb-6 text-sm leading-6">Understand failures.<br />Review fixes. Prevent repeats.</p>
      <nav aria-label="Workspace" className="flex-1 space-y-6 overflow-y-auto px-3">
        <div className="space-y-1">{nav(PRIMARY)}</div>
        <details open={SETUP.some(n => path === n.href) || path === "/connect" || path === "/fixes"}>
          <summary className="text-muted-foreground cursor-pointer px-3 py-2 text-xs uppercase tracking-widest">More tools</summary>
          {nav(SETUP)}<Link href="/fixes" className="text-muted-foreground block px-3 py-3 text-sm">Fix history</Link><Link href="/connect" className="text-muted-foreground block px-3 py-3 text-sm">Agent setup guide</Link>
        </details>
      </nav>
      <div className="border-t p-5">
        <Link href="/integrations" className="flex items-center gap-2 text-sm"><span className={cn("size-2 rounded-full", healthy ? "bg-healthy" : "bg-muted-foreground")} />{system.error ? "Server unavailable" : !system.data ? "Checking connection…" : healthy ? "Backend connected" : "Some modules unavailable"}</Link>
        <p className="text-muted-foreground mt-2 text-xs">Connection status, not an agent quality score.</p>
        <Link href="/" className="text-muted-foreground mt-5 flex items-center gap-2 text-sm">About Antibody <ArrowUpRight className="size-3" /></Link>
      </div>
    </aside>
    <div className="bg-background min-w-0 flex-1">
      <header className="bg-background/95 sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <Link href="/live" className="flex items-center gap-2 font-semibold lg:hidden"><Mark className="size-5" />Antibody</Link>
          <p className="text-muted-foreground hidden text-sm lg:block">Workspace <span className="mx-3 opacity-40">/</span><span className="text-foreground">{title}</span></p>
          <span className="text-muted-foreground text-xs">{USE_MOCK ? "MOCK DATA" : inDrill ? "SIMULATED · isolated exercise" : "Connected workspace"}</span>
        </div>
        <nav aria-label="Mobile workspace" className="flex gap-1 overflow-x-auto px-3 pb-2 lg:hidden">{nav(PRIMARY)}<Link href="/settings" className="text-muted-foreground px-3 py-3 text-sm">Settings</Link></nav>
      </header>
      {USE_MOCK && <p role="status" className="border-b bg-muted px-6 py-3 text-sm">MOCK DATA · saved examples. No live changes are made.</p>}
      {inDrill && <p role="status" className="border-brand/25 bg-brand/10 text-brand border-b px-6 py-3 text-sm">You’re viewing an isolated demonstration. Issues and decisions on these pages belong to the exercise.</p>}
      {system.error && !USE_MOCK && <p role="status" className="text-infected border-b px-6 py-3 text-sm">The server cannot be reached. Any previously loaded data may be out of date.</p>}
      <main id="workspace-content" className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:py-10">{children}</main>
    </div>
  </div>;
}
