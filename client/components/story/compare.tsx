"use client";

import { Check, Minus, X } from "lucide-react";
import { motion } from "motion/react";
import { Reveal } from "@/components/story/reveal";

type Cell = "yes" | "no" | string; // a string is a partial answer, shown with its caveat

const COLS = ["LLM monitoring tools", "LangSmith Engine (beta)", "Sentry Seer", "Antibody"] as const;
const ROWS: { cap: string; cells: Cell[] }[] = [
  { cap: "Flags bad runs in production", cells: ["yes", "yes", "exceptions only", "yes"] },
  { cap: "Finds the commit that caused a silent failure", cells: ["no", "needs revision tags", "exceptions only", "yes"] },
  { cap: "Quotes why the change was made", cells: ["no", "no", "no", "yes"] },
  { cap: "Breeds a family of variants from one incident", cells: ["no", "reuses failing traces", "no", "yes"] },
  { cap: "Proves the fix on the whole family before merge", cells: ["no", "replays after the PR", "no", "yes"] },
  { cap: "Turns the incident into a deploy gate", cells: ["CI evals you write", "re-opens after it recurs", "no", "yes"] },
  { cap: "Approval by voice", cells: ["no", "no", "no", "yes"] },
];

export function Compare() {
  return (
    <section id="compare" className="border-border/60 bg-card/20 scroll-mt-16 border-y py-28">
      <div className="mx-auto max-w-7xl px-6">
        <Reveal>
        <p className="eyebrow">04 · What exists today</p>
        <h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
          Monitoring tells you it&apos;s failing. <span className="text-muted-foreground">Antibody closes the loop.</span>
        </h2>
        </Reveal>
        <div className="border-border mt-12 overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[820px] text-left">
            <thead>
              <tr className="border-border border-b">
                <th className="text-muted-foreground px-6 py-4 text-sm font-normal" />
                {COLS.map((c) => (
                  <th key={c} className={`px-6 py-4 text-sm font-medium ${c === "Antibody" ? "bg-healthy/[0.07] text-healthy" : "text-muted-foreground"}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r, ri) => (
                <motion.tr
                  key={r.cap}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.5 }}
                  transition={{ duration: 0.4, delay: ri * 0.08 }}
                  className="border-border hover:bg-accent/30 border-b transition-colors last:border-0"
                >
                  <td className="px-6 py-4">{r.cap}</td>
                  {r.cells.map((c, i) => (
                    <td key={i} className={`px-6 py-4 ${i === COLS.length - 1 ? "bg-healthy/[0.07]" : ""}`}>
                      <Mark cell={c} />
                    </td>
                  ))}
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground mt-4 text-sm">
          From each vendor&apos;s public documentation, October 2026. Monitoring tools: LangSmith, Braintrust, Arize, Langfuse,
          Datadog LLM Observability.
        </p>
      </div>
    </section>
  );
}

function Mark({ cell }: { cell: Cell }) {
  if (cell === "yes") return <Check className="text-healthy size-5" aria-label="yes" />;
  if (cell === "no") return <X className="text-muted-foreground/60 size-5" aria-label="no" />;
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
      <Minus className="size-4 shrink-0" aria-hidden /> {cell}
    </span>
  );
}
