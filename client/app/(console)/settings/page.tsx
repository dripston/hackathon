"use client";

import type { ReactNode } from "react";
import { getSystemInfo } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";

export default function SettingsPage() {
  const s = usePoll(getSystemInfo, 30000).data?.settings;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">How Antibody behaves for this workspace. Configured on the server in the repo&apos;s <span className="font-mono">.env</span>.</p>
      </div>
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
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-border bg-card/60 overflow-hidden rounded-2xl border shadow-lg shadow-black/10">
      <h2 className="border-border border-b px-5 py-3 text-sm font-medium">{title}</h2>
      <dl className="divide-border divide-y">{children}</dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[220px_1fr]">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}
