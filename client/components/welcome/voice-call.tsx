"use client";

import { PhoneCall } from "lucide-react";
import AnimatedContent from "@/components/AnimatedContent";
import TextType from "@/components/TextType";

const TRANSCRIPT = [
  "Antibody: Your research agent is returning 200 but dropping results. A tool was rate-limited, and the agent reported “no results”. This started after Tuesday's prompt change.",
  "Antibody: I replayed 24 variants of this failure on recorded tool responses. The fix passes all 24, with no regressions. Say “ship the fix for incident 142” to approve.",
  "You: Ship the fix for incident 142.",
];

export function VoiceCall() {
  return (
    <section id="incident" className="mx-auto max-w-4xl px-4 py-24 sm:px-6">
      <AnimatedContent distance={40}>
        <p className="font-mono text-xs tracking-widest text-amber-400 uppercase">03:12 · incoming call</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          You approve a fix that&apos;s already proven.
        </h2>
        <div className="border-border bg-card/50 mt-8 rounded-2xl border p-6">
          <div className="text-muted-foreground flex items-center gap-2 font-mono text-xs">
            <PhoneCall className="size-4 animate-pulse text-emerald-400" aria-hidden /> Antibody voice agent · live
          </div>
          <TextType
            as="p"
            text={TRANSCRIPT}
            typingSpeed={25}
            pauseDuration={2500}
            loop
            startOnVisible
            className="mt-4 min-h-28 font-mono text-sm leading-7"
            cursorClassName="text-amber-400"
          />
        </div>
      </AnimatedContent>
    </section>
  );
}
