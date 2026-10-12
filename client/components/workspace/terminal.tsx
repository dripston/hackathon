"use client";

import { useEffect, useRef, useState } from "react";
import type { LiveEvent } from "@/lib/api";
import { cn } from "@/lib/utils";

const STAGE_TITLE: Record<string, string> = {
  diagnosis: "diagnose",
  family: "breed the family",
  baseline: "replay on the current code",
  attempts: "write and prove a fix",
  resolution: "ship",
};

/** A terminal replaying exactly what Antibody ran, as it runs. New lines type out; history shows instantly. */
export function Terminal({ events, freshFrom }: { events: LiveEvent[]; freshFrom: number }) {
  const box = useRef<HTMLDivElement>(null);
  const lines = events.filter((e) => ["cmd", "note", "llm", "stage"].includes(e.kind) && !(e.kind === "stage" && e.status === "done"));
  const llmDone = new Set(events.filter((e) => e.kind === "llm" && e.status === "done").map((e) => e.purpose?.split(" for ")[0]));

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" });
  }, [lines.length]);

  return (
    <Window title="antibody — live shell" className="h-[440px]">
      <div ref={box} className="h-full overflow-y-auto px-4 py-3 font-mono text-[12.5px] leading-relaxed">
        {!lines.length && <p className="text-muted-foreground">waiting for Antibody to start…</p>}
        {lines.map((e) => {
          const fresh = e.seq >= freshFrom;
          if (e.kind === "stage")
            return (
              <p key={e.seq} className="text-brand/80 mt-3 mb-1 first:mt-0">
                ── {STAGE_TITLE[e.stage ?? ""] ?? e.stage} ──
              </p>
            );
          if (e.kind === "note")
            return (
              <p key={e.seq} className={cn("text-muted-foreground", e.tone === "good" && "text-healthy", e.tone === "bad" && "text-infected")}>
                <span className="opacity-60"># </span>
                <Typed text={e.text ?? ""} animate={fresh} speed={6} />
              </p>
            );
          if (e.kind === "llm") {
            const base = e.purpose?.split(" for ")[0];
            if (e.status === "done") return null;
            const busy = !llmDone.has(base);
            return (
              <p key={e.seq} className="text-brand">
                {busy ? <Spinner /> : "✓"} {e.purpose}
                {e.model ? <span className="text-muted-foreground"> · {e.model}</span> : null}
              </p>
            );
          }
          return (
            <div key={e.seq} className="mt-1">
              <p>
                <span className="text-healthy">$ </span>
                <Typed text={e.cmd ?? ""} animate={fresh} speed={14} />
              </p>
              {e.out && (
                <pre className="text-muted-foreground whitespace-pre-wrap">
                  <Typed text={e.out} animate={fresh} speed={4} delay={(e.cmd?.length ?? 0) * 14 + 120} />
                </pre>
              )}
            </div>
          );
        })}
        <p className="mt-1">
          <span className="text-healthy">$ </span>
          <span className="bg-foreground/80 inline-block h-3.5 w-2 animate-pulse align-middle" />
        </p>
      </div>
    </Window>
  );
}

export function Typed({ text, animate, speed = 12, delay = 0 }: { text: string; animate: boolean; speed?: number; delay?: number }) {
  const [n, setN] = useState(animate ? 0 : text.length);
  useEffect(() => {
    if (!animate) return;
    let i = 0;
    let t: ReturnType<typeof setTimeout>;
    const step = () => {
      i = Math.min(text.length, i + Math.max(1, Math.round(text.length / 400)));
      setN(i);
      if (i < text.length) t = setTimeout(step, speed);
    };
    t = setTimeout(step, delay);
    return () => clearTimeout(t);
  }, [animate, text, speed, delay]);
  return <>{text.slice(0, n)}</>;
}

function Spinner() {
  const frames = ["◐", "◓", "◑", "◒"];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % frames.length), 160);
    return () => clearInterval(t);
  }, [frames.length]);
  return <span>{frames[i]}</span>;
}

/** A macOS-style window chrome shared by the workspace panels. */
export function Window({ title, className, children, right }: { title: string; className?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className={cn("border-border flex flex-col overflow-hidden rounded-2xl border bg-[oklch(0.15_0.025_268)] shadow-xl shadow-black/20", className)}>
      <div className="border-border flex items-center gap-2 border-b px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-[#ff5f57]/80" />
        <span className="size-2.5 rounded-full bg-[#febc2e]/80" />
        <span className="size-2.5 rounded-full bg-[#28c840]/80" />
        <span className="text-muted-foreground ml-3 font-mono text-xs">{title}</span>
        <span className="ml-auto">{right}</span>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
