// Data shapes from /CONTRACT.md. snake_case kept as the APIs send it.

export type ToolErrorCode = "HTTP_429" | "HTTP_500" | "TIMEOUT" | "EMPTY" | "NO_CASSETTE";

export interface ToolError {
  code: ToolErrorCode | (string & {});
  message: string;
}

export interface Step {
  index: number;
  kind: "llm" | "tool";
  name: string;
  args: Record<string, unknown> | null;
  result: unknown;
  error: ToolError | null;
  latency_ms: number | null;
  cost_usd: number | null;
  synthetic: boolean;
}

export interface DecisionMaker {
  name: string;
  title: string | null;
  linkedin_url: string | null;
  source_step_index: number | null;
}

export interface ResearchBrief {
  domain: string;
  company_name: string | null;
  company_match_confirmed: boolean;
  headcount: number | null;
  hiring_signals: string[];
  decision_makers: DecisionMaker[];
  summary: string;
  no_decision_makers_reason: string | null;
}

export interface AgentRun {
  run_id: string;
  trace_id: string | null;
  input: { domain: string };
  prompt_version: string;
  bug_flags: Record<string, boolean>;
  steps: Step[];
  output: ResearchBrief | null;
  total_cost_usd: number | null;
  simulated: boolean;
  started_at: string | null;
  ended_at: string | null;
}

export interface CheckResult {
  id: string;
  passed: boolean;
  evidence: string;
  score: number | null;
}

export interface RunScore {
  run_id: string;
  checks: CheckResult[];
  violations: string[];
}

export interface ScoredRun {
  run: AgentRun;
  score: RunScore;
}

export type RiskSignal =
  | "tool_error_rate"
  | "retry_rate"
  | "near_miss"
  | "latency_p95"
  | "unstable_output"
  | "model_retirement";

export interface RiskForecast {
  id: string;
  signal: RiskSignal;
  subject: string;
  current: number;
  threshold: number;
  trend_per_hour: number;
  eta_minutes: number | null;
  likelihood: "likely" | "possible";
  related_check: string | null;
  evidence: string;
  created_at: string;
  outcome: "pending" | "happened" | "did_not_happen";
}

export type IncidentStatus =
  | "open"
  | "diagnosing"
  | "simulating"
  | "fixing"
  | "awaiting_approval"
  | "resolved"
  | "escalated";

export interface Incident {
  id: string;
  detection: string;
  trace_ids: string[];
  workflow: string;
  first_seen: string;
  status: IncidentStatus;
}

export interface Diagnosis {
  incident_id: string;
  commit_sha: string | null;
  checkpoint_id: string | null;
  checkpoint_url: string | null;
  reasoning_excerpt: string | null;
  good_trace_ids: string[];
  explanation: string;
  fix_kind: string;
  reasoning_source?: "entire_checkpoint" | "commit_message" | null;
  target_file?: string | null;
  prompt_version?: string | null;
  bug_flags?: Record<string, boolean>;
}

export interface Fault {
  tool: string;
  at_call: number;
  error: ToolError;
}

export interface Scenario {
  id: string;
  incident_id: string;
  role: "must_fix" | "must_not_change";
  domain: string;
  faults: Fault[];
  cassette_set: string;
  expected_checks: string[];
}

export interface Verdict {
  scenario_id: string;
  passed: boolean;
  failed_checks: string[];
  run_id: string;
  trace_id: string | null;
  synthetic_tool_calls: number;
  evidence?: string[];
}

export interface FamilyResult {
  incident_id: string;
  candidate: string; // "baseline" or a fix id
  must_fix_passed: number;
  must_fix_total: number;
  must_not_change_passed: number;
  must_not_change_total: number;
  verdicts: Verdict[];
  total_tool_calls?: number;
  synthetic_tool_calls?: number;
  cost_usd?: number;
  warnings?: string[];
}

export interface Approval {
  phrase: string;
  channel: "typed" | "voice";
  at: string;
}

export interface Resolution {
  incident_id: string;
  accepted_fix_id: string | null;
  before: FamilyResult;
  after: FamilyResult | null;
  attempts: string[];
  pr_url: string | null;
  cost_usd: number;
  duration_ms: number;
  approval: Approval | null;
  rejection?: { fix_id: string; reason: string; at: string } | null;
  merged?: boolean;
}

export interface FixCandidate {
  id: string;                           // "fix_1"
  incident_id: string;
  kind: string;
  description: string;                  // one paragraph: what the fix does
  diff: string;                         // unified diff
  attempt: number;
  branch: string | null;
}
export interface AttemptView {
  fix: FixCandidate;
  result: FamilyResult | null;          // null if the attempt couldn't be evaluated
  accepted: boolean;
  error: string | null;
  verdict: string;                      // "accepted" | "rejected: broke airtable.com" | "rejected: must_fix 5/7" | "error: ..." | "not run"
  broke: { scenario_id: string; domain: string | null; failed_checks: string[] }[];  // healthy cases it broke
  still_failing: string[];              // must_fix scenario ids still failing
}
export interface IntakeInfo {
  source: "neatlogs" | "detection_runs"; // which system opened the incident
  window_minutes: number;
  threshold: number;
  occurrences: number;
  at: string;
}
export interface IncidentDetail {
  incident: Incident;
  diagnosis: Diagnosis | null;          // null until diagnosis finishes
  families: FamilyResult[];             // [baseline, ...each attempt's result], in order; [] until baseline finishes
  resolution: Resolution | null;        // null until the pipeline finishes
  scenarios?: Scenario[];               // the variant family; [] until bred
  attempts?: AttemptView[];             // grows as attempts complete
  intake?: IntakeInfo | null;
  trace_url_template?: string | null;   // e.g. "https://.../trace/{trace_id}"; null = not configured
}

// --- gate ---
export interface GateFamily {
  incident_id: string;
  must_fix_passed: number;
  must_fix_total: number;
  reopens: boolean;                     // true = this branch brings that incident back (or breaks its healthy cases)
  must_not_change_passed?: number;
  must_not_change_total?: number;
  message?: string;                     // "re-opens inc_…: must_fix 3/7" | "ok inc_…: must_fix 7/7, must_not_change 3/3"
}
export interface GateReport {
  branch: string;
  verdict: "safe" | "blocked";
  families: GateFamily[];
  created_at: string;
  note?: string | null;                 // set when BLOCKED without a failing family, e.g. "the patient at … is not reachable, so nothing was verified"
}

// --- new endpoints ---
export interface Overview {
  runs_last_10_min: number;
  silent_failures_last_10_min: number;
  silent_failure_rate: number | null;   // null when there were no runs
  open_incidents: number;               // every status except resolved
  awaiting_approval: number;
  gate_verdict: "safe" | "blocked" | null; // null = no gate run yet
}
export interface Aftercare {
  state: "idle" | "pulling" | "gating" | "backtesting" | "done" | "failed";
  incident_id?: string;
  error?: string | null;
  updated_at?: string;
  pulled?: string;
  gate_verdict?: "safe" | "blocked";
  backtest_caught?: number;
  backtest_families?: number;
}
export interface SeededBug {
  bug: string;                          // plain description of the planted bug
  commit: string;
  check: string;                        // the tripwire it trips
  incident_id: string | null;
  caught_in_production: boolean;
  would_have_blocked: boolean;          // would the gate have stopped this commit before deploy
  note: string;                         // why, in plain words; shown for misses
}
export interface BacktestRow {
  incident_id: string;
  commit: string;
  caught: boolean;
  bad: string;                          // gate message on the causing commit
  false_alarm: boolean;
  parent: string;                       // gate message on the commit before it
  mock: boolean;
}
export interface TrustApi {
  status: "measured" | "not_measured_yet";
  label: string;                        // "SIMULATED (replay of recorded tool responses against seeded bugs)"
  seeded_label: string;                 // "SEEDED: planted for the demo, ..."
  created_at: string | null;
  seeded_bugs: SeededBug[];
  would_have_blocked: number;
  catch_rate: number | null;            // 0..1
  misses: SeededBug[];                  // list these plainly
  false_alarm_rate: number | null;      // 0..1
  false_alarm_checks: number;
  false_alarms: number;
  families: BacktestRow[];
}
export interface EvidenceApi {
  source: "antibody";
  created_at: string;
  // kind "incident": label, incident_id, detection, status, opened_by, trace_ids, commit, commit_url,
  //   checkpoint_url, reasoning, reasoning_source, explanation, before/after {must_fix, must_not_change},
  //   attempts [{id, accepted, description, error}], pr_url, approval, cost_usd, duration_ms, seeded_bug
  // kind "gate" (a GateReport + label), "backtest" (the backtest summary), "costs" (cost per incident)
  items: ({ kind: "incident" | "gate" | "backtest" | "costs"; label?: string } & Record<string, unknown>)[];
}

export type DataLabel = string;

export interface EvidenceItem {
  id: string;
  requirement: string;
  label: DataLabel;
  status: "done" | "pending";
  links: { title: string; url: string }[];
  note?: string;
}

export interface EvidenceIndex {
  updated_at?: string;
  items: EvidenceItem[];
}
