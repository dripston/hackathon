"use client";

import { useEffect, useState } from "react";
import type { LiveEvent } from "@/lib/api";
import { Window } from "@/components/workspace/terminal";
import { cn } from "@/lib/utils";

interface Line {
  kind: "ctx" | "add" | "del" | "hunk";
  text: string;
  oldNo?: number;
  newNo?: number;
}

function parseDiff(diff: string): Line[] {
  const out: Line[] = [];
  let o = 0;
  let n = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("---") || raw.startsWith("+++") || raw.startsWith("diff ") || raw.startsWith("index ")) continue;
    const m = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
    if (m) {
      o = Number(m[1]);
      n = Number(m[2]);
      out.push({ kind: "hunk", text: raw });
      continue;
    }
    if (raw.startsWith("+")) out.push({ kind: "add", text: raw.slice(1), newNo: n++ });
    else if (raw.startsWith("-")) out.push({ kind: "del", text: raw.slice(1), oldNo: o++ });
    else if (raw.length || out.length) out.push({ kind: "ctx", text: raw.startsWith(" ") ? raw.slice(1) : raw, oldNo: o++, newNo: n++ });
  }
  return out;
}

/** A code editor showing the fix as Antibody wrote it. A new fix appears line by line. */
export function Editor({ events, freshFrom }: { events: LiveEvent[]; freshFrom: number }) {
  const fixes = events.filter((e) => e.kind === "code");
  const writing = events.some((e) => e.kind === "llm" && e.purpose?.startsWith("write fix") && e.status === "start") &&
    events.filter((e) => e.kind === "llm" && e.purpose?.startsWith("write fix") && e.status === "start").length > fixes.length;
  const [tab, setTab] = useState<number | null>(null);
  const shown = fixes[tab ?? fixes.length - 1];
  const file = shown?.file ?? events.find((e) => e.kind === "llm" && e.purpose?.includes(" for "))?.purpose?.split(" for ")[1];

  return (
    <Window
      title={file ?? "editor"}
      className="h-[440px]"
      right={
        fixes.length > 1 ? (
          <span className="flex gap-1">
            {fixes.map((f, i) => (
              <button key={f.seq} onClick={() => setTab(i)} className={cn("rounded px-2 py-0.5 font-mono text-[11px]", (tab ?? fixes.length - 1) === i ? "bg-accent" : "text-muted-foreground")}>
                {f.fix_id}
              </button>
            ))}
          </span>
        ) : shown ? (
          <span className="text-brand font-mono text-[11px]">{shown.fix_id} · written by Antibody</span>
        ) : null
      }
    >
      {!shown ? (
        <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 font-mono text-sm">
          {writing ? (
            <>
              <span className="text-brand">Antibody is writing the fix</span>
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="bg-brand size-1.5 animate-bounce rounded-full" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </span>
            </>
          ) : (
            <span>The fix appears here as soon as it&apos;s written.</span>
          )}
        </div>
      ) : (
        <Code key={shown.seq} diff={shown.diff ?? ""} description={shown.description ?? ""} animate={shown.seq >= freshFrom} />
      )}
    </Window>
  );
}

function Code({ diff, description, animate }: { diff: string; description: string; animate: boolean }) {
  const lines = parseDiff(diff);
  const [n, setN] = useState(animate ? 0 : lines.length);
  useEffect(() => {
    if (!animate) return;
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= lines.length) clearInterval(t);
    }, 70);
    return () => clearInterval(t);
  }, [animate, lines.length]);
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto py-2 font-mono text-[12.5px] leading-6">
        {lines.slice(0, n).map((l, i) =>
          l.kind === "hunk" ? (
            <div key={i} className="text-brand/70 bg-brand/[0.06] px-4">
              {l.text}
            </div>
          ) : (
            <div
              key={i}
              className={cn(
                "grid grid-cols-[44px_44px_16px_1fr] pr-4",
                l.kind === "add" && "bg-healthy/[0.09]",
                l.kind === "del" && "bg-infected/[0.09]",
              )}
            >
              <span className="text-muted-foreground/50 pr-2 text-right select-none">{l.oldNo ?? ""}</span>
              <span className="text-muted-foreground/50 pr-2 text-right select-none">{l.newNo ?? ""}</span>
              <span className={cn("select-none", l.kind === "add" && "text-healthy", l.kind === "del" && "text-infected")}>
                {l.kind === "add" ? "+" : l.kind === "del" ? "−" : " "}
              </span>
              <span className={cn("whitespace-pre", l.kind === "del" && "text-foreground/60 line-through decoration-infected/40")}>{l.text}</span>
            </div>
          ),
        )}
        {n < lines.length && <span className="bg-brand ml-[104px] inline-block h-4 w-2 animate-pulse" />}
      </div>
      {description && (
        <p className="border-border text-muted-foreground border-t px-4 py-2.5 text-xs leading-relaxed">
          <span className="text-foreground/80">Why: </span>
          {description}
        </p>
      )}
    </div>
  );
}
