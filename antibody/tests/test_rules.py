"""The acceptance rule, the approval phrase rule, and the stub tripwires."""

import pytest

from antibody import grade
from antibody.models import FamilyResult, Fault, Incident, Resolution, ToolError, Verdict
from antibody.pipeline import ApprovalError, approve, parse_approval, reject
from antibody.state import StateStore
from antibody.stubs import patient, scorer


def fam(fix_p, fix_t, keep_p, keep_t, ran=None):
    n = fix_t + keep_t if ran is None else ran
    verdicts = [Verdict(scenario_id=f"sc_{i}", passed=True, failed_checks=[], run_id="r") for i in range(n)]
    return FamilyResult(incident_id="i", candidate="fix_1", must_fix_passed=fix_p, must_fix_total=fix_t,
                        must_not_change_passed=keep_p, must_not_change_total=keep_t, verdicts=verdicts)


@pytest.mark.parametrize("result,ok", [
    (fam(7, 7, 3, 3), True),
    (fam(6, 7, 3, 3), False),   # one must_fix still failing
    (fam(7, 7, 2, 3), False),   # broke a healthy case
    (fam(0, 0, 3, 3), False),   # nothing to fix proves nothing
    (fam(7, 7, 3, 3, ran=9), False),  # a scenario didn't run (e.g. cost cap)
])
def test_acceptance_rule(result, ok):
    assert grade.accepts(result) is ok


@pytest.mark.parametrize("phrase,n", [
    ("approve fix 2", 2), ("  Approve Fix 2  ", 2), ("APPROVE FIX 10", 10),
    ("yes", None), ("ok", None), ("do it", None), ("approve", None), ("approve fix", None),
    ("approve fix 2 please", None), ("please approve fix 2", None), ("approve  fix 2", None), ("", None),
])
def test_parse_approval(phrase, n):
    assert parse_approval(phrase) == n


def _awaiting(store: StateStore, accepted="fix_2", pr_url=None):
    inc = Incident(id="inc_x", detection="tw_invented_person", trace_ids=[], first_seen="2026-10-11T00:00:00Z",
                   status="awaiting_approval")
    store.write(inc.id, "incident", inc)
    store.write(inc.id, "resolution", Resolution(incident_id=inc.id, accepted_fix_id=accepted,
                                                 before=fam(1, 7, 3, 3), after=fam(7, 7, 3, 3), pr_url=pr_url))
    return inc


def test_approve_requires_exact_phrase():
    st = StateStore()
    _awaiting(st)
    for bad in ("yes", "ok", "do it"):
        with pytest.raises(ApprovalError, match="Not an approval phrase"):
            approve(st, "inc_x", "fix_2", bad, "voice")
    assert st.read("inc_x", "incident", Incident).status == "awaiting_approval"


def test_approve_phrase_must_match_fix():
    st = StateStore()
    _awaiting(st)
    with pytest.raises(ApprovalError):
        approve(st, "inc_x", "fix_2", "approve fix 1", "typed")
    with pytest.raises(ApprovalError):
        approve(st, "inc_x", "fix_1", "approve fix 1", "typed")  # not the accepted fix


def test_approve_records_and_merges():
    st = StateStore()
    _awaiting(st, pr_url="https://github.com/o/r/pull/1")
    merged = []
    res = approve(st, "inc_x", "fix_2", " Approve fix 2 ", "voice", merge=merged.append)
    assert merged == ["https://github.com/o/r/pull/1"]
    assert res.approval.channel == "voice" and res.approval.phrase == "Approve fix 2" and res.merged
    assert st.read("inc_x", "incident", Incident).status == "resolved"
    with pytest.raises(ApprovalError):  # can't approve twice
        approve(st, "inc_x", "fix_2", "approve fix 2", "typed", merge=merged.append)


def test_reject_escalates():
    st = StateStore()
    _awaiting(st)
    res = reject(st, "inc_x", "fix_2", "too broad")
    assert res.rejection["reason"] == "too broad"
    assert st.read("inc_x", "incident", Incident).status == "escalated"


# --- stub patient + scorer: the loop depends on these behaving like the seeded bugs ---

E429 = [Fault(tool="crustdata.people_search", at_call=1, error=ToolError(code="HTTP_429", message="rate limited"))]


def test_stub_v2_invents_people_on_small_company():
    run = patient.run("tinyforge.co", prompt_version="v2")
    assert "tw_invented_person" in scorer.score(run).violations


def test_stub_v1_is_healthy():
    for d in ("tinyforge.co", "lumenwharf.com"):
        assert scorer.score(patient.run(d, prompt_version="v1", faults=E429)).violations == []


def test_stub_swallowed_error_trips_empty_after_error():
    run = patient.run("bluepeak.dev", faults=E429, bug_flags={"swallow_tool_errors": True})
    assert "tw_empty_after_error" in scorer.score(run).violations


def test_stub_v3_skips_company_check_on_lookalike():
    run = patient.run("harborline.co", prompt_version="v3")
    assert "tw_company_match_skipped" in scorer.score(run).violations


# --- the LLM fix path, with a fake model ---

from antibody import fix, llm
from antibody.models import Diagnosis, Scenario


def _diag():
    return Diagnosis(incident_id="i", explanation="x", fix_kind="prompt_patch", target_file="p/v2.md")


def test_llm_fix_uses_model_content(monkeypatch):
    monkeypatch.setattr(llm, "available", lambda tier="strong": True)
    monkeypatch.setattr(llm, "complete", lambda *a, **k: llm.LLMResult(
        text='Sure: {"description": "list fewer", "content": "new prompt\n"}', model="m",
        input_tokens=1, output_tokens=1, cost_usd=0.0))
    cand, new, mock = fix.propose(_diag(), "old prompt\n", fam(1, 1, 0, 0), [], 1)
    assert new == "new prompt\n" and not mock and cand.description == "list fewer"
    assert "-old prompt" in cand.diff and "+new prompt" in cand.diff


def test_llm_fix_falls_back_when_model_fails(monkeypatch):
    monkeypatch.setattr(llm, "available", lambda tier="strong": True)

    def boom(*a, **k):
        raise RuntimeError("bedrock down")

    monkeypatch.setattr(llm, "complete", boom)
    content = "- Sales needs actionable briefs: every brief must include at least 3 decision makers.\n"
    cand, new, mock = fix.propose(_diag(), content, fam(1, 1, 0, 0), [], 1)
    assert mock and cand.description.startswith("[rule-based]") and "fewer" in new


def test_apply_edits_is_all_or_nothing():
    text = "a\nb\nc\n"
    assert fix.apply_edits(text, [{"find": "b", "replace": "B"}]) == "a\nB\nc\n"
    assert fix.apply_edits(text, [{"find": "b", "replace": "B"}, {"find": "zzz", "replace": "y"}]) is None
    assert fix.apply_edits("x x", [{"find": "x", "replace": "y"}]) is None  # ambiguous
    assert fix.apply_edits(text, []) is None


def test_apply_edits_tolerates_spacing():
    text = "Rules:\n    - keep   this\n- change me\n"
    out = fix.apply_edits(text, [{"find": "- keep this\n- change me", "replace": "- keep this\n- changed"}])
    assert out == "Rules:\n- keep this\n- changed\n"
