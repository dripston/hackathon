"use client";

import { getEvidence } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { Dot, ErrorNote, LabelBadge, PageHeader, Panel } from "@/components/console/ui";

export default function EvidencePage() {
  const ev = usePoll(getEvidence, 0);
  const items = ev.data?.items ?? [];

  return (
    <>
      <PageHeader title="Evidence for judges" />
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
    </>
  );
}
