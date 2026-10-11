"use client";

import { useRef } from "react";
import { Activity, Building2, Calculator, Gauge, GitCommitHorizontal, PhoneCall, ShieldCheck } from "lucide-react";
import AnimatedContent from "@/components/AnimatedContent";
import { AnimatedBeam, BeamNode } from "@/components/ui/animated-beam";

const STEPS = [
  ["Detect", "Tripwires and Jev scores check every trace in neatlogs."],
  ["Forecast", "Watches for error rates creeping up, before they break."],
  ["Diagnose", "Diffs failing vs healthy runs and reads the Entire checkpoint: what changed, and why."],
  ["Immunise", "One incident becomes a family of variants, replayed on real recorded tool responses."],
  ["Call", "A voice agent explains it. You approve the proven fix with an exact spoken phrase."],
  ["Ship", "A PR with before/after evidence. The family becomes a permanent pre-deploy gate."],
];

export function Pipeline() {
  const container = useRef<HTMLDivElement>(null);
  const hub = useRef<HTMLDivElement>(null);
  const neatlogs = useRef<HTMLDivElement>(null);
  const jev = useRef<HTMLDivElement>(null);
  const entire = useRef<HTMLDivElement>(null);
  const crust = useRef<HTMLDivElement>(null);
  const cfo = useRef<HTMLDivElement>(null);
  const voice = useRef<HTMLDivElement>(null);

  const left = [
    { ref: neatlogs, Icon: Activity, label: "neatlogs traces", curve: -50, from: "#0E7C7B", to: "#3DFF9A" },
    { ref: jev, Icon: Gauge, label: "Jev scores", curve: 0, from: "#0E7C7B", to: "#3DFF9A" },
    { ref: entire, Icon: GitCommitHorizontal, label: "Entire checkpoints", curve: 50, from: "#0E7C7B", to: "#3DFF9A" },
  ];
  const right = [
    { ref: crust, Icon: Building2, label: "Crustdata demo agent", curve: -50, from: "#FFB020", to: "#0E7C7B" },
    { ref: cfo, Icon: Calculator, label: "cfo.ai cost model", curve: 0, from: "#FFB020", to: "#0E7C7B" },
    { ref: voice, Icon: PhoneCall, label: "Voice approval call", curve: 50, from: "#FFB020", to: "#0E7C7B" },
  ];

  return (
    <section id="how" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <AnimatedContent distance={40}>
        <p className="font-mono text-xs tracking-widest text-emerald-400 uppercase">How it works</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          From one incident to a permanent gate.
        </h2>
      </AnimatedContent>

      <div className="mt-12 grid items-center gap-10 lg:grid-cols-2">
        <div
          ref={container}
          className="border-border bg-card/40 relative flex h-[360px] items-center justify-between overflow-hidden rounded-2xl border p-8"
        >
          <div className="z-10 flex h-full flex-col justify-between">
            {left.map(({ ref, Icon, label }) => (
              <BeamNode key={label} ref={ref} aria-label={label}>
                <Icon className="size-full" />
              </BeamNode>
            ))}
          </div>
          <BeamNode ref={hub} aria-label="Antibody" className="ring-primary/5 size-16 ring-8">
            <ShieldCheck className="size-full text-emerald-400" />
          </BeamNode>
          <div className="z-10 flex h-full flex-col justify-between">
            {right.map(({ ref, Icon, label }) => (
              <BeamNode key={label} ref={ref} aria-label={label}>
                <Icon className="size-full" />
              </BeamNode>
            ))}
          </div>

          {[...left, ...right].map(({ ref, curve, from, to }, i) => (
            <AnimatedBeam
              key={i}
              containerRef={container}
              fromRef={i < 3 ? ref : hub}
              toRef={i < 3 ? hub : ref}
              curvature={curve}
              gradientStartColor={from}
              gradientStopColor={to}
              delay={i * 0.3}
            />
          ))}
        </div>

        <ol className="grid gap-4">
          {STEPS.map(([name, text], i) => (
            <AnimatedContent key={name} distance={30} delay={i * 0.08}>
              <li className="flex gap-4">
                <span className="text-muted-foreground font-mono text-sm">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="font-medium">{name}</h3>
                  <p className="text-muted-foreground text-sm leading-6">{text}</p>
                </div>
              </li>
            </AnimatedContent>
          ))}
        </ol>
      </div>
    </section>
  );
}
