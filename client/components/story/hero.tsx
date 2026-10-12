"use client";

import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { motion } from "motion/react";
import { Ecg } from "@/components/story/ecg";
import { Vitals } from "@/components/story/vitals";

const ease = [0.2, 0.7, 0.2, 1] as const;
const rise = (delay: number) => ({
  initial: { opacity: 0, y: 18, filter: "blur(8px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  transition: { duration: 0.8, delay, ease },
});

export function Hero() {
  return (
    <section className="monitor-grid relative overflow-hidden pt-32 pb-24 sm:pt-40">
      {/* Ambient light: one healthy, one infected, drifting slowly. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="bg-healthy/20 animate-drift-a absolute top-24 right-[12%] size-[420px] rounded-full blur-[120px]" />
        <div className="bg-infected/15 animate-drift-b absolute top-64 right-[30%] size-[300px] rounded-full blur-[120px]" />
        <div className="from-background absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t to-transparent" />
      </div>

      <div className="relative mx-auto grid max-w-7xl gap-14 px-6 lg:grid-cols-[1.05fr_1fr] lg:items-center">
        <div>
          <motion.p {...rise(0)} className="eyebrow flex items-center gap-2">
            <span className="bg-healthy animate-vital size-1.5 rounded-full" />
            On-call for AI agents
          </motion.p>
          <h1 className="mt-6 text-5xl leading-[1.02] font-semibold tracking-[-0.04em] sm:text-7xl">
            <motion.span {...rise(0.1)} className="block">
              Your agent said 200&nbsp;OK.
            </motion.span>
            <motion.span
              className="text-infected mt-1 block"
              initial={{ opacity: 0, filter: "blur(14px)", y: 10 }}
              animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
              transition={{ delay: 0.75, duration: 0.9, ease }}
            >
              It was wrong.
            </motion.span>
          </h1>
          <motion.p {...rise(1.05)} className="text-muted-foreground mt-7 max-w-xl text-lg leading-relaxed">
            AI agents fail without crashing: a polished answer built on a tool call that quietly failed. Antibody
            catches it in production, finds the commit that caused it, proves a fix on a family of variants, and calls
            you to approve it, by voice.
          </motion.p>
          <motion.div {...rise(1.25)} className="mt-9 flex flex-wrap items-center gap-3">
            <a
              href="#replay"
              className="bg-healthy text-background hover:bg-healthy/90 glow-healthy group inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-medium transition-all hover:scale-[1.03]"
            >
              <Play className="size-4 fill-current transition-transform group-hover:scale-110" /> Replay a real incident
            </a>
            <Link
              href="/live"
              className="border-border hover:bg-accent group inline-flex items-center gap-2 rounded-full border px-5 py-2.5 font-medium transition-colors"
            >
              Open the app <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1, delay: 0.35, ease }}
          className="border-border bg-card/60 relative overflow-hidden rounded-2xl border p-5 shadow-2xl shadow-black/50 backdrop-blur"
        >
          {/* A faint scanline sweeping the monitor. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-transparent via-healthy/[0.05] to-transparent animate-scan" aria-hidden />
          <div className="flex items-center justify-between">
            <p className="eyebrow">Patient · company-research agent</p>
            <p className="text-healthy flex items-center gap-1.5 font-mono text-xs">
              <span className="bg-healthy animate-vital size-1.5 rounded-full" /> LIVE
            </p>
          </div>
          <Ecg className="mt-3" height={170} />
          <p className="text-muted-foreground mt-1 text-sm">
            Every response is <span className="text-foreground font-mono">200&nbsp;OK</span>. One in five is
            <span className="text-infected"> wrong</span>. Logs can&apos;t tell the difference.
          </p>
          <Vitals />
        </motion.div>
      </div>
    </section>
  );
}
