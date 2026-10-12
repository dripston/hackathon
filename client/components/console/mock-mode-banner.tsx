"use client";

import { USE_MOCK } from "@/lib/api";

export function MockModeBanner() {
  return USE_MOCK ? <p className="relative z-30 mt-20 border-y border-amber-400/50 p-3 text-center font-mono text-amber-300">MOCK DATA · captured API samples · read-only</p> : null;
}
