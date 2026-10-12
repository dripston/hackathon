import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* The console's building blocks. Every page uses these, so widths, spacing and type stay identical everywhere. */

export function Page({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <div className={cn("mx-auto w-full space-y-6", wide ? "max-w-7xl" : "max-w-6xl", className)}>{children}</div>;
}

export function PageHeader({ title, description, actions, meta }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; meta?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-2">
      <div className="min-w-0">
        {meta && <div className="text-muted-foreground mb-2 flex items-center gap-2 text-[13px]">{meta}</div>}
        <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em]">{title}</h1>
        {description && <p className="text-muted-foreground mt-1.5 max-w-2xl text-[14px] leading-relaxed">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A bordered surface. With a title it gets a header row; `flush` drops body padding for tables and lists. */
export function Panel({
  title,
  live,
  action,
  className,
  flush,
  description,
  children,
}: {
  title?: ReactNode;
  live?: boolean;
  action?: ReactNode;
  className?: string;
  flush?: boolean;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={cn("border-border bg-card flex flex-col overflow-hidden rounded-xl border", className)}>
      {title && (
        <header className="border-border flex min-h-12 items-center gap-2.5 border-b px-5 py-2.5">
          {live && <Dot tone="brand" pulse />}
          <div className="min-w-0">
            <h2 className="text-[13.5px] font-medium">{title}</h2>
            {description && <p className="text-muted-foreground text-xs">{description}</p>}
          </div>
          <div className="ml-auto flex items-center gap-2">{action}</div>
        </header>
      )}
      <div className={cn("flex-1", !flush && "p-5")}>{children}</div>
    </section>
  );
}

export type Tone = "healthy" | "infected" | "muted" | "brand";

export function Dot({ tone = "muted", pulse, className }: { tone?: Tone; pulse?: boolean; className?: string }) {
  const bg = { healthy: "bg-healthy", infected: "bg-infected", brand: "bg-brand", muted: "bg-muted-foreground/50" }[tone];
  return (
    <span className={cn("relative inline-flex size-2 shrink-0", className)}>
      {pulse && <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60", bg)} />}
      <span className={cn("relative size-2 rounded-full", bg)} />
    </span>
  );
}

export function Pill({ tone, dot, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tone === "healthy" && "border-healthy/20 bg-healthy/10 text-healthy",
        tone === "infected" && "border-infected/20 bg-infected/10 text-infected",
        tone === "brand" && "border-brand/25 bg-brand/10 text-brand",
        (!tone || tone === "muted") && "border-border bg-muted/60 text-muted-foreground",
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** A row of key numbers in one bordered strip. */
export function Stats({ items }: { items: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }[] }) {
  return (
    <div
      className={cn(
        "border-border bg-border grid gap-px overflow-hidden rounded-xl border",
        items.length >= 4 ? "grid-cols-2 lg:grid-cols-4" : items.length === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2",
        items.length > 4 && "xl:grid-cols-6 lg:grid-cols-3",
      )}
    >
      {items.map((s) => (
        <div key={s.label} className="bg-card px-5 py-4">
          <p className="text-muted-foreground text-[13px]">{s.label}</p>
          <p
            className={cn(
              "mt-1.5 text-[26px] leading-none font-semibold tracking-tight tabular-nums",
              s.tone === "healthy" && "text-healthy",
              s.tone === "infected" && "text-infected",
              s.tone === "brand" && "text-brand",
            )}
          >
            {s.value}
          </p>
          {s.hint && <p className="text-muted-foreground mt-2 truncate text-xs">{s.hint}</p>}
        </div>
      ))}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <span className="border-border bg-muted/50 text-muted-foreground mb-4 grid size-11 place-items-center rounded-xl border">{icon}</span>}
      <p className="font-medium">{title}</p>
      {children && <div className="text-muted-foreground mt-1 max-w-sm text-sm">{children}</div>}
    </div>
  );
}

/** Table header + rows sharing one column template. */
export function TableHead({ cols, children }: { cols: string; children: ReactNode }) {
  return (
    <div className="text-muted-foreground border-border grid items-center gap-4 border-b px-5 py-2.5 text-xs font-medium" style={{ gridTemplateColumns: cols }}>
      {children}
    </div>
  );
}

export const btn = {
  primary:
    "bg-foreground text-background hover:bg-foreground/90 inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-60",
  secondary:
    "border-border bg-card hover:bg-accent inline-flex items-center justify-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-60",
  ghost: "text-muted-foreground hover:text-foreground hover:bg-accent inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
};

export const label = (detection: string) => {
  const s = detection.replace(/^tw_/, "").replaceAll("_", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const STATUS_TONE: Record<string, Tone> = {
  resolved: "healthy",
  escalated: "infected",
  awaiting_approval: "brand",
  open: "infected",
  diagnosing: "brand",
  simulating: "brand",
  fixing: "brand",
};

export const STATUS_LABEL: Record<string, string> = {
  open: "Detected",
  diagnosing: "Diagnosing",
  simulating: "Testing variants",
  fixing: "Writing a fix",
  awaiting_approval: "Awaiting approval",
  resolved: "Resolved",
  escalated: "Escalated",
};
