"use client";

import { use, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getBrief, getIncident } from "@/lib/api";
import type { FamilyResult, FixAttempt } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";
import { ApprovalBox } from "@/components/console/approval-box";
import { DiffView } from "@/components/console/diff-view";
import { ScenarioGrid } from "@/components/console/scenario-grid";
import { ErrorNote, MockBadge, TraceLink, ago } from "@/components/console/ui";
import { cn } from "@/lib/utils";

export function IncidentView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const incidentId = decodeURIComponent(id);
  const detail = usePoll(() => getIncident(incidentId), 2000, incidentId);
  const brief = usePoll(() => getBrief(incidentId), 0, incidentId);
  const [approvedLocally, setApprovedLocally] = useState(false);

  if (!detail.data) {
    return (
      <div className="space-y-4">
        <BackLink />
        {detail.loading ? <p className="text-muted-foreground">Loading incident…</p> : <ErrorNote error={detail.error} />}
      </div>
    );
  }

  const d = detail.data;
  const { incident, diagnosis, resolution } = d;
  const scenarios = d.scenarios ?? [];
  const baseline = d.families.find((f) => f.candidate === "baseline") ?? resolution?.before ?? null;
  const familyFor = (fixId: string) => d.families.find((f) => f.candidate === fixId) ?? null;
  const attempts: FixAttempt[] =
    d.fixes ??
    (resolution?.attempts ?? []).map((fid) => ({
      id: fid,
      diff: "",
      verdict: fid === resolution?.accepted_fix_id ? "accepted" : "rejected",
      reason: null,
    }));
  const pending = attempts.find((a) => a.verdict === "pending");
  const resolved = incident.status === "resolved" || approvedLocally;

  return (
    <div className="mx-auto max-w-6xl">
      <BackLink />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-semibold">{incident.id}</h1>
        <MockBadge show={detail.mock} />
        <span
          className={cn(
            "ml-auto rounded-full px-3 py-1 font-mono text-sm",
            resolved ? "bg-healthy/15 text-healthy" : "bg-infected/15 text-infected",
          )}
        >
          {resolved ? "resolved" : incident.status.replace(/_/g, " ")}
        </span>
      </div>
      <ErrorNote error={detail.error} />

      {brief.data?.text && (
        <p className="border-border text-muted-foreground mt-4 border-l-2 pl-4 text-lg leading-8">{brief.data.text}</p>
      )}

      <ol className="mt-10">
        <Stage n={1} title="Detected" done>
          <p className="text-lg">
            <span className="text-infected font-mono">{incident.detection}</span> fired on{" "}
            <strong>{incident.trace_ids.length}</strong> traces in <span className="font-mono">{incident.workflow}</span>, first
            seen {ago(incident.first_seen)}.
          </p>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
            {incident.trace_ids.map((t) => (
              <li key={t}>
                <TraceLink id={t} />
              </li>
            ))}
          </ul>
        </Stage>

        <Stage n={2} title="Diagnosed" done={!!diagnosis}>
          {diagnosis ? (
            <>
              <p className="text-muted-foreground">
                Caused by commit <code className="text-foreground font-mono">{diagnosis.commit_sha.slice(0, 10)}</code> ·{" "}
                {diagnosis.fix_kind.replace(/_/g, " ")}
              </p>
              <figure className="border-infected/40 bg-infected/[0.06] mt-4 rounded-2xl border p-8">
                <p className="text-muted-foreground font-mono text-sm tracking-wider uppercase">
                  Entire checkpoint · the reasoning behind the change
                </p>
                <blockquote className="mt-4 text-2xl leading-10 font-medium sm:text-3xl sm:leading-[1.4]">
                  “{diagnosis.reasoning_excerpt}”
                </blockquote>
                <figcaption className="mt-6">
                  <a
                    href={diagnosis.checkpoint_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-foreground inline-flex items-center gap-2 font-mono text-sm underline decoration-dotted underline-offset-4"
                  >
                    {diagnosis.checkpoint_id} on Entire <ExternalLink className="size-4" />
                  </a>
                </figcaption>
              </figure>
              <p className="mt-4 text-lg leading-8">{diagnosis.explanation}</p>
              {diagnosis.good_trace_ids.length > 0 && (
                <p className="text-muted-foreground mt-2 text-sm">
                  Compared with healthy runs:{" "}
                  {diagnosis.good_trace_ids.map((t, i) => (
                    <span key={t}>
                      {i > 0 && ", "}
                      <TraceLink id={t} />
                    </span>
                  ))}
                </p>
              )}
            </>
          ) : (
            <Waiting>Reading traces and the Entire checkpoint…</Waiting>
          )}
        </Stage>

        <Stage n={3} title="Family" done={scenarios.length > 0}>
          {scenarios.length ? (
            <>
              <p className="text-lg">
                <strong>{scenarios.filter((s) => s.role === "must_fix").length}</strong> must_fix and{" "}
                <strong>{scenarios.filter((s) => s.role === "must_not_change").length}</strong> must_not_change scenarios, replayed
                on recorded tool responses.
              </p>
              <ul className="mt-3 grid gap-x-8 gap-y-1 font-mono text-sm sm:grid-cols-2">
                {scenarios.map((s) => (
                  <li key={s.id} className="flex gap-3">
                    <span className={s.role === "must_fix" ? "text-infected" : "text-muted-foreground"}>
                      {s.role === "must_fix" ? "fix " : "keep"}
                    </span>
                    <span>{s.domain}</span>
                    <span className="text-muted-foreground ml-auto">
                      {s.faults[0] ? `${s.faults[0].error.code} @${s.faults[0].at_call}` : "no fault"}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Waiting>Breeding variants of the failure…</Waiting>
          )}
        </Stage>

        <Stage n={4} title="Baseline" done={!!baseline}>
          {baseline && scenarios.length ? (
            <ScenarioGrid scenarios={scenarios} from={baseline} />
          ) : baseline ? (
            <FamilyLine family={baseline} />
          ) : (
            <Waiting>Running the family against the current agent…</Waiting>
          )}
        </Stage>

        <Stage n={5} title="Attempts" done={attempts.some((a) => a.verdict !== "pending")}>
          {attempts.length ? (
            <ul className="space-y-6">
              {attempts.map((a) => {
                const fam = familyFor(a.id);
                return (
                  <li key={a.id} className="border-border rounded-xl border p-5">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-lg font-semibold">{a.id}</span>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 font-mono text-sm",
                          a.verdict === "accepted" && "bg-healthy/15 text-healthy",
                          a.verdict === "rejected" && "bg-infected/15 text-infected",
                          a.verdict === "pending" && "bg-muted text-foreground",
                        )}
                      >
                        {a.verdict === "pending" ? "passes · awaiting approval" : a.verdict}
                      </span>
                    </div>
                    {a.reason && <p className="text-infected mt-2">{a.reason}</p>}
                    {a.diff && (
                      <details className="mt-3" open={a.verdict !== "rejected"}>
                        <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm">Diff</summary>
                        <div className="mt-2">
                          <DiffView diff={a.diff} />
                        </div>
                      </details>
                    )}
                    {fam && baseline && scenarios.length > 0 && (
                      <div className="mt-4">
                        <ScenarioGrid
                          scenarios={scenarios}
                          from={baseline}
                          to={fam}
                          size={a.verdict === "rejected" ? "sm" : "lg"}
                        />
                      </div>
                    )}
                    {fam && !scenarios.length && <FamilyLine family={fam} />}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Waiting>Writing and testing fixes…</Waiting>
          )}
        </Stage>

        <Stage n={6} title="Shipped" done={resolved}>
          {resolution?.pr_url ? (
            <dl className="grid gap-4 sm:grid-cols-4">
              <Fact label="Pull request">
                <a href={resolution.pr_url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-4">
                  #{resolution.pr_url.split("/").pop()} ↗
                </a>
              </Fact>
              <Fact label="Cost">${resolution.cost_usd.toFixed(2)}</Fact>
              <Fact label="Time">{Math.round(resolution.duration_ms / 60000)} min</Fact>
              <Fact label="Approval">
                {resolution.approval ? (
                  <span className="text-healthy">
                    “{resolution.approval.phrase}” · {resolution.approval.channel}
                  </span>
                ) : (
                  "—"
                )}
              </Fact>
            </dl>
          ) : approvedLocally ? (
            <p className="text-healthy text-lg">Approved. Antibody is opening the pull request.</p>
          ) : (
            <Waiting>Ships as a pull request once approved.</Waiting>
          )}
        </Stage>

        {pending && !resolved && (
          <Stage n={7} title="Approval" done={false} last>
            <ApprovalBox incidentId={incident.id} fixId={pending.id} onApproved={() => setApprovedLocally(true)} />
          </Stage>
        )}
      </ol>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
      <ArrowLeft className="size-4" /> Live ward
    </Link>
  );
}

function Stage({ n, title, done, last, children }: { n: number; title: string; done: boolean; last?: boolean; children: ReactNode }) {
  return (
    <li className="relative flex gap-6 pb-12">
      {!last && <span className="bg-border absolute top-10 bottom-0 left-[19px] w-px" aria-hidden />}
      <span
        className={cn(
          "z-10 flex size-10 shrink-0 items-center justify-center rounded-full border font-mono text-sm",
          done ? "border-healthy bg-healthy/15 text-healthy" : "border-border text-muted-foreground",
        )}
      >
        {done ? "✓" : n}
      </span>
      <div className="min-w-0 flex-1 pt-1.5">
        <h2 className={cn("mb-4 text-xl font-semibold", !done && "text-muted-foreground")}>{title}</h2>
        {children}
      </div>
    </li>
  );
}

function Waiting({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground animate-pulse">{children}</p>;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-border rounded-lg border p-4">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="mt-1 font-mono text-lg">{children}</dd>
    </div>
  );
}

function FamilyLine({ family }: { family: FamilyResult }) {
  return (
    <p className="font-mono text-2xl">
      {family.must_fix_passed}/{family.must_fix_total} must_fix · {family.must_not_change_passed}/{family.must_not_change_total}{" "}
      must_not_change
    </p>
  );
}
