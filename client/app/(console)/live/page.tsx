"use client";

import { DrillBar } from "@/components/control/drill-bar";
import { Traffic } from "@/components/control/traffic";
import { IncidentPanel } from "@/components/control/incident-panel";
import { Forecasts, GatePanel, History, VitalsStrip } from "@/components/control/side-panels";

export default function MissionControl() {
  return (
    <div className="space-y-5">
      <DrillBar />
      <VitalsStrip />
      <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        <Traffic />
        <IncidentPanel />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Forecasts />
        <GatePanel />
        <History />
      </div>
    </div>
  );
}
