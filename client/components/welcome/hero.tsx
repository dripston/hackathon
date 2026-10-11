"use client";

import Aurora from "@/components/Aurora";
import BlurText from "@/components/BlurText";
import ShinyText from "@/components/ShinyText";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <div className="absolute inset-0 -z-10 opacity-60" aria-hidden>
        <Aurora colorStops={["#0E7C7B", "#FFB020", "#0E7C7B"]} amplitude={0.8} blend={0.6} />
      </div>
      <div className="from-background/0 to-background absolute inset-0 -z-10 bg-gradient-to-b" aria-hidden />

      <div className="mx-auto flex max-w-5xl flex-col items-center px-4 pt-28 pb-24 text-center sm:px-6 sm:pt-36">
        <span className="border-border text-muted-foreground mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs">
          <span className="size-1.5 rounded-full bg-amber-400" />
          HTTP 200 · and still wrong
        </span>

        <BlurText
          text="The others fix agents that crash."
          delay={120}
          animateBy="words"
          className="justify-center text-4xl font-semibold tracking-tight sm:text-6xl"
        />
        <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-6xl">
          <ShinyText text="Antibody catches the ones that don't." color="#a1a1aa" shineColor="#FFB020" speed={3} />
        </h1>

        <p className="text-muted-foreground mt-6 max-w-2xl text-base leading-7 sm:text-lg">
          Production agents rarely fail loudly. They answer politely, return 200, and do the wrong thing. Antibody is the
          on-call system that finds those silent failures, proves a fix, and immunises you against them.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a href="#incident" className={cn(buttonVariants({ size: "lg" }), "h-11 px-5 text-sm")}>
            Watch a real incident
          </a>
          <a href="#how" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-5 text-sm")}>
            How it works
          </a>
        </div>
      </div>
    </section>
  );
}
