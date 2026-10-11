"""Data shapes from /CONTRACT.md, field for field."""

from typing import Any, Literal

from pydantic import BaseModel


class ToolError(BaseModel):
    code: str  # HTTP_429, HTTP_500, TIMEOUT, EMPTY, NO_CASSETTE
    message: str


class Fault(BaseModel):
    tool: str
    at_call: int
    error: ToolError


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
    output: dict | None = None
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
    signal: str  # tool_error_rate | retry_rate | near_miss | latency_p95 | unstable_output | model_retirement
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


class RunRequest(BaseModel):
    """POST /run body. `bug_flags` is an optional extension Antibody uses to replay a flag-based bug."""
    domain: str
    prompt_version: str | None = None
    prompt_override: str | None = None
    tool_mode: Literal["live", "record", "replay"] = "replay"
    cassette_set: str = "base"
    faults: list[Fault] = []
    simulated: bool = False
    bug_flags: dict[str, bool] | None = None
