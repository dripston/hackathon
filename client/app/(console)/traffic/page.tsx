"use client";

import { Traffic } from "@/components/control/traffic";
import { VitalsStrip } from "@/components/control/side-panels";
import { Page, PageHeader } from "@/components/control/panel";

export default function TrafficPage() {
  return (
    <Page>
      <PageHeader title="Traffic" description="Every request the agent served, checked for silent failures as it happens. Select a run to see what the user got." />
      <VitalsStrip />
      <Traffic />
    </Page>
  );
}
