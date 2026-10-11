// Small shared building blocks for the console.
"use client";

import { useState, type ReactNode } from "react";
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

export function LabelBadge({ label }: { label: string }) {
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
          "mt-1 font-mono font-semibold tabular-nums",
          // Words ("no gate run yet") don't fit the big-number size on one line.
          typeof value === "string" && value.length > 6 ? "text-2xl leading-[2.5rem]" : "text-4xl",
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

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="text-infected font-mono text-sm">Couldn&apos;t load: {error}</p>;
}

/** Poll status: "stale since hh:mm:ss, retrying" when old data is still on screen, else the error. */
export function PollNote({ poll }: { poll: { error: string | null; data: unknown; staleSince: number | null; unreachable: boolean } }) {
  if (!poll.error) return null;
  // An unreachable backend is reported once by the global banner, not on every card.
  if (poll.data === undefined) return poll.unreachable ? null : <ErrorNote error={poll.error} />;
  return (
    <p className="font-mono text-sm text-amber-300" role="status">
      stale since {poll.staleSince ? new Date(poll.staleSince).toLocaleTimeString() : "—"}, retrying
    </p>
  );
}

export const ago = (iso: string, now = Date.now()) => {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

/** Local clock time plus relative time, for UTC ISO strings from the API. */
export const stamp = (iso: string, now = Date.now()) => `${new Date(iso).toLocaleString()} (${ago(iso, now)})`;

// neatlogs trace link template, e.g. "https://…/traces/{trace_id}". Unset = show the id with a copy button.
const ENV_TRACE_TEMPLATE = process.env.NEXT_PUBLIC_NEATLOGS_TRACE_URL ?? "";

/** The template the API reports (trace_url_template) wins over the env one. Never invents a URL. */
export function traceHref(id: string, template?: string | null) {
  const tpl = template || ENV_TRACE_TEMPLATE;
  if (!tpl) return null;
  const enc = encodeURIComponent(id);
  return tpl.replace("{trace_id}", enc).replace("{id}", enc);
}

export function TraceLink({ id, template, className }: { id: string | null; template?: string | null; className?: string }) {
  const [copied, setCopied] = useState(false);
  if (!id) return <span className="text-muted-foreground font-mono text-sm">no trace</span>;
  const href = traceHref(id, template);
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={cn("hover:text-foreground font-mono text-sm underline decoration-dotted underline-offset-4", className)}
      >
        {id} ↗
      </a>
    );
  }
  const copy = () => {
    navigator.clipboard?.writeText(id).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      },
      () => {},
    );
  };
  return (
    <span className={cn("inline-flex items-center gap-2 font-mono text-sm", className)}>
      {id}
      <button onClick={copy} className="text-muted-foreground hover:text-foreground text-xs underline" aria-label={`Copy trace id ${id}`}>
        {copied ? "copied" : "copy"}
      </button>
    </span>
  );
}
