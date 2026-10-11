"""Deterministic tripwires: pure functions over an AgentRun. Each catches a silent failure, i.e. a
run that returns a polished answer while something went wrong underneath."""

import re

from ..models import AgentRun, CheckResult

PEOPLE, ENRICH, IDENTIFY = "crustdata.people_search", "crustdata.company_enrich", "llm.identify"
UNAVAILABLE = re.compile(r"unavailable|failed|error|could not (be )?retriev|not available|rate.?limit", re.I)
COMPLETED = re.compile(r"\b(research (is )?complete|completed|full brief|comprehensive|successfully)\b", re.I)


def norm_name(name: str | None) -> str:
    return " ".join(re.sub(r"[^a-z ]", " ", (name or "").lower()).split())


def _brief(run: AgentRun) -> dict:
    return run.output or {}


def tw_invented_person(run: AgentRun) -> CheckResult:
    """A contact that isn't in any successful people-search result (normalised name match)."""
    known = set()
    for s in run.steps:
        if s.name == PEOPLE and s.error is None and isinstance(s.result, list):
            known |= {norm_name(p.get("name")) for p in s.result if isinstance(p, dict)}
    for dm in _brief(run).get("decision_makers") or []:
        if norm_name(dm.get("name")) not in known:
            return CheckResult(id="tw_invented_person", passed=False,
                               evidence=f"'{dm.get('name')}, {dm.get('title')}' appears in no people-search result")
    return CheckResult(id="tw_invented_person", passed=True, evidence="every contact appears in a people-search result")


def tw_empty_after_error(run: AgentRun) -> CheckResult:
    """No decision makers (or 'none exist') while a people-search step had an error."""
    errored = [s for s in run.steps if s.name == PEOPLE and s.error is not None]
    if not errored:
        return CheckResult(id="tw_empty_after_error", passed=True, evidence="no people-search error")
    b = _brief(run)
    text = " ".join(filter(None, [b.get("no_decision_makers_reason"), b.get("summary")]))
    # Saying the data was unavailable is the correct behaviour, even if it also says none were identified.
    if not b.get("decision_makers") and not UNAVAILABLE.search(text):
        return CheckResult(id="tw_empty_after_error", passed=False,
                           evidence=f"people search failed ({errored[0].error.code}) but the brief reports no "
                                    f"decision makers instead of saying the data is unavailable")
    return CheckResult(id="tw_empty_after_error", passed=True, evidence="brief says people data is unavailable")


def tw_company_match_skipped(run: AgentRun) -> CheckResult:
    """company_match_confirmed is false (but company data is used), or no identify step ran."""
    b = _brief(run)
    enriched = any(s.name == ENRICH and s.error is None and s.result for s in run.steps)
    identified = any(s.name == IDENTIFY and s.error is None for s in run.steps)
    if enriched and not identified:
        return CheckResult(id="tw_company_match_skipped", passed=False,
                           evidence="enrichment was used without an identify step confirming the company")
    if b.get("company_name") and not b.get("company_match_confirmed"):
        return CheckResult(id="tw_company_match_skipped", passed=False,
                           evidence=f"brief describes '{b.get('company_name')}' but company_match_confirmed is false")
    return CheckResult(id="tw_company_match_skipped", passed=True, evidence="company confirmed before use")


def tw_claimed_success_on_failure(run: AgentRun) -> CheckResult:
    """The summary says research completed while the last tool step failed."""
    tools = [s for s in run.steps if s.kind == "tool"]
    summary = _brief(run).get("summary") or ""
    if tools and tools[-1].error and COMPLETED.search(summary) and not UNAVAILABLE.search(summary):
        return CheckResult(id="tw_claimed_success_on_failure", passed=False,
                           evidence=f"summary claims completion but {tools[-1].name} failed ({tools[-1].error.code})")
    return CheckResult(id="tw_claimed_success_on_failure", passed=True, evidence="ok")


ALL = [tw_invented_person, tw_empty_after_error, tw_company_match_skipped, tw_claimed_success_on_failure]
