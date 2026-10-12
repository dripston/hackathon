"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { getAftercare, getBrief, getIncident } from "@/lib/api";
import { useNow, usePoll } from "@/lib/use-poll";
import { useEvents } from "@/lib/use-events";
import type { IncidentDetail } from "@/lib/types";
import { Page, PageHeader, Panel, Pill, STATUS_LABEL, STATUS_TONE, Stats, label } from "./panel";
import { ErrorNote, MockBadge, TraceLink, ago } from "@/components/console/ui";
import { ApprovalBox } from "@/components/console/approval-box";
import { DiffView } from "@/components/console/diff-view";
import { ScenarioGrid } from "@/components/console/scenario-grid";
import { Terminal } from "@/components/workspace/terminal";
import { Editor } from "@/components/workspace/editor";
import { Tests } from "@/components/workspace/tests";

const NEXT: Record<string, string> = {
  open: "Antibody has detected a repeated failure. Investigation has not finished yet.",
  diagnosing: "Antibody is comparing failing runs with earlier changes to find the cause.",
  simulating: "Antibody is reproducing the problem and checking related scenarios.",
  fixing: "Antibody is writing and testing a candidate repair. No decision is ready yet.",
  awaiting_approval: "A candidate passed its scenario checks. Review the evidence below, then approve or reject it.",
  escalated: "Antibody needs a human to continue. Review the failed attempts or rejection reason below.",
  resolved: "This incident is marked resolved. The recorded approval and merge outcome are shown below.",
};

export function IncidentLive({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const detail = usePoll(() => getIncident(id), 2000, id);
  const brief = usePoll(() => getBrief(id), 5000, id);
  const after = usePoll(getAftercare, 5000);
  const now = useNow(5000);
  const [technical, setTechnical] = useState(false);
  const d = detail.data;
  if (!d) return <Page><Link href="/incidents" className="text-muted-foreground inline-flex items-center gap-2"><ArrowLeft className="size-4" />All issues</Link><Panel title={detail.loading ? "Loading the investigation…" : "This issue could not be loaded"}><ErrorNote error={detail.error} /><p className="text-muted-foreground mt-2 text-sm">{detail.loading ? "Fetching the incident and its recorded evidence." : "Check the server connection or return to the issue list."}</p></Panel></Page>;
  const { incident, diagnosis, resolution } = d;
  const baseline = d.families.find(f => f.candidate === "baseline") ?? resolution?.before;
  const accepted = d.attempts?.find(a => a.fix.id === resolution?.accepted_fix_id);
  const result = accepted?.result ?? resolution?.after;
  const waiting = incident.status === "awaiting_approval" && resolution?.accepted_fix_id;
  const completed = [true, !!diagnosis, !!result, !!resolution?.approval || !!resolution?.rejection];
  const job = after.data?.incident_id === id ? after.data : null;

  return <Page wide>
    <PageHeader meta={<><Link href="/incidents" className="inline-flex items-center gap-2"><ArrowLeft className="size-4" />All issues</Link><MockBadge show={detail.mock} /></>} title={label(incident.detection)} description={`Opened ${ago(incident.first_seen, now)} · ${incident.trace_ids.length} linked traces · ${incident.workflow}`} actions={<Pill tone={STATUS_TONE[incident.status]}>{STATUS_LABEL[incident.status]}</Pill>} />
    <ErrorNote error={detail.error} updatedAt={detail.updatedAt} />
    <div className={`rounded-xl border p-5 ${incident.status === "escalated" ? "border-infected/30 bg-infected/5" : "border-brand/20 bg-brand/5"}`}><p className="font-medium">{waiting ? "Your decision is next" : incident.status === "escalated" ? "Human help needed" : "Where things stand"}</p><p className="text-muted-foreground mt-2 leading-7">{NEXT[incident.status]}</p>{waiting && <a href="#decision" className="mt-3 inline-flex items-center gap-2 font-medium underline underline-offset-4">Review the proposed fix <ArrowRight className="size-4" /></a>}</div>
    <ol aria-label="Investigation progress" className="grid grid-cols-2 gap-3 md:grid-cols-4">{["Failure detected", "Cause investigated", "Candidate tested", "Human decision"].map((step, i) => <li key={step} className="border-border flex items-center gap-3 rounded-xl border p-4"><span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs ${completed[i] ? "bg-healthy/10 text-healthy" : "bg-muted text-muted-foreground"}`}>{completed[i] ? <CheckCircle2 className="size-4" /> : i + 1}</span><span className="text-sm">{step}<span className="text-muted-foreground block text-xs">{completed[i] ? "Recorded" : "Not recorded yet"}</span></span></li>)}</ol>
    <div className="grid items-start gap-6 xl:grid-cols-[1.3fr_1fr]">
      <div className="space-y-6">
        <Panel title="1. What went wrong?" description="The incident in plain language." action={<MockBadge show={brief.mock} />}>
          <ErrorNote error={brief.error} updatedAt={brief.updatedAt} />
          <p className="text-lg leading-8">{brief.data?.text || "An incident summary has not been returned yet."}</p>
          {d.intake && <p className="text-muted-foreground mt-4 text-sm">Detected through {d.intake.source === "neatlogs" ? "neatlogs" : "the agent run log"}: {d.intake.occurrences} occurrences in {d.intake.window_minutes} minutes.</p>}
          <details className="mt-5 border-t pt-4"><summary className="cursor-pointer text-sm font-medium">Inspect the source traces</summary><ul className="mt-3 space-y-2">{incident.trace_ids.map(t => <li key={t}><TraceLink id={t} template={d.trace_url_template} /></li>)}</ul></details>
        </Panel>
        <Panel title="2. Why did it happen?" description="The diagnosis and the change behind it.">
          {diagnosis ? <><p className="leading-7">{diagnosis.explanation}</p>{diagnosis.reasoning_excerpt && <blockquote className="bg-muted/40 mt-5 rounded-lg border-l-2 p-5"><p className="text-muted-foreground mb-3 text-xs uppercase tracking-wider">{diagnosis.reasoning_source === "entire_checkpoint" ? "From the Entire checkpoint" : diagnosis.reasoning_source === "commit_message" ? "From the commit message" : "Recorded reasoning"}</p><p className="leading-7">“{diagnosis.reasoning_excerpt}”</p></blockquote>}<div className="text-muted-foreground mt-4 flex flex-wrap gap-3 text-sm">{diagnosis.commit_sha && <span>Commit <code>{diagnosis.commit_sha.slice(0, 8)}</code></span>}{diagnosis.checkpoint_url && <a href={diagnosis.checkpoint_url} target="_blank" rel="noreferrer" className="underline">Inspect checkpoint ↗</a>}</div></> : <p className="text-muted-foreground">No diagnosis is recorded yet. It will appear as the investigation progresses.</p>}
        </Panel>
        <Panel title="3. Does the fix solve the problem?" description="A candidate must fix the failing cases and preserve the healthy ones.">
          {baseline ? <><Stats items={[
            { label: "Problem cases · before", value: `${baseline.must_fix_passed}/${baseline.must_fix_total}`, hint: "Scenarios that already passed" },
            { label: "Problem cases · after", value: result ? `${result.must_fix_passed}/${result.must_fix_total}` : "Not ready", hint: "Scenarios passing after the fix", tone: result && result.must_fix_passed === result.must_fix_total ? "healthy" : undefined },
            { label: "Healthy cases · after", value: result ? `${result.must_not_change_passed}/${result.must_not_change_total}` : "Not ready", hint: "Existing behaviour still passing" },
          ]} />{accepted && <p className="mt-5 leading-7">{accepted.fix.description}</p>}
          {!!d.scenarios?.length && <details className="mt-5"><summary className="cursor-pointer font-medium">Explore the individual test scenarios</summary><div className="mt-4"><p className="text-muted-foreground mb-4 text-sm">“must_fix” are problem cases. “must_not_change” are healthy cases to protect. These are simulated runs using recorded tool responses.</p><ScenarioGrid scenarios={d.scenarios} from={baseline} to={result} template={d.trace_url_template} /></div></details>}
          </> : <p className="text-muted-foreground">No baseline results yet. Antibody first needs to reproduce the failure.</p>}
          <details className="mt-5 border-t pt-4"><summary className="cursor-pointer font-medium">Review repair attempts ({d.attempts?.length ?? 0}) and code changes</summary><div className="mt-4 space-y-5">{d.attempts?.map(a => <article key={a.fix.id} className="rounded-lg border p-4"><div className="flex flex-wrap gap-2"><Pill tone={a.accepted ? "healthy" : "muted"}>{a.verdict}</Pill><span className="text-muted-foreground text-sm">{a.fix.id}</span></div><p className="my-3 leading-7">{a.fix.description}</p>{a.error && <p className="text-infected">{a.error}</p>}{a.result && <p className="text-muted-foreground mb-3 text-sm">Problem cases: {a.result.must_fix_passed}/{a.result.must_fix_total} · Healthy cases: {a.result.must_not_change_passed}/{a.result.must_not_change_total}</p>}{a.fix.diff && <DiffView diff={a.fix.diff} />}</article>)}{!d.attempts?.length && <p className="text-muted-foreground">No repair attempts recorded yet.</p>}</div></details>
        </Panel>
      </div>
      <div id="decision" className="scroll-mt-24 space-y-6 xl:sticky xl:top-24">
        <Panel title="4. Your decision" description="Antibody proposes the change. You decide whether to approve it.">
          {waiting ? <><p className="mb-5 leading-7">Review the explanation and test results before approving <strong>{waiting}</strong>.</p><ApprovalBox key={`${id}:${waiting}`} incidentId={id} fixId={waiting} onChanged={() => { detail.refresh(); brief.refresh(); after.refresh(); }} /></> : resolution?.approval ? <div className="space-y-3"><Pill tone="healthy">Approval recorded</Pill><p>“{resolution.approval.phrase}”</p><p className="text-muted-foreground text-sm">Via {resolution.approval.channel === "voice" ? "voice" : "typed confirmation"} · {new Date(resolution.approval.at).toLocaleString()}</p></div> : resolution?.rejection ? <><Pill tone="infected">Fix rejected</Pill><p className="mt-3">{resolution.rejection.reason}</p></> : <p className="text-muted-foreground leading-7">{incident.status === "escalated" ? "No decision is available here. A human needs to review why the repair could not proceed." : "No fix is ready for approval yet."}</p>}
          {resolution && <div className="mt-5 space-y-3 border-t pt-5"><p>Merge outcome: <strong>{resolution.merged ? "Merged" : "Not recorded as merged"}</strong></p>{resolution.pr_url && <a href={resolution.pr_url} target="_blank" rel="noreferrer" className="inline-block underline underline-offset-4">Open pull request ↗</a>}<p className="text-muted-foreground text-sm">Recorded cost: ${resolution.cost_usd.toFixed(4)} · Processing time: {Math.round(resolution.duration_ms / 1000)} seconds</p></div>}
        </Panel>
        {job && <Panel title="After the merge"><p className="capitalize">{job.state === "done" ? "Post-merge checks finished" : job.state.replaceAll("_", " ")}</p>{job.gate_verdict && <p className="mt-2">Release check: {job.gate_verdict === "safe" ? "passed" : "blocked"}</p>}{job.error && <p className="text-infected mt-2">{job.error}</p>}<ErrorNote error={after.error} updatedAt={after.updatedAt} /><Link href="/immunity" className="mt-4 inline-block text-sm underline">View release protection →</Link></Panel>}
        <Panel title="Why test more than one case?"><p className="text-muted-foreground leading-7">A repair that fixes one answer might break another. Antibody checks related failure scenarios and healthy scenarios before proposing a fix.</p></Panel>
      </div>
    </div>
    <div className="border-t pt-6"><button type="button" aria-expanded={technical} onClick={() => setTechnical(v => !v)} className="font-medium underline underline-offset-4">{technical ? "Hide" : "Open"} technical workspace</button><p className="text-muted-foreground mt-2 text-sm">Live execution logs, generated code and per-scenario events.</p>{technical && <TechnicalWorkspace key={id} detail={d} />}</div>
  </Page>;
}
function TechnicalWorkspace({ detail }: { detail: IncidentDetail }) {
  const events = useEvents(detail.incident.id);
  return <div className="mt-5 grid gap-5 xl:grid-cols-2"><Terminal events={events} freshFrom={Number.MAX_SAFE_INTEGER} /><Editor events={events} freshFrom={Number.MAX_SAFE_INTEGER} /><Tests events={events} />{!events.length && <p className="text-muted-foreground text-sm">No live events loaded. The summary above uses the stored incident evidence.</p>}</div>;
}
