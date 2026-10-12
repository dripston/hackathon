"use client";

import Link from "next/link";
import { getEvidence } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { Page, PageHeader, Panel, Pill, label } from "@/components/control/panel";
import { ErrorNote, MockBadge } from "@/components/console/ui";

function readable(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export default function EvidencePage() {
  const report = usePoll(getEvidence, 10000);
  const incidents = report.data?.items.filter(i => i.kind === "incident") ?? [];
  const supporting = report.data?.items.filter(i => i.kind !== "incident") ?? [];
  return <Page>
    <PageHeader title="Follow the evidence." description="Start with an issue, inspect its cause and attempted repairs, then compare the saved checks. Every record below comes from the server’s evidence report." actions={<MockBadge show={report.mock} />} />
    <ErrorNote error={report.error} updatedAt={report.updatedAt} />
    {report.loading && <p>Loading evidence…</p>}
    {report.data && <p className="text-muted-foreground text-sm">Source: {report.data.source} · Report generated {report.data.created_at}</p>}
    <div className="grid gap-5 lg:grid-cols-2">{incidents.map((item, index) => {
      const id = readable(item.incident_id);
      const detection = readable(item.detection);
      return <Panel key={id ?? index} title={detection ? label(detection) : "Issue record"} action={item.label ? <Pill>{item.label}</Pill> : undefined}>
        <p className="text-muted-foreground text-sm leading-7">{readable(item.explanation) ?? "Open the issue for the investigation and repair history."}</p>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div><dt className="text-muted-foreground">Recorded status</dt><dd className="mt-1">{readable(item.status)?.replaceAll("_", " ") ?? "Not recorded"}</dd></div>
          <div><dt className="text-muted-foreground">Recorded cost</dt><dd className="mt-1">{typeof item.cost_usd === "number" ? `$${item.cost_usd.toFixed(3)}` : "Not recorded"}</dd></div>
        </dl>
        {id && <Link href={`/incidents/${encodeURIComponent(id)}`} className="mt-5 inline-block font-medium underline underline-offset-4">Read the issue and review its evidence →</Link>}
        <details className="border-border mt-5 border-t pt-4"><summary className="cursor-pointer text-sm">Original evidence record</summary><pre className="bg-muted mt-3 max-h-96 overflow-auto rounded-lg p-4 text-xs">{JSON.stringify(item, null, 2)}</pre></details>
      </Panel>;
    })}</div>
    {report.data && !report.error && !incidents.length && <Panel title="No issue evidence recorded yet"><p className="text-muted-foreground">An investigation will add its traces, diagnosis, attempted fixes, and results here.</p></Panel>}
    <Panel title="Supporting reports" description="Release checks and retrospective results provide context for the individual issues.">
      <div className="flex flex-wrap gap-5"><Link href="/immunity" className="underline underline-offset-4">Read release checks and known misses →</Link><Link href="/traffic" className="underline underline-offset-4">Inspect agent answers →</Link></div>
      {supporting.map((item, index) => <details key={item.kind + index} className="border-border mt-4 border-t pt-4"><summary className="cursor-pointer text-sm">{label(item.kind)} · {item.label ?? "Recorded report"}</summary><pre className="bg-muted mt-3 max-h-96 overflow-auto rounded-lg p-4 text-xs">{JSON.stringify(item, null, 2)}</pre></details>)}
    </Panel>
  </Page>;
}
