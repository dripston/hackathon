"use client";

import AnimatedContent from "@/components/AnimatedContent";
import CountUp from "@/components/CountUp";

// Placeholder values: replace with measured backtest results before launch.
const STATS = [
  { to: 100, suffix: "%", label: "past incidents re-caught in backtest" },
  { to: 90, suffix: "%", label: "planted-bug recall" },
  { to: 3, suffix: "%", label: "false-alarm rate" },
];

export function Evidence() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <AnimatedContent distance={40}>
        <p className="font-mono text-xs tracking-widest text-emerald-400 uppercase">Evidence, not promises</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Backtested, measured on planted bugs, and honest about false alarms.
        </h2>
      </AnimatedContent>

      <dl className="mt-12 grid gap-4 sm:grid-cols-3">
        {STATS.map(({ to, suffix, label }) => (
          <div key={label} className="border-border bg-card/40 rounded-2xl border p-6">
            <dt className="text-muted-foreground text-sm">{label}</dt>
            <dd className="mt-2 text-5xl font-semibold tracking-tight">
              <CountUp to={to} duration={2} />
              {suffix}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground mt-4 font-mono text-xs">Placeholder values. Replace with measured results.</p>
    </section>
  );
}
