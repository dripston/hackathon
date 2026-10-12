import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({ title, live, action, className, children }: { title: ReactNode; live?: boolean; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={cn("border-border bg-card/60 flex flex-col overflow-hidden rounded-2xl border shadow-lg shadow-black/10", className)}>
      <header className="border-border flex items-center gap-3 border-b px-5 py-3">
        {live && <span className="bg-brand size-1.5 animate-pulse rounded-full" />}
        <h2 className="text-foreground/90 text-sm font-medium">{title}</h2>
        <div className="ml-auto flex items-center gap-2">{action}</div>
      </header>
      <div className="flex-1 p-5">{children}</div>
    </section>
  );
}

export function Pill({ tone, children }: { tone?: "healthy" | "infected" | "muted" | "brand"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone === "healthy" && "bg-healthy/15 text-healthy",
        tone === "infected" && "bg-infected/15 text-infected",
        tone === "brand" && "bg-brand/15 text-brand",
        (!tone || tone === "muted") && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export const STATUS_TONE: Record<string, "healthy" | "infected" | "muted" | "brand"> = {
  resolved: "healthy",
  escalated: "infected",
  awaiting_approval: "brand",
  open: "infected",
  diagnosing: "brand",
  simulating: "brand",
  fixing: "brand",
};

export const STATUS_LABEL: Record<string, string> = {
  open: "detected",
  diagnosing: "diagnosing",
  simulating: "breeding + replaying",
  fixing: "writing a fix",
  awaiting_approval: "awaiting approval",
  resolved: "resolved",
  escalated: "escalated",
};
