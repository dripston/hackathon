"""Verdicts from the scorer, and the acceptance rule. No separate LLM judge:
the check that caught the failure is the test that proves the fix."""

from .models import AgentRun, FamilyResult, RunScore, Scenario, Verdict


def verdict(scenario: Scenario, run: AgentRun, score: RunScore) -> Verdict:
    by_id = {c.id: c for c in score.checks}
    # An expected check the scorer didn't run can't be claimed as passed.
    failed = [cid for cid in scenario.expected_checks if cid not in by_id or not by_id[cid].passed]
    return Verdict(
        scenario_id=scenario.id, passed=not failed, failed_checks=failed, run_id=run.run_id,
        trace_id=run.trace_id, synthetic_tool_calls=sum(1 for s in run.steps if s.kind == "tool" and s.synthetic),
        evidence=[f"{cid}: {by_id[cid].evidence}" for cid in failed if cid in by_id and by_id[cid].evidence],
    )


def summarise(incident_id: str, candidate: str, scenarios: list[Scenario], verdicts: list[Verdict],
              total_tool_calls: int, cost_usd: float, warnings: list[str] | None = None) -> FamilyResult:
    role = {s.id: s.role for s in scenarios}
    fix = [v for v in verdicts if role.get(v.scenario_id) == "must_fix"]
    keep = [v for v in verdicts if role.get(v.scenario_id) == "must_not_change"]
    synthetic = sum(v.synthetic_tool_calls for v in verdicts)
    warnings = list(warnings or [])
    if total_tool_calls and synthetic / total_tool_calls > 0.2:
        warnings.append(f"{synthetic}/{total_tool_calls} tool calls were synthetic (no recording); results are weaker")
    return FamilyResult(
        incident_id=incident_id, candidate=candidate,
        must_fix_passed=sum(v.passed for v in fix), must_fix_total=sum(1 for s in scenarios if s.role == "must_fix"),
        must_not_change_passed=sum(v.passed for v in keep),
        must_not_change_total=sum(1 for s in scenarios if s.role == "must_not_change"),
        verdicts=verdicts, total_tool_calls=total_tool_calls, synthetic_tool_calls=synthetic,
        cost_usd=round(cost_usd, 6), warnings=warnings,
    )


def accepts(result: FamilyResult) -> bool:
    """All must_fix pass AND all must_not_change pass, and every scenario actually ran."""
    return (
        result.must_fix_total > 0
        and result.must_fix_passed == result.must_fix_total
        and result.must_not_change_passed == result.must_not_change_total
        and len(result.verdicts) == result.must_fix_total + result.must_not_change_total
    )


def line(result: FamilyResult) -> str:
    return (f"must_fix {result.must_fix_passed}/{result.must_fix_total}, "
            f"must_not_change {result.must_not_change_passed}/{result.must_not_change_total}")
