"use client";

import { Check, CircleDashed } from "lucide-react";
import { getSystemInfo } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { Page, PageHeader, Pill } from "@/components/control/panel";
import { cn } from "@/lib/utils";

const COLOR: Record<string, string> = {
  neatlogs: "from-[oklch(0.72_0.15_250)] to-[oklch(0.55_0.17_270)]",
  github: "from-[oklch(0.45_0_0)] to-[oklch(0.28_0_0)]",
  entire: "from-[oklch(0.78_0.14_80)] to-[oklch(0.62_0.16_50)]",
  telegram: "from-[oklch(0.72_0.13_230)] to-[oklch(0.58_0.15_240)]",
  crustdata: "from-[oklch(0.74_0.14_150)] to-[oklch(0.56_0.14_165)]",
  typesafe: "from-[oklch(0.7_0.15_310)] to-[oklch(0.54_0.17_290)]",
  llm: "from-[oklch(0.72_0.16_35)] to-[oklch(0.58_0.18_25)]",
};
const LOGO: Record<string, string> = {
  neatlogs: "nl",
  github: "GH",
  entire: "En",
  telegram: "Tg",
  crustdata: "Cd",
  typesafe: "Jv",
  llm: "AI",
};

export default function IntegrationsPage() {
  const info = usePoll(getSystemInfo, 15000);
  const list = info.data?.integrations ?? [];
  const connected = list.filter((i) => i.connected).length;
  return (
    <Page>
      <PageHeader
        title="Connections"
        description="The services Antibody uses. Configured means the server found the required settings or tools; it does not verify every provider request."
        actions={list.length ? <Pill tone={connected === list.length ? "healthy" : "muted"} dot>{connected} of {list.length} configured</Pill> : undefined}
      />
      {info.loading && <p>Loading connection settings…</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((i) => (
          <div key={i.id} className="border-border bg-card hover:border-foreground/15 flex flex-col rounded-xl border p-5 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <span className={cn("grid size-10 place-items-center rounded-lg bg-gradient-to-br text-[13px] font-bold text-white shadow-sm", COLOR[i.id] ?? "from-zinc-500 to-zinc-700")}>
                {LOGO[i.id] ?? i.name.slice(0, 2)}
              </span>
              <Pill tone={i.connected ? "healthy" : "muted"}>
                {i.connected ? <Check className="size-3" /> : <CircleDashed className="size-3" />}
                {i.connected ? "Configured" : "Needs setup"}
              </Pill>
            </div>
            <p className="mt-4 font-medium">{i.name}</p>
            <p className="text-muted-foreground mt-1 flex-1 text-sm leading-relaxed">{i.role}</p>
            <p className="border-border text-muted-foreground mt-4 truncate border-t pt-3 font-mono text-xs" title={i.detail}>
              {i.detail}
            </p>
          </div>
        ))}
      </div>
      {info.error && <p className="text-infected text-sm">Couldn&apos;t reach Antibody: {info.error}</p>}
    </Page>
  );
}
