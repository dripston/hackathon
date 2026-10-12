"use client";

import { getEvidence, getEvidenceChecklist } from "@/lib/api";
import type { EvidenceApi } from "@/lib/types";
import Link from "next/link";
import { usePoll } from "@/lib/use-poll";
import { Dot, ErrorNote, LabelBadge, PageHeader, Panel, MockBadge, TraceLink } from "@/components/console/ui";

export default function EvidencePage() {
  const ev = usePoll(getEvidenceChecklist, 0);
  const proof = usePoll(getEvidence);
  const items = ev.data?.items ?? [];

  return (
    <>
      <PageHeader title="Evidence for judges" mock={proof.mock} />
      <ErrorNote error={ev.error} />
      {ev.loading && <p className="text-muted-foreground">Loading evidence…</p>}

      {ev.data && !items.length && (
        <Panel>
          <p className="text-xl">No evidence collected yet.</p>
          <p className="text-muted-foreground mt-2">
            Add items to <code className="font-mono">evidence/index.json</code>: neatlogs traces, detections, Entire checkpoints, the
            cfo.ai plan, X posts and the trust report.
          </p>
        </Panel>
      )}

      {items.length > 0 && (
        <Panel>
          <table className="w-full text-left">
            <thead className="text-muted-foreground text-sm">
              <tr>
                <th className="pb-3 font-normal">Requirement</th>
                <th className="pb-3 font-normal">Data</th>
                <th className="pb-3 font-normal">Links</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-border border-t align-top">
                  <td className="py-3 pr-6">
                    <span className="flex items-center gap-3">
                      <Dot passed={it.status === "done"} title={it.status} />
                      {it.requirement}
                    </span>
                    {it.note && <p className="text-muted-foreground mt-1 pl-6 text-sm">{it.note}</p>}
                  </td>
                  <td className="py-3 pr-6">
                    <LabelBadge label={it.label} />
                  </td>
                  <td className="py-3">
                    {it.links.length ? (
                      <ul className="space-y-1">
                        {it.links.map((l) => (
                          <li key={l.url}>
                            <a href={l.url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-4">
                              {l.title} ↗
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-muted-foreground">pending</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
      <Panel title="Live proof from Antibody" className="mt-6">
        <ErrorNote error={proof.error} updatedAt={proof.updatedAt} />
        {proof.loading && <p>Loading live proof…</p>}
        {proof.data?.items.length === 0 && <p>No proof recorded yet.</p>}
        <div className="space-y-6">{proof.data?.items.map((item, i) => <Proof key={i} item={item} />)}</div>
      </Panel>
    </>
  );
}

function Proof({ item }: { item: EvidenceApi["items"][number] }) {
  const text = (key: string) => typeof item[key] === "string" ? item[key] as string : null;
  const incidentId = text("incident_id");
  return <article className="border-border rounded-lg border p-4">
    <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold capitalize">{item.kind}</h3>{item.label && <LabelBadge label={item.label} />}<MockBadge show={item.label === "MOCK"} />{item.seeded_bug === true && <LabelBadge label="SEEDED" />}</div>
    {incidentId && <Link href={`/incidents/${encodeURIComponent(incidentId)}`} className="mt-2 block break-all font-mono underline">{incidentId}</Link>}
    {text("detection") && <p className="mt-2 break-all font-mono">{text("detection")} · {text("status")} · opened by {text("opened_by")}</p>}
    {text("reasoning") && <blockquote className="border-border mt-3 border-l-2 pl-3">{text("reasoning")}<footer className="text-muted-foreground text-sm">{text("reasoning_source")?.replace(/_/g, " ")}</footer></blockquote>}
    {text("explanation") && <p className="mt-3">{text("explanation")}</p>}
    <div className="mt-3 flex flex-wrap gap-4">{["commit_url", "checkpoint_url", "pr_url"].map(key => {
      const url = text(key);
      return url && /^https?:\/\//.test(url) ? <a key={key} href={url} target="_blank" rel="noreferrer" className="underline">{key.replace("_url", "").replace(/_/g, " ")} ↗</a> : null;
    })}</div>
    {Array.isArray(item.trace_ids) && <details className="mt-3"><summary>Traces ({item.trace_ids.length})</summary><ul className="space-y-1">{item.trace_ids.filter((t): t is string => typeof t === "string").map(t => <li key={t}><TraceLink id={t} /></li>)}</ul></details>}
    <dl className="mt-3 grid gap-3 sm:grid-cols-2">{["before", "after", "approval", "cost_usd", "duration_ms", "verdict", "created_at", "caught", "families", "false_alarms", "clean_checks", "avg_ledger_cost_usd_real"].filter(key => item[key] != null).map(key => <div key={key}><dt className="text-muted-foreground text-sm">{key.replace(/_/g, " ")}</dt><dd className="whitespace-pre-wrap break-words font-mono text-sm">{typeof item[key] === "object" ? JSON.stringify(item[key], null, 2) : String(item[key])}</dd></div>)}</dl>
  </article>;
}
