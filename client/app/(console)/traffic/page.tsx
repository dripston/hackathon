"use client";

import { Traffic } from "@/components/control/traffic";
import { VitalsStrip } from "@/components/control/side-panels";

export default function TrafficPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Live traffic</h1>
        <p className="text-muted-foreground mt-1">Every request the agent served, checked for silent failures as it happens. Click a run to see what the user got.</p>
      </div>
      <VitalsStrip />
      <Traffic />
    </div>
  );
}
