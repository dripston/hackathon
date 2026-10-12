"use client";

import { Check, X } from "lucide-react";
import { motion } from "motion/react";
import { Reveal } from "@/components/story/reveal";
import { STORY } from "@/lib/story/case";
import { cn } from "@/lib/utils";

const STEP_LABEL: Record<string, string> = {
  "crustdata.company_enrich": "Look up the company",
  "llm.identify": "Confirm it's the right company",
  "crustdata.people_search": "Search for decision makers",
  "crustdata.jobs": "Read hiring signals",
  "llm.brief": "Write the brief",
};

export function FailureReveal() {
  const run = STORY.failing_run;
  const o = run.output;
  const failed = run.steps.find((s) => s.error);

  return (
    <section id="failure" className="mx-auto max-w-7xl scroll-mt-20 px-6 py-28">
      <Reveal>
        <p className="eyebrow">01 · The failure you can&apos;t see</p>
        <h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
          The brief looked perfect. <span className="text-muted-foreground">The data behind it never arrived.</span>
        </h2>
        <p className="text-muted-foreground mt-5 max-w-2xl text-lg">
          A real run from our sales-research agent on {run.domain}, captured on Oct 11. No exception, no error log,
          a 200 response. Every dashboard showed green.
        </p>
      </Reveal>

      <div className="mt-14 grid gap-6 lg:grid-cols-2">
        <Reveal>
          <div className="border-border bg-card/50 h-full rounded-2xl border p-7">
            <p className="eyebrow">What the user saw</p>
            <div className="mt-5 flex items-baseline justify-between gap-4">
              <h3 className="text-2xl font-semibold">{o.company_name}</h3>
              <span className="text-healthy bg-healthy/10 rounded-full px-2.5 py-1 font-mono text-xs">200 OK</span>
            </div>
            <p className="mt-4 leading-relaxed">{o.summary}</p>
            <div className="border-border mt-6 rounded-xl border p-4">
              <p className="text-muted-foreground text-sm">Decision makers</p>
              <p className="mt-1 font-medium">None found</p>
              <p className="text-muted-foreground mt-1 text-sm">&ldquo;{o.no_decision_makers_reason}&rdquo;</p>
            </div>
            <p className="text-muted-foreground mt-5 text-sm">
              Confident, specific, plausible. A sales rep would skip this account.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.2}>
          <div className="border-infected/40 bg-infected/[0.04] glow-infected h-full rounded-2xl border p-7">
            <p className="eyebrow text-infected!">What actually happened</p>
            <ol className="mt-5 space-y-2.5">
              {run.steps.map((s, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -14 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.6 }}
                  transition={{ duration: 0.45, delay: 0.35 + i * 0.32, ease: [0.2, 0.7, 0.2, 1] }}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5",
                    s.error ? "animate-flash text-foreground" : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full",
                      s.error ? "bg-infected text-background" : "bg-healthy/15 text-healthy",
                    )}
                  >
                    {s.error ? <X className="size-3.5" /> : <Check className="size-3.5" />}
                  </span>
                  <span className="flex-1">{STEP_LABEL[s.name] ?? s.name}</span>
                  <span className={cn("font-mono text-xs", s.error && "text-infected font-semibold")}>
                    {s.error ?? s.name}
                  </span>
                </motion.li>
              ))}
            </ol>
            <div className="border-infected/30 mt-6 rounded-xl border p-4">
              <p className="text-infected font-mono text-xs tracking-wider uppercase">Antibody · tw_empty_after_error</p>
              <p className="mt-2 leading-relaxed">{run.evidence[0]}.</p>
            </div>
            <p className="text-muted-foreground mt-5 text-sm">
              The {failed?.name.replace("crustdata.", "").replace("_", " ")} call failed with{" "}
              <span className="text-foreground font-mono">{failed?.error}</span>. The agent swallowed the error and
              told the user there was nobody to contact.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
