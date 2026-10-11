// Data shapes from /CONTRACT.md. snake_case kept as the APIs send it.

export type ToolErrorCode = "HTTP_429" | "HTTP_500" | "TIMEOUT" | "EMPTY" | "NO_CASSETTE";

export interface ToolError {
  code: ToolErrorCode;
  message: string;
}

export interface Step {
  index: number;
  kind: "llm" | "tool";
  name: string;
  args: Record<string, unknown>;
  result: unknown;
  error: ToolError | null;
  latency_ms: number;
  cost_usd: number;
  synthetic: boolean;
}

export interface DecisionMaker {
  name: string;
  title: string;
  linkedin_url: string | null;
  source_step_index: number | null;
}

export interface ResearchBrief {
  domain: string;
  company_name: string;
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
  total_cost_usd: number;
  simulated: boolean;
  started_at: string;
  ended_at: string;
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
  commit_sha: string;
  checkpoint_id: string;
  checkpoint_url: string;
  reasoning_excerpt: string;
  good_trace_ids: string[];
  explanation: string;
  fix_kind: string;
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
}

export interface FamilyResult {
  incident_id: string;
  candidate: string; // "baseline" or a fix id
  must_fix_passed: number;
  must_fix_total: number;
  must_not_change_passed: number;
  must_not_change_total: number;
  verdicts: Verdict[];
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
}

/**
 * GET /incidents/{id}. The contract lists incident, diagnosis, families, resolution.
 * `scenarios` and `fixes` are optional extras the console renders when present.
 */
export interface IncidentDetail {
  incident: Incident;
  diagnosis: Diagnosis | null;
  families: FamilyResult[];
  resolution: Resolution | null;
  scenarios?: Scenario[];
  fixes?: FixAttempt[];
}

export interface FixAttempt {
  id: string;
  diff: string;
  verdict: "accepted" | "rejected" | "pending";
  reason: string | null;
}

export interface GateFamily {
  incident_id: string;
  must_fix_passed: number;
  must_fix_total: number;
  reopens: boolean;
}

export interface GateReport {
  branch: string;
  verdict: "safe" | "blocked";
  families: GateFamily[];
  created_at: string;
}

export type DataLabel = "LIVE" | "RECORDED" | "SIMULATED" | "SEEDED" | "PLACEHOLDER";

/** evidence/trust.json: either a measured report or the `not_measured_yet` stub. */
export type TrustReport = TrustMeasured | { status: "not_measured_yet" };

export interface TrustMeasured {
  status?: "measured";
  label: DataLabel;
  generated_at: string;
  would_have_blocked: { caught: number; total: number; notes: string };
  planted_bugs: { caught: number; total: number; misses: { bug: string; why: string }[] };
  false_alarms: { alarms: number; harmless_changes: number };
}

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
