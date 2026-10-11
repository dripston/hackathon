"""Data shapes shared with teammates. Field names follow /CONTRACT.md exactly."""

from typing import Any, Literal

from pydantic import BaseModel, Field


class ToolError(BaseModel):
    code: str  # HTTP_429, HTTP_500, TIMEOUT, EMPTY, NO_CASSETTE
    message: str


class Step(BaseModel):
    index: int
    kind: Literal["llm", "tool"]
    name: str
    args: Any | None = None
    result: Any | None = None
    error: ToolError | None = None
    latency_ms: float | None = None
    cost_usd: float | None = None
    synthetic: bool = False  # replay had no recording for this call


class DecisionMaker(BaseModel):
    name: str
    title: str | None = None
    linkedin_url: str | None = None
    source_step_index: int | None = None


class ResearchBrief(BaseModel):
    domain: str
    company_name: str | None = None
    company_match_confirmed: bool = False
    headcount: int | None = None
    hiring_signals: list[str] = []
    decision_makers: list[DecisionMaker] = []
    summary: str = ""
    no_decision_makers_reason: str | None = None


class AgentRun(BaseModel):
    run_id: str
    trace_id: str | None = None
    input: dict
    prompt_version: str
    bug_flags: dict[str, bool] = {}
    steps: list[Step]
    output: dict | None = None  # ResearchBrief as a dict; kept loose so a bad brief still parses
    total_cost_usd: float | None = None
    simulated: bool = False
    started_at: str | None = None
    ended_at: str | None = None


class CheckResult(BaseModel):
    id: str
    passed: bool
    evidence: str = ""
    score: float | None = None  # Jev checks only, 0..1


class RunScore(BaseModel):
    run_id: str
    checks: list[CheckResult]
    violations: list[str]


class RiskForecast(BaseModel):
    id: str
    signal: str
    subject: str
    current: float
    threshold: float
    trend_per_hour: float
    eta_minutes: float | None
    likelihood: Literal["likely", "possible"]
    related_check: str | None = None
    evidence: str
    created_at: str
    outcome: Literal["pending", "happened", "did_not_happen"] = "pending"


IncidentStatus = Literal[
    "open", "diagnosing", "simulating", "fixing", "awaiting_approval", "resolved", "escalated"
]


class Incident(BaseModel):
    id: str
    detection: str
    trace_ids: list[str]
    workflow: str = "company-research"
    first_seen: str
    status: IncidentStatus = "open"


FixKind = Literal["prompt_patch", "prompt_rollback", "tool_wrapper_patch"]


class Diagnosis(BaseModel):
    incident_id: str
    commit_sha: str | None = None
    checkpoint_id: str | None = None
    checkpoint_url: str | None = None
    reasoning_excerpt: str | None = None
    good_trace_ids: list[str] = []
    explanation: str
    fix_kind: FixKind
    # Not in the contract shape, but needed by later stages; extra keys are harmless to readers.
    target_file: str | None = None
    prompt_version: str | None = None
    bug_flags: dict[str, bool] = {}


class Fault(BaseModel):
    tool: str
    at_call: int
    error: ToolError


class Scenario(BaseModel):
    id: str
    incident_id: str
    role: Literal["must_fix", "must_not_change"]
    domain: str
    faults: list[Fault] = []
    cassette_set: str = "base"
    expected_checks: list[str]


class Verdict(BaseModel):
    scenario_id: str
    passed: bool
    failed_checks: list[str]
    run_id: str
    trace_id: str | None = None
    synthetic_tool_calls: int = 0


class FamilyResult(BaseModel):
    incident_id: str
    candidate: str  # "baseline" or a fix id
    must_fix_passed: int
    must_fix_total: int
    must_not_change_passed: int
    must_not_change_total: int
    verdicts: list[Verdict]
    total_tool_calls: int = 0
    synthetic_tool_calls: int = 0
    cost_usd: float = 0.0
    warnings: list[str] = []


class FixCandidate(BaseModel):
    id: str  # fix_1, fix_2, ...
    incident_id: str
    kind: str
    description: str
    diff: str
    attempt: int
    branch: str | None = None


class Attempt(BaseModel):
    fix: FixCandidate
    result: FamilyResult | None = None
    accepted: bool = False
    error: str | None = None


class Approval(BaseModel):
    phrase: str
    channel: Literal["typed", "voice"]
    at: str


class Resolution(BaseModel):
    incident_id: str
    accepted_fix_id: str | None = None
    before: FamilyResult
    after: FamilyResult | None = None
    attempts: list[str] = []
    pr_url: str | None = None
    cost_usd: float = 0.0
    duration_ms: int = 0
    approval: Approval | None = None
    rejection: dict | None = None
    merged: bool = False


class GateFamily(BaseModel):
    incident_id: str
    must_fix_passed: int
    must_fix_total: int
    reopens: bool
    must_not_change_passed: int = 0
    must_not_change_total: int = 0
    message: str = ""


class GateReport(BaseModel):
    branch: str
    verdict: Literal["safe", "blocked"]
    families: list[GateFamily] = Field(default_factory=list)
    created_at: str
