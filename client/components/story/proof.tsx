"use client";

import { TrendingUp } from "lucide-react";
import CountUp from "@/components/CountUp";
import { Reveal } from "@/components/story/reveal";
import { STORY } from "@/lib/story/case";

export function Proof() {
  const t = STORY.trust;
  const total = t.seeded_bugs.length;
  const caughtProd = t.seeded_bugs.filter((b) => b.caught_in_production).length;
  const avgCost = STORY.costs?.avg_ledger_cost_usd_real != null ? Math.round(STORY.costs.avg_ledger_cost_usd_real * 1000) / 1000 : null;
  const avgMin = STORY.costs?.avg_duration_ms_real ? STORY.costs.avg_duration_ms_real / 60000 : null;
  const f = STORY.forecast;
  const miss = t.misses[0];

  return (
    <section id="proof" className="mx-auto max-w-7xl scroll-mt-20 px-6 py-28">
      <Reveal>
      <p className="eyebrow">03 · Why believe it</p>
      <h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
        Measured on real failures, misses included.
      </h2>
      <p className="text-muted-foreground mt-5 max-w-2xl text-lg">
        We planted three bugs in the agent, each from a separate coding-agent session, then let real traffic find them.
        The backtest replays every saved family against the commit that caused it and the commit before it.
      </p>
      </Reveal>

      <div className="border-border mt-14 grid gap-px overflow-hidden rounded-2xl border sm:grid-cols-2 lg:grid-cols-4">
        <Big label="planted bugs the gate would have blocked" value={<><CountUp to={t.would_have_blocked} duration={1.2} />/{total}</>} tone="healthy" />
        <Big label="false alarms on clean commits" value={<><CountUp to={t.false_alarms} duration={1.2} />/{t.false_alarm_checks}</>} tone="healthy" />
        <Big
          label="Antibody's LLM cost per incident"
          value={avgCost != null ? <>$<CountUp to={avgCost} duration={1.4} /></> : "—"}
        />
        <Big label="minutes from incident to proven fix" value={avgMin != null ? <CountUp to={Math.round(avgMin * 10) / 10} duration={1.4} /> : "—"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Reveal>
          <div className="border-border h-full rounded-2xl border p-7">
            <p className="eyebrow flex items-center gap-2"><TrendingUp className="size-3.5" /> Predicted before it broke</p>
            <p className="mt-4 text-xl leading-relaxed">&ldquo;{f.evidence}&rdquo;</p>
            <div className="text-muted-foreground mt-5 flex flex-wrap gap-x-6 gap-y-2 font-mono text-sm">
              <span>likelihood: <span className="text-foreground">{f.likelihood}</span></span>
              {f.eta_minutes != null && <span>ETA to threshold: <span className="text-foreground">{f.eta_minutes} min</span></span>}
              <span>would trip: <span className="text-foreground">{f.related_check}</span></span>
            </div>
            <p className="text-muted-foreground mt-5 text-sm">
              A straight-line fit over tool error rates per window. Not a black box: the forecast shows its fit (r²).
            </p>
          </div>
        </Reveal>
        <Reveal delay={0.15}>
          <div className="border-border h-full rounded-2xl border p-7">
            <p className="eyebrow">The honest miss</p>
            <p className="mt-4 text-xl">{miss ? miss.bug : "None"}</p>
            <p className="text-muted-foreground mt-3 leading-relaxed">
              {miss
                ? `Never fired on real traffic: the model never actually invented anyone, so there was no incident to learn from. We list it instead of hiding it. ${caughtProd} of ${total} planted bugs were caught in production.`
                : "Every planted bug was caught."}
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Big({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "healthy" }) {
  return (
    <div className="bg-card/40 px-6 py-7">
      <p className={`font-mono text-5xl font-semibold tabular-nums ${tone === "healthy" ? "text-healthy" : ""}`}>{value}</p>
      <p className="text-muted-foreground mt-3 text-sm">{label}</p>
    </div>
  );
}
