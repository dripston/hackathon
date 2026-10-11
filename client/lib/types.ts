// Data shapes from /CONTRACT.md. snake_case kept as the APIs send it.

export type ToolErrorCode = "HTTP_429" | "HTTP_500" | "TIMEOUT" | "EMPTY" | "NO_CASSETTE" | (string & {});

export interface ToolError {
  code: ToolErrorCode;
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
  checkpoint_url: string | null; // null if no Entire checkpoint
  reasoning_excerpt: string | null; // WHY the change was made (Entire session, or the commit message)
  reasoning_source?: "entire_checkpoint" | "commit_message" | null;
  good_trace_ids: string[];
  explanation: string;
  fix_kind: "prompt_patch" | "prompt_rollback" | "tool_wrapper_patch";
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
  evidence?: string[]; // one sentence per failed check
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
  synthetic_tool_calls?: number; // > 0 means some tool calls had no recording
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
  accepted_fix_id: string | null; // null = no fix passed (escalated)
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
  id: string;
  incident_id: string;
  kind: string;
  description: string;
  diff: string;
  attempt: number;
  branch: string | null;
}

export interface AttemptView {
  fix: FixCandidate;
  result: FamilyResult | null; // null if the attempt couldn't be evaluated
  accepted: boolean;
  error: string | null;
  verdict: string; // "accepted" | "rejected: broke airtable.com" | "rejected: must_fix 5/7" | "error: ..." | "not run"
  broke: { scenario_id: string; domain: string | null; failed_checks: string[] }[];
  still_failing: string[];
}

export interface IntakeInfo {
  source: "neatlogs" | "detection_runs";
  window_minutes: number;
  threshold: number;
  occurrences: number;
  at: string;
}

/** GET /incidents/{id}: the contract keys plus extras that appear as the pipeline progresses. */
export interface IncidentDetail {
  incident: Incident;
  diagnosis: Diagnosis | null;
  families: FamilyResult[];
  resolution: Resolution | null;
  scenarios?: Scenario[];
  attempts?: AttemptView[];
  intake?: IntakeInfo | null;
  trace_url_template?: string | null;
}

export interface GateFamily {
  incident_id: string;
  must_fix_passed: number;
  must_fix_total: number;
  reopens: boolean;
  must_not_change_passed?: number;
  must_not_change_total?: number;
  message?: string;
}

export interface GateReport {
  branch: string;
  verdict: "safe" | "blocked";
  families: GateFamily[];
  created_at: string;
  note?: string | null; // set when BLOCKED without a failing family
}

export interface Overview {
  runs_last_10_min: number;
  silent_failures_last_10_min: number;
  silent_failure_rate: number | null;
  open_incidents: number;
  awaiting_approval: number;
  gate_verdict: "safe" | "blocked" | null;
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
  bug: string;
  commit: string;
  check: string;
  incident_id: string | null;
  caught_in_production: boolean;
  would_have_blocked: boolean;
  note: string;
}

export interface BacktestRow {
  incident_id: string;
  commit: string;
  caught: boolean;
  bad: string;
  false_alarm: boolean;
  parent: string;
  mock: boolean;
}

export interface TrustApi {
  status: "measured" | "not_measured_yet";
  label: string;
  seeded_label: string;
  created_at: string | null;
  seeded_bugs: SeededBug[];
  would_have_blocked: number;
  catch_rate: number | null;
  misses: SeededBug[];
  false_alarm_rate: number | null;
  false_alarm_checks: number;
  false_alarms: number;
  families: BacktestRow[];
}

/** GET /evidence items are loosely typed on the server; each kind is read defensively. */
export interface EvidenceApiItem {
  kind: "incident" | "gate" | "backtest" | "costs";
  label?: string;
  [key: string]: unknown;
}

export interface EvidenceApi {
  source: "antibody";
  created_at: string;
  items: EvidenceApiItem[];
}

export type DataLabel = "LIVE" | "RECORDED" | "SIMULATED" | "SEEDED" | "PLACEHOLDER";

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
