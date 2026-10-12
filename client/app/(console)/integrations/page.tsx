"use client";

import { Check, CircleDashed } from "lucide-react";
import { getSystemInfo } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { cn } from "@/lib/utils";

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
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground mt-1">
          {list.length ? `${connected} of ${list.length} connected.` : "Checking…"} Status is read live from the Antibody server.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {list.map((i) => (
          <div key={i.id} className="border-border bg-card/60 flex items-start gap-4 rounded-2xl border p-5 shadow-lg shadow-black/10">
            <span className="bg-accent grid size-11 shrink-0 place-items-center rounded-xl font-mono text-sm font-semibold">{LOGO[i.id] ?? i.name.slice(0, 2)}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">{i.name}</p>
                <span
                  className={cn(
                    "ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                    i.connected ? "bg-healthy/15 text-healthy" : "bg-muted text-muted-foreground",
                  )}
                >
                  {i.connected ? <Check className="size-3" /> : <CircleDashed className="size-3" />}
                  {i.connected ? "Connected" : "Not connected"}
                </span>
              </div>
              <p className="text-muted-foreground mt-1 text-sm">{i.role}</p>
              <p className="text-muted-foreground/80 mt-2 font-mono text-xs">{i.detail}</p>
            </div>
          </div>
        ))}
      </div>
      {info.error && <p className="text-infected text-sm">Couldn&apos;t reach Antibody: {info.error}</p>}
    </div>
  );
}
