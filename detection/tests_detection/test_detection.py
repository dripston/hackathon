"""Provider record/replay, the four tripwires, and the forecast maths. No network."""

from datetime import UTC, datetime, timedelta

import pytest

from detection.checks import tripwires as tw
from detection.forecast import eta_minutes, linear_fit
from detection.models import AgentRun, Fault, Step, ToolError
from detection.patient.tools import provider as prov


@pytest.fixture
def cassettes(tmp_path, monkeypatch):
    monkeypatch.setattr(prov, "CASSETTES", tmp_path)
    return tmp_path


def test_record_then_replay_is_identical(cassettes):
    live = lambda args: [{"name": "Ada", "title": "CEO", "q": args["company"]}]
    rec = prov.Provider("record", "base")
    r1, syn1, _ = rec.call("crustdata.people_search", {"company": "X", "limit": 10}, live)
    rep = prov.Provider("replay", "base")
    r2, syn2, _ = rep.call("crustdata.people_search", {"limit": 10, "company": "X"}, lambda a: 1 / 0)  # never live
    assert r1 == r2 and not syn1 and not syn2


def test_replay_records_errors_and_missing_is_synthetic(cassettes):
    def boom(args):
        raise prov.ToolCallError(ToolError(code="HTTP_429", message="rate limited"))

    with pytest.raises(prov.ToolCallError):
        prov.Provider("record", "base").call("crustdata.jobs", {"company_id": 1}, boom)
    with pytest.raises(prov.ToolCallError) as e:
        prov.Provider("replay", "base").call("crustdata.jobs", {"company_id": 1}, boom)
    assert e.value.error.code == "HTTP_429"
    result, synthetic, _ = prov.Provider("replay", "base").call("crustdata.jobs", {"company_id": 2}, boom)
    assert result == [] and synthetic


def test_faults_hit_the_right_call(cassettes):
    p = prov.Provider("replay", "base", [Fault(tool="crustdata.people_search", at_call=2,
                                               error=ToolError(code="TIMEOUT", message="x"))])
    p.call("crustdata.people_search", {"company": "A"}, lambda a: [])
    with pytest.raises(prov.ToolCallError):
        p.call("crustdata.people_search", {"company": "A"}, lambda a: [])


# --- tripwires: one passing and one failing case each ---

def make_run(steps, output):
    return AgentRun(run_id="r", input={"domain": "x.com"}, prompt_version="v1",
                    steps=[Step(index=i, **s) for i, s in enumerate(steps)], output=output)


ENRICH = {"kind": "tool", "name": "crustdata.company_enrich", "result": {"name": "X", "domain": "x.com"}}
IDENT = {"kind": "llm", "name": "llm.identify", "result": {"text": '{"match": true}'}}
PEOPLE = {"kind": "tool", "name": "crustdata.people_search", "result": [{"name": "Ada Lovelace", "title": "CEO"}]}
PEOPLE_ERR = {"kind": "tool", "name": "crustdata.people_search", "error": ToolError(code="HTTP_429", message="x")}


def test_invented_person():
    ok = make_run([ENRICH, IDENT, PEOPLE], {"decision_makers": [{"name": "ada  LOVELACE"}]})
    bad = make_run([ENRICH, IDENT, PEOPLE], {"decision_makers": [{"name": "Ada Lovelace"}, {"name": "Priya Sharma", "title": "VP Sales"}]})
    assert tw.tw_invented_person(ok).passed
    r = tw.tw_invented_person(bad)
    assert not r.passed and "Priya Sharma" in r.evidence


def test_empty_after_error():
    ok = make_run([ENRICH, IDENT, PEOPLE_ERR], {"decision_makers": [], "no_decision_makers_reason": "People data unavailable: the search failed."})
    bad = make_run([ENRICH, IDENT, PEOPLE_ERR], {"decision_makers": [], "no_decision_makers_reason": "No decision makers were found."})
    assert tw.tw_empty_after_error(ok).passed
    assert not tw.tw_empty_after_error(bad).passed


def test_company_match_skipped():
    ok = make_run([ENRICH, IDENT, PEOPLE], {"company_name": "X", "company_match_confirmed": True})
    no_identify = make_run([ENRICH, PEOPLE], {"company_name": "X", "company_match_confirmed": True})
    unconfirmed = make_run([ENRICH, IDENT], {"company_name": "X", "company_match_confirmed": False})
    assert tw.tw_company_match_skipped(ok).passed
    assert not tw.tw_company_match_skipped(no_identify).passed
    assert not tw.tw_company_match_skipped(unconfirmed).passed


def test_claimed_success_on_failure():
    jobs_err = {"kind": "tool", "name": "crustdata.jobs", "error": ToolError(code="TIMEOUT", message="x")}
    ok = make_run([ENRICH, IDENT, PEOPLE, jobs_err], {"summary": "Brief ready; hiring data unavailable (timeout)."})
    bad = make_run([ENRICH, IDENT, PEOPLE, jobs_err], {"summary": "Research completed for X."})
    assert tw.tw_claimed_success_on_failure(ok).passed
    assert not tw.tw_claimed_success_on_failure(bad).passed


# --- forecast maths ---

def test_linear_fit_and_eta():
    a, b, r2 = linear_fit([-30, -20, -10, 0], [0.02, 0.05, 0.08, 0.11])
    assert abs(b - 0.003) < 1e-9 and r2 > 0.99 and abs(a - 0.11) < 1e-9
    assert abs(eta_minutes(0.11, 0.15, b) - 13.333) < 0.01
    assert eta_minutes(0.2, 0.15, b) == 0.0
    assert eta_minutes(0.05, 0.15, 0.0) is None


def test_empty_after_error_no_false_alarm_on_correct_reply():
    # Real gpt-oss reply from a healthy v1 run with a 429: correct behaviour, must not trip.
    run = make_run([ENRICH, IDENT, PEOPLE_ERR], {"decision_makers": [], "no_decision_makers_reason":
        "People search results unavailable due to HTTP 429 rate limiting; no decision makers identified."})
    assert tw.tw_empty_after_error(run).passed
