"use client";

import type { ReactNode } from "react";
import { getSystemInfo } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { Page, PageHeader, Pill } from "@/components/control/panel";

export default function SettingsPage() {
  const s = usePoll(getSystemInfo, 30000).data?.settings;
  return (
    <Page className="max-w-4xl">
      <PageHeader
        title="Settings"
        description={<>How Antibody behaves for this workspace. Set on the server in the repo&apos;s <span className="font-mono">.env</span> and shown read-only here.</>}
        actions={<Pill>Read-only</Pill>}
      />
      {!s && <p className="text-muted-foreground">Loading…</p>}
      {s && (
        <>
          <Group title="Approvals">
            <Row label="Merge rule" value={s.approval_rule} />
            <Row label="Where" value="Telegram on-call (voice or text) or the incident page" />
          </Group>
          <Group title="Fix pipeline">
            <Row label="Opens an incident when" value={s.intake} />
            <Row label="Variant family size" value={`${s.family_size} scenarios (must fix + must not change)`} />
            <Row label="Fix attempts" value={`up to ${s.max_attempts}, then it escalates to a human`} />
            <Row label="Cost cap per incident" value={`$${s.cost_cap_usd.toFixed(2)}`} />
          </Group>
          <Group title="Shipping">
            <Row label="Fixes ship as" value={s.ship_target === "github" ? "GitHub pull requests" : "local merges"} />
            <Row label="Deploy gate guards" value={s.deploy_branch} />
          </Group>
          <Group title="On-call">
            <Row label="Checks for decisions every" value={`${s.oncall_poll_seconds} seconds`} />
            <Row label="Who gets called" value="the chat that last sent /oncall to @anti_body_bot" />
          </Group>
        </>
      )}
    </Page>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 md:grid-cols-[180px_1fr] md:gap-6">
      <h2 className="text-sm font-medium md:pt-3.5">{title}</h2>
      <div className="border-border bg-card overflow-hidden rounded-xl border">
        <dl className="divide-border divide-y">{children}</dl>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-5 py-3.5">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-sm font-medium sm:text-right">{value}</dd>
    </div>
  );
}
