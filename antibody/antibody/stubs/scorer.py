"""Stub scorer: tripwires shaped like detection's POST /score (no Jev checks)."""

import re

from ..models import AgentRun, CheckResult, RunScore


def _norm(name: str) -> str:
    return re.sub(r"[^a-z ]", "", name.lower()).strip()


def tw_invented_person(run: AgentRun) -> CheckResult:
    known: set[str] = set()
    for s in run.steps:
        if s.name.endswith("people_search") and s.error is None and isinstance(s.result, list):
            known |= {_norm(p.get("name", "")) for p in s.result if isinstance(p, dict)}
    out = run.output or {}
    for dm in out.get("decision_makers") or []:
        if _norm(dm.get("name", "")) not in known:
            return CheckResult(id="tw_invented_person", passed=False,
                               evidence=f"'{dm.get('name')}, {dm.get('title')}' appears in no people-search result")
    return CheckResult(id="tw_invented_person", passed=True, evidence="every contact found in a people-search result")


def tw_empty_after_error(run: AgentRun) -> CheckResult:
    out = run.output or {}
    errored = any(s.name.endswith("people_search") and s.error for s in run.steps)
    reason = (out.get("no_decision_makers_reason") or "").lower()
    claims_none = not out.get("decision_makers") and ("unavailable" not in reason)
    if errored and claims_none:
        return CheckResult(id="tw_empty_after_error", passed=False,
                           evidence="people search errored but the brief reports no decision makers as fact")
    return CheckResult(id="tw_empty_after_error", passed=True, evidence="ok")


def tw_company_match_skipped(run: AgentRun) -> CheckResult:
    out = run.output or {}
    has_enrich = any(s.name.endswith("company_enrich") and s.error is None for s in run.steps)
    confirmed = any(s.name.endswith("confirm_company") for s in run.steps)
    if has_enrich and not confirmed and out.get("company_name"):
        return CheckResult(id="tw_company_match_skipped", passed=False,
                           evidence="brief used enrichment data without a company-confirmation step")
    if out.get("company_name") and not out.get("company_match_confirmed"):
        return CheckResult(id="tw_company_match_skipped", passed=False,
                           evidence="company_match_confirmed is false but the brief names a company")
    return CheckResult(id="tw_company_match_skipped", passed=True, evidence="ok")


def tw_claimed_success_on_failure(run: AgentRun) -> CheckResult:
    tools = [s for s in run.steps if s.kind == "tool"]
    summary = ((run.output or {}).get("summary") or "").lower()
    if tools and tools[-1].error and "completed" in summary and "partial" not in summary:
        return CheckResult(id="tw_claimed_success_on_failure", passed=False,
                           evidence=f"summary claims completion but {tools[-1].name} failed")
    return CheckResult(id="tw_claimed_success_on_failure", passed=True, evidence="ok")


CHECKS = [tw_invented_person, tw_empty_after_error, tw_company_match_skipped, tw_claimed_success_on_failure]


def score(run: AgentRun) -> RunScore:
    checks = [c(run) for c in CHECKS]
    return RunScore(run_id=run.run_id, checks=checks, violations=[c.id for c in checks if not c.passed])
