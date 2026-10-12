import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Mark } from "@/components/story/site-header";
import { Reveal } from "@/components/story/reveal";

const STACK = [
  { name: "neatlogs", role: "traces every run; detections open incidents" },
  { name: "Entire", role: "the reasoning behind the commit that broke it" },
  { name: "Crustdata", role: "real company data the agent researches" },
  { name: "TypeSafe Jev", role: "grounding score on every brief" },
  { name: "Telegram + Sarvam", role: "the on-call voice call" },
];

export function Closing() {
  return (
    <>
      <section className="mx-auto max-w-7xl px-6 py-24">
        <p className="eyebrow">Built with</p>
        <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-border sm:grid-cols-2 lg:grid-cols-5">
          {STACK.map((s) => (
            <div key={s.name} className="bg-card/40 p-5">
              <p className="font-semibold">{s.name}</p>
              <p className="text-muted-foreground mt-1 text-sm">{s.role}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="monitor-grid border-border/60 border-t">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-8 px-6 py-24 sm:flex-row sm:items-center sm:justify-between">
          <Reveal>
            <h2 className="text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Watch it live.</h2>
            <p className="text-muted-foreground mt-3 max-w-xl text-lg">
              The console shows the agent&apos;s real traffic, open incidents, the gate and the trust report, updating every
              two seconds.
            </p>
          </Reveal>
          <Link
            href="/live"
            className="bg-healthy text-background hover:bg-healthy/90 glow-healthy inline-flex items-center gap-2 rounded-full px-6 py-3 text-lg font-medium transition-colors"
          >
            Open the live console <ArrowRight className="size-5" />
          </Link>
        </div>
      </section>

      <footer className="border-border/60 border-t">
        <div className="text-muted-foreground mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-6 py-8 text-sm">
          <span className="text-foreground flex items-center gap-2 font-medium">
            <Mark className="size-5" /> Antibody
          </span>
          <span>Team airo · neatHack 2026</span>
          <a href="https://github.com/dripston/hackathon" target="_blank" rel="noreferrer" className="hover:text-foreground ml-auto">
            github.com/dripston/hackathon
          </a>
        </div>
      </footer>
    </>
  );
}
