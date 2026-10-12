"use client";

import { Traffic } from "@/components/control/traffic";
import { Page, PageHeader } from "@/components/control/panel";

export default function TrafficPage() {
  return (
    <Page>
      <PageHeader title="See the answer. Check the evidence." description="An agent can finish a task and still be wrong. These checks compare its research brief with the tool results behind it." />

      <Traffic />
    </Page>
  );
}
