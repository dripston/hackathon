"use client";

import { use, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Mic } from "lucide-react";
import { GITHUB_REPO, getAftercare, getBrief, getIncident } from "@/lib/api";
import type { Aftercare, FamilyResult, IncidentDetail, Scenario } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";
import { ApprovalBox } from "@/components/console/approval-box";
import { DiffView } from "@/components/console/diff-view";
import { ScenarioGrid } from "@/components/console/scenario-grid";
import { LabelBadge, MockBadge, PollNote, TraceLink, stamp } from "@/components/console/ui";
import { cn } from "@/lib/utils";

const TERMINAL = ["resolved", "escalated"];
const AFTERCARE_ACTIVE: Aftercare["state"][] = ["pulling", "gating", "backtesting"];

/** GitHub repo slug: env var first, else read it from the Entire checkpoint URL (entire.io/gh/OWNER/REPO/commit/...). */
function repoSlug(checkpointUrl: string | null | undefined) {
  if (GITHUB_REPO) return GITHUB_REPO;
  const m = checkpointUrl?.match(/entire\.io\/gh\/([^/]+\/[^/]+)\//);
  return m ? m[1] : null;
}

export function IncidentView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const incidentId = decodeURIComponent(id);

  // Fast while the pipeline runs, slow once the incident is resolved or escalated.
  const [detailMs, setDetailMs] = useState(2000);
  const detail = usePoll(() => getIncident(incidentId), detailMs, incidentId);
  const status = detail.data?.incident.status;
  const wantMs = status && TERMINAL.includes(status) ? 10_000 : 2000;
  if (wantMs !== detailMs) setDetailMs(wantMs);

  // The brief is re-read when the status changes, since the text describes the current state.
  const brief = usePoll(() => getBrief(incidentId), 0, `${incidentId}:${status ?? ""}`);

  // After an approval Antibody pulls main, gates it and refreshes the backtest; poll that every 3s.
  const [aftercareMs, setAftercareMs] = useState(0);
  const aftercare = usePoll(getAftercare, aftercareMs);
  const aftercareLive = aftercare.data?.incident_id === incidentId && !!aftercare.data && AFTERCARE_ACTIVE.includes(aftercare.data.state);
  const [justDecided, setJustDecided] = useState(false);
  const wantAftercareMs = aftercareLive || justDecided ? 3000 : 0;
  if (wantAftercareMs !== aftercareMs) setAftercareMs(wantAftercareMs);

  if (!detail.data) {
    return (
      <div className="space-y-4">
        <BackLink />
        {detail.loading ? <p className="text-muted-foreground">Loading incident…</p> : <PollNote poll={detail} />}
      </div>
    );
  }

  return (
    <Loaded
      d={detail.data}
      mock={detail.mock}
      poll={detail}
      brief={brief.data?.text}
      aftercare={aftercare.data}
      onDecided={() => {
        setJustDecided(true);
        detail.refetch();
        aftercare.refetch();
      }}
    />
  );
}

function Loaded({
  d,
  mock,
  poll,
  brief,
  aftercare,
  onDecided,
}: {
  d: IncidentDetail;
  mock: boolean;
  poll: Parameters<typeof PollNote>[0]["poll"];
  brief: string | undefined;
  aftercare: Aftercare | undefined;
  onDecided: () => void;
}) {
  const { incident, diagnosis, resolution, intake } = d;
  const template = d.trace_url_template;
  const scenarios = d.scenarios ?? [];
  const attempts = d.attempts ?? [];
  const baseline = d.families.find((f) => f.candidate === "baseline") ?? null;
  const resolved = incident.status === "resolved";
  const escalated = incident.status === "escalated";
  const acceptedId = resolution?.accepted_fix_id ?? null;
  const awaiting = incident.status === "awaiting_approval" && !!acceptedId;
  const repo = repoSlug(diagnosis?.checkpoint_url);
  const accepted = attempts.find((a) => a.accepted);

  return (
    <div className="mx-auto max-w-6xl">
      <BackLink />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-semibold">{incident.id}</h1>
        <MockBadge show={mock} />
        <span
          className={cn(
            "ml-auto rounded-full px-3 py-1 font-mono text-sm",
            resolved ? "bg-healthy/15 text-healthy" : "bg-infected/15 text-infected",
          )}
        >
          {incident.status.replace(/_/g, " ")}
        </span>
      </div>
      <PollNote poll={poll} />

      <ol className="mt-10">
        <Stage n={1} title="Detected" done>
          <p className="text-lg">
            <span className="text-infected font-mono">{incident.detection}</span> fired on <strong>{incident.trace_ids.length}</strong>{" "}
            traces in <span className="font-mono">{incident.workflow}</span>, first seen {stamp(incident.first_seen)}.
          </p>
          {intake && (
            <p className="text-muted-foreground mt-2">
              {intake.source === "neatlogs" ? "Opened by neatlogs" : "Opened from detection's run log"}: {intake.occurrences} occurrences in{" "}
              {intake.window_minutes} min (threshold {intake.threshold}).
            </p>
          )}
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
            {incident.trace_ids.map((t) => (
              <li key={t}>
                <TraceLink id={t} template={template} />
              </li>
            ))}
          </ul>
        </Stage>

        <Stage n={2} title="Diagnosed" done={!!diagnosis}>
          {diagnosis ? (
            <>
              <p className="text-muted-foreground">
                {diagnosis.commit_sha ? (
                  <>
                    Caused by commit{" "}
                    {repo ? (
                      <a
                        href={`https://github.com/${repo}/commit/${diagnosis.commit_sha}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-foreground font-mono underline decoration-dotted underline-offset-4"
                      >
                        {diagnosis.commit_sha.slice(0, 8)}
                      </a>
                    ) : (
                      <code className="text-foreground font-mono">{diagnosis.commit_sha.slice(0, 8)}</code>
                    )}
                  </>
                ) : (
                  "No causing commit identified"
                )}{" "}
                · {diagnosis.fix_kind.replace(/_/g, " ")}
                {diagnosis.target_file && (
                  <>
                    {" "}
                    · <code className="text-foreground font-mono">{diagnosis.target_file}</code>
                  </>
                )}
              </p>
              {diagnosis.reasoning_excerpt && (
                <figure className="border-infected/40 bg-infected/[0.06] mt-4 rounded-2xl border p-8">
                  <p className="text-muted-foreground font-mono text-sm tracking-wider uppercase">
                    {diagnosis.reasoning_source === "entire_checkpoint"
                      ? "From the Entire checkpoint · the reasoning behind the change"
                      : "From the commit message"}
                  </p>
                  <blockquote className="mt-4 text-2xl leading-10 font-medium sm:text-3xl sm:leading-[1.4]">
                    “{diagnosis.reasoning_excerpt}”
                  </blockquote>
                  {diagnosis.reasoning_source === "entire_checkpoint" && diagnosis.checkpoint_url && (
                    <figcaption className="mt-6">
                      <a
                        href={diagnosis.checkpoint_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-foreground inline-flex items-center gap-2 font-mono text-sm underline decoration-dotted underline-offset-4"
                      >
                        {diagnosis.checkpoint_id ?? "checkpoint"} on Entire <ExternalLink className="size-4" />
                      </a>
                    </figcaption>
                  )}
                </figure>
              )}
              <p className="mt-4 text-lg leading-8">{diagnosis.explanation}</p>
              {diagnosis.good_trace_ids.length > 0 && (
                <p className="text-muted-foreground mt-2 text-sm">
                  Compared with healthy runs:{" "}
                  {diagnosis.good_trace_ids.map((t, i) => (
                    <span key={t}>
                      {i > 0 && ", "}
                      <TraceLink id={t} template={template} />
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
          {scenarios.length ? <FamilyList scenarios={scenarios} /> : <Waiting>Breeding variants of the failure…</Waiting>}
        </Stage>

        <Stage n={4} title="Baseline" done={!!baseline}>
          {baseline && scenarios.length ? (
            <ScenarioGrid scenarios={scenarios} from={baseline} template={template} />
          ) : baseline ? (
            <FamilyLine family={baseline} />
          ) : (
            <Waiting>Running the family against the current agent…</Waiting>
          )}
          {baseline && <FamilyWarnings family={baseline} />}
        </Stage>

        <Stage n={5} title="Attempts" done={attempts.length > 0 && attempts.every((a) => a.verdict !== "not run")}>
          {attempts.length ? (
            <ul className="space-y-6">
              {attempts.map((a) => {
                const fam = a.result;
                return (
                  <li key={a.fix.id} className="border-border rounded-xl border p-5">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-lg font-semibold">{a.fix.id}</span>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 font-mono text-sm",
                          a.accepted ? "bg-healthy/15 text-healthy" : "bg-infected/15 text-infected",
                        )}
                      >
                        {a.verdict}
                      </span>
                    </div>
                    <p className="mt-2 leading-7">{a.fix.description}</p>
                    {a.verdict.startsWith("rejected: broke") && a.broke.length > 0 && (
                      <p className="text-infected mt-2 text-sm">
                        Broke healthy cases: {a.broke.map((b) => b.domain ?? b.scenario_id).join(", ")}
                      </p>
                    )}
                    {a.verdict.startsWith("error:") && a.error && <p className="text-infected mt-2 font-mono text-sm">{a.error}</p>}
                    {a.fix.diff && (
                      <details className="mt-3" open={a.accepted}>
                        <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm">Diff</summary>
                        <div className="mt-2">
                          <DiffView diff={a.fix.diff} />
                        </div>
                      </details>
                    )}
                    {fam && baseline && scenarios.length > 0 && (
                      <div className="mt-4">
                        <ScenarioGrid scenarios={scenarios} from={baseline} to={fam} size={a.accepted ? "lg" : "sm"} template={template} />
                      </div>
                    )}
                    {fam && !scenarios.length && <FamilyLine family={fam} />}
                    {fam && <FamilyWarnings family={fam} />}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Waiting>Writing and testing fixes…</Waiting>
          )}
        </Stage>

        <Stage n={6} title="Shipped" done={!!resolution?.pr_url}>
          {resolution?.pr_url ? (
            <dl className="grid gap-4 sm:grid-cols-4">
              <Fact label="Pull request">
                <a href={resolution.pr_url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-4">
                  #{resolution.pr_url.split("/").pop()} ↗
                </a>
                {resolution.merged && <span className="text-healthy ml-2 text-sm">Merged</span>}
              </Fact>
              <Fact label="Cost">${resolution.cost_usd.toFixed(2)}</Fact>
              <Fact label="Time">{Math.round(resolution.duration_ms / 1000)} s</Fact>
              <Fact label="Family">
                {resolution.after ? (
                  <span className="text-base">
                    must_fix {resolution.before.must_fix_passed}/{resolution.before.must_fix_total} → {resolution.after.must_fix_passed}/
                    {resolution.after.must_fix_total} · must_not_change {resolution.after.must_not_change_passed}/
                    {resolution.after.must_not_change_total} kept
                  </span>
                ) : (
                  "—"
                )}
              </Fact>
            </dl>
          ) : (
            <Waiting>Ships as a pull request once approved.</Waiting>
          )}
        </Stage>

        <Stage n={7} title="Decision" done={resolved || escalated} last>
          {resolution?.approval ? (
            <p className="text-healthy flex items-center gap-2 text-lg">
              {resolution.approval.channel === "voice" && <Mic className="size-5" aria-label="approved by voice" />}
              Approved: “{resolution.approval.phrase}” via {resolution.approval.channel} at {stamp(resolution.approval.at)}
            </p>
          ) : resolution?.rejection ? (
            <p className="text-infected text-lg">
              Rejected {resolution.rejection.fix_id} at {stamp(resolution.rejection.at)}: {resolution.rejection.reason}
            </p>
          ) : escalated && !acceptedId ? (
            <p className="text-infected text-lg">No fix passed the whole family. Needs a human.</p>
          ) : awaiting ? null : (
            <Waiting>Waiting for a fix that passes the whole family.</Waiting>
          )}
          {escalated && !acceptedId && attempts.length > 0 && (
            <ul className="text-muted-foreground mt-3 font-mono text-sm">
              {attempts.map((a) => (
                <li key={a.fix.id}>
                  {a.fix.id}: {a.verdict}
                </li>
              ))}
            </ul>
          )}
          {awaiting && acceptedId && (
            <div className="mt-2">
              {accepted && <p className="text-muted-foreground mb-4">{accepted.fix.id} passed the whole family. It ships only when a human approves it.</p>}
              <ApprovalBox incidentId={incident.id} fixId={acceptedId} onDone={onDecided} />
            </div>
          )}
          <AftercareBanner aftercare={aftercare} incidentId={incident.id} />
        </Stage>
      </ol>

      {brief && (
        <section className="border-border mt-4 rounded-xl border p-6">
          <h2 className="text-muted-foreground font-mono text-sm tracking-wider uppercase">What the on-call engineer heard</h2>
          <p className="mt-3 text-lg leading-8">{brief}</p>
        </section>
      )}
    </div>
  );
}

function AftercareBanner({ aftercare, incidentId }: { aftercare: Aftercare | undefined; incidentId: string }) {
  if (!aftercare || aftercare.incident_id !== incidentId || aftercare.state === "idle") return null;
  const steps: Aftercare["state"][] = ["pulling", "gating", "backtesting", "done"];
  const failed = aftercare.state === "failed";
  return (
    <div className="border-border mt-6 rounded-lg border p-4" role="status">
      <p className="text-muted-foreground font-mono text-sm tracking-wider uppercase">Aftercare after merge</p>
      <p className="mt-2 flex flex-wrap items-center gap-2 font-mono text-sm">
        {steps.map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            {i > 0 && <span className="text-muted-foreground">→</span>}
            <span className={cn(aftercare.state === s ? "text-foreground font-semibold" : "text-muted-foreground")}>{s}</span>
          </span>
        ))}
      </p>
      {failed && <p className="text-infected mt-2 font-mono text-sm">failed{aftercare.error ? `: ${aftercare.error}` : ""}</p>}
      {aftercare.state === "done" && (
        <p className="text-healthy mt-2 font-mono text-sm">
          Gate on main: {aftercare.gate_verdict ?? "—"} · backtest caught {aftercare.backtest_caught ?? 0}/{aftercare.backtest_families ?? 0}{" "}
          <Link href="/gate" className="underline">
            gate
          </Link>{" "}
          <Link href="/trust" className="underline">
            trust
          </Link>
        </p>
      )}
    </div>
  );
}

function FamilyList({ scenarios }: { scenarios: Scenario[] }) {
  return (
    <>
      <p className="text-lg">
        <strong>{scenarios.filter((s) => s.role === "must_fix").length}</strong> must_fix and{" "}
        <strong>{scenarios.filter((s) => s.role === "must_not_change").length}</strong> must_not_change scenarios, replayed on recorded
        tool responses.
      </p>
      {(["must_fix", "must_not_change"] as const).map((role) => (
        <div key={role} className="mt-4">
          <p className="text-muted-foreground mb-1 font-mono text-sm">{role}</p>
          <ul className="grid gap-x-8 gap-y-1 font-mono text-sm sm:grid-cols-2">
            {scenarios
              .filter((s) => s.role === role)
              .map((s) => (
                <li key={s.id} className="flex gap-3">
                  <span>{s.domain}</span>
                  <span className="text-muted-foreground ml-auto text-right">
                    {s.faults[0] ? `${s.faults[0].error.code} on ${s.faults[0].tool}` : "no fault"}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </>
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

/** Some tool calls had no recording during replay: say so rather than hide it. */
function FamilyWarnings({ family }: { family: FamilyResult }) {
  const synthetic = family.synthetic_tool_calls ?? 0;
  if (!synthetic && !family.warnings?.length) return null;
  return (
    <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-amber-300">
      {synthetic > 0 && (
        <LabelBadge label={`${synthetic} of ${family.total_tool_calls ?? "?"} tool calls had no recording`} />
      )}
      {family.warnings?.join(" · ")}
    </p>
  );
}
