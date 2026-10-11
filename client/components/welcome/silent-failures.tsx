"use client";

import { SearchX, UserX, ShieldOff } from "lucide-react";
import AnimatedContent from "@/components/AnimatedContent";
import SpotlightCard from "@/components/SpotlightCard";

const FAILURES = [
  {
    icon: SearchX,
    title: "“No results” that were really a rate limit",
    body: "A tool is throttled, the agent shrugs and reports nothing found. Status 200. The customer gets a confident, wrong answer.",
  },
  {
    icon: UserX,
    title: "People who never appeared in the data",
    body: "The summary names two executives that exist in no tool result. A tripwire: every person named must appear in evidence.",
  },
  {
    icon: ShieldOff,
    title: "A verification step quietly skipped",
    body: "A prompt tweak removes the check to save latency. Nothing crashes, tests still pass, quality drifts for days.",
  },
];

export function SilentFailures() {
  return (
    <section id="problem" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <AnimatedContent distance={40}>
        <p className="font-mono text-xs tracking-widest text-amber-400 uppercase">Silent failures</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Nothing crashed. That&apos;s the problem.
        </h2>
      </AnimatedContent>

      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {FAILURES.map(({ icon: Icon, title, body }, i) => (
          <AnimatedContent key={title} distance={40} delay={i * 0.1}>
            <SpotlightCard spotlightColor="rgba(255, 176, 32, 0.18)" className="h-full p-6">
              <Icon className="size-6 text-amber-400" aria-hidden />
              <h3 className="mt-4 text-lg font-medium">{title}</h3>
              <p className="text-muted-foreground mt-2 text-sm leading-6">{body}</p>
            </SpotlightCard>
          </AnimatedContent>
        ))}
      </div>
    </section>
  );
}
