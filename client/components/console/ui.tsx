"use client";

import { useState } from "react";
// Small shared building blocks for the console.
import type { ReactNode } from "react";
import type { DataLabel } from "@/lib/types";
import { cn } from "@/lib/utils";

export function MockBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span
      title="This data came from mock or stub data (x-antibody-mock: 1)"
      className="rounded border border-amber-400/50 px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wider text-amber-300"
    >
      MOCK
    </span>
  );
}

export function LabelBadge({ label }: { label: DataLabel }) {
  return (
    <span className="border-border text-muted-foreground rounded border px-1.5 py-0.5 font-mono text-xs tracking-wider">
      {label}
    </span>
  );
}

export function PageHeader({ title, mock, children }: { title: string; mock?: boolean; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <MockBadge show={!!mock} />
      <div className="ml-auto flex items-center gap-3">{children}</div>
    </div>
  );
}

export function Panel({ title, action, className, children }: { title?: ReactNode; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={cn("border-border bg-card/40 min-w-0 rounded-xl border", className)}>
      {title && (
        <header className="border-border flex items-center gap-3 border-b px-5 py-3">
          <h2 className="text-muted-foreground font-mono text-sm tracking-wider uppercase">{title}</h2>
          <div className="ml-auto">{action}</div>
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "healthy" | "infected" }) {
  return (
    <div className="border-border bg-card/40 rounded-xl border px-5 py-4">
      <div className="text-muted-foreground text-sm">{label}</div>
      <div
        className={cn(
          "mt-1 font-mono text-4xl font-semibold tabular-nums",
          tone === "healthy" && "text-healthy",
          tone === "infected" && "text-infected",
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function Dot({ passed, title }: { passed: boolean; title?: string }) {
  return (
    <span
      title={title}
      aria-label={title}
      className={cn("inline-block size-3 rounded-full", passed ? "bg-healthy/80" : "bg-infected shadow-[0_0_8px] shadow-infected")}
    />
  );
}

export function ErrorNote({ error, updatedAt }: { error: string | null; updatedAt?: number | null }) {
  if (!error) return null;
  return <p className="text-infected font-mono text-sm">{updatedAt ? `Stale since ${new Date(updatedAt).toLocaleTimeString()}, retrying: ` : "Couldn’t load: "}{error}</p>;
}

export const ago = (iso: string | null, now = Date.now()) => {
  if (!iso || !now || !Number.isFinite(Date.parse(iso))) return "—";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

// neatlogs trace link template, e.g. "https://…/traces/{id}". Unset = show the id without a link.
const TRACE_TEMPLATE = process.env.NEXT_PUBLIC_NEATLOGS_TRACE_URL ?? "";

export function TraceLink({ id, className, template }: { id: string | null; className?: string; template?: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!id) return <span className="text-muted-foreground font-mono text-sm">no trace</span>;
  const configured = template || TRACE_TEMPLATE;
  const href = configured.replace("{trace_id}", encodeURIComponent(id)).replace("{id}", encodeURIComponent(id));
  if (!/^https?:\/\//.test(href) || !/\{(?:trace_id|id)\}/.test(configured)) return (
    <span className={cn("inline-flex max-w-full items-center gap-2 font-mono text-sm", className)}>
      <span className="break-all">{id}</span>
      <button type="button" className="text-muted-foreground underline" aria-label={`Copy trace ${id}`} onClick={async () => {
        try { await navigator.clipboard.writeText(id); setCopied(true); } catch { setCopied(false); }
      }}>{copied ? "Copied" : "Copy"}</button>
    </span>
  );
  return <a href={href} target="_blank" rel="noreferrer" className={cn("break-all font-mono text-sm underline decoration-dotted underline-offset-4 hover:text-foreground", className)}>{id} ↗</a>;
}
