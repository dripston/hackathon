"use client";

import { getEvidence, getEvidenceApi } from "@/lib/api";
import type { EvidenceApiItem } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";
import { Dot, LabelBadge, PageHeader, Panel, PollNote, TraceLink, stamp } from "@/components/console/ui";

// GET /evidence items are loosely typed server-side, so read fields defensively.
const str = (v: unknown) => (typeof v === "string" ? v : null);
const num = (v: unknown) => (typeof v === "number" ? v : null);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

const ratio = (side: unknown, key: string) => str(obj(side)[key]);

export default function EvidencePage() {
  const ev = usePoll(getEvidence, 0);
  const live = usePoll(getEvidenceApi, 10_000);
  const items = ev.data?.items ?? [];
  const liveItems = live.data?.items ?? [];
  const incidents = liveItems.filter((i) => i.kind === "incident");
  const others = liveItems.filter((i) => i.kind !== "incident");

  return (
    <>
      <PageHeader title="Evidence for judges" mock={live.mock} />
      <PollNote poll={ev} />
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
          <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
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
          </div>
        </Panel>
      )}

      <h2 className="mt-10 mb-4 text-xl font-semibold">Live proof from Antibody</h2>
      <PollNote poll={live} />
      {live.loading && <p className="text-muted-foreground">Loading live proof…</p>}
      {live.data && !liveItems.length && <p className="text-muted-foreground">Antibody has no proof items yet.</p>}

      <div className="space-y-6">
        {incidents.map((it) => (
          <IncidentProof key={str(it.incident_id) ?? JSON.stringify(it)} item={it} />
        ))}
        {others.length > 0 && (
          <div className="grid gap-6 lg:grid-cols-3">
            {others.map((it) => (
              <OtherProof key={`${it.kind}-${str(it.created_at)}`} item={it} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function IncidentProof({ item }: { item: EvidenceApiItem }) {
  const approval = obj(item.approval);
  const attempts = Array.isArray(item.attempts) ? item.attempts.map(obj) : [];
  const traceIds = strs(item.trace_ids);
  const before = obj(item.before);
  const after = obj(item.after);
  const cost = num(item.cost_usd);
  const prUrl = str(item.pr_url);
  const commitUrl = str(item.commit_url);
  const checkpointUrl = str(item.checkpoint_url);

  return (
    <Panel
      title={
        <span className="flex items-center gap-3">
          {str(item.incident_id)}
          {item.label && <LabelBadge label={item.label} />}
          {item.seeded_bug === true && <LabelBadge label="SEEDED" />}
        </span>
      }
    >
      <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        <Row label="Detection">
          <span className="font-mono">{str(item.detection)}</span> · opened by {str(item.opened_by) ?? "—"} · {str(item.status)}
        </Row>
        <Row label="Before → after">
          {ratio(before, "must_fix") ?? "—"} → {ratio(after, "must_fix") ?? "—"} must_fix
          {ratio(after, "must_not_change") && <> · {ratio(after, "must_not_change")} kept</>}
        </Row>
        <Row label="Commit">
          {commitUrl ? (
            <a href={commitUrl} target="_blank" rel="noreferrer" className="font-mono underline decoration-dotted underline-offset-4">
              {str(item.commit)?.slice(0, 8)} ↗
            </a>
          ) : (
            "—"
          )}
        </Row>
        <Row label="Entire checkpoint">
          {checkpointUrl ? (
            <a href={checkpointUrl} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-4">
              open on Entire ↗
            </a>
          ) : (
            "none"
          )}
        </Row>
        <Row label="Pull request">
          {prUrl ? (
            <a href={prUrl} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-4">
              #{prUrl.split("/").pop()} ↗
            </a>
          ) : (
            "—"
          )}
        </Row>
        <Row label="Approval">
          {str(approval.phrase) ? (
            <>
              “{str(approval.phrase)}” via {str(approval.channel)}
              {str(approval.at) && <> at {stamp(str(approval.at) as string)}</>}
            </>
          ) : (
            "—"
          )}
        </Row>
        <Row label="Cost">{cost != null ? `$${cost.toFixed(4)}` : "—"}</Row>
        <Row label="Attempts">
          {attempts.length ? attempts.map((a) => `${str(a.id)}${a.accepted === true ? " ✓" : ""}`).join(", ") : "—"}
        </Row>
      </dl>
      {str(item.reasoning) && (
        <blockquote className="border-border mt-5 border-l-2 pl-4 leading-7">
          “{str(item.reasoning)}”
          <span className="text-muted-foreground mt-1 block text-sm">source: {str(item.reasoning_source)?.replace(/_/g, " ")}</span>
        </blockquote>
      )}
      {traceIds.length > 0 && (
        <details className="mt-4">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm">{traceIds.length} neatlogs traces</summary>
          <ul className="mt-2 space-y-1">
            {traceIds.map((t) => (
              <li key={t}>
                <TraceLink id={t} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}

function OtherProof({ item }: { item: EvidenceApiItem }) {
  const created = str(item.created_at);
  return (
    <Panel
      title={
        <span className="flex items-center gap-3">
          {item.kind}
          {item.label && <LabelBadge label={item.label.split(" ")[0]} />}
        </span>
      }
    >
      {item.kind === "gate" && (
        <p>
          <span className="font-mono">{str(item.branch)}</span>: <strong>{str(item.verdict)?.toUpperCase()}</strong> across{" "}
          {Array.isArray(item.families) ? item.families.length : 0} families.
        </p>
      )}
      {item.kind === "backtest" && (
        <p>
          Caught <strong>{num(item.caught) ?? "—"}</strong> of {num(item.families) ?? "—"} families · false alarms{" "}
          {num(item.false_alarms) ?? "—"} of {num(item.clean_checks) ?? "—"} clean checks.
        </p>
      )}
      {item.kind === "costs" && (
        <p>
          {num(item.real_incidents) ?? "—"} real incidents · average ${num(item.avg_ledger_cost_usd_real)?.toFixed(4) ?? "—"} per fix ·{" "}
          {num(item.avg_duration_ms_real) != null ? `${Math.round((num(item.avg_duration_ms_real) as number) / 1000)} s` : "—"} average.
          {str(item.note) && <span className="text-muted-foreground mt-2 block text-sm">{str(item.note)}</span>}
        </p>
      )}
      {created && <p className="text-muted-foreground mt-3 text-sm">{stamp(created)}</p>}
    </Panel>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
