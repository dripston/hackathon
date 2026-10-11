"""The gate: a family re-opens on the buggy prompt, passes on the fixed one, and is n/a when absent."""

from antibody import gate, git_tools
from antibody.breed import TRIPWIRES
from antibody.models import Fault, Scenario, ToolError
from antibody.state import StateStore
from antibody.stubs.prompts import load

E429 = Fault(tool="crustdata.people_search", at_call=1, error=ToolError(code="HTTP_429", message="rate limited"))
FIXED = load("v2").replace("every brief must include at least 3 decision makers",
                           "aim for 3 decision makers; never name anyone not in tool results, list fewer and say why")


def family():
    sc = [
        Scenario(id="sc_01", incident_id="inc_t", role="must_fix", domain="tinyforge.co", expected_checks=["tw_invented_person"]),
        Scenario(id="sc_02", incident_id="inc_t", role="must_fix", domain="bluepeak.dev", faults=[E429], expected_checks=["tw_invented_person"]),
        Scenario(id="sc_03", incident_id="inc_t", role="must_not_change", domain="lumenwharf.com", expected_checks=TRIPWIRES),
    ]
    return {"incident_id": "inc_t", "detection": "tw_invented_person", "target_file": "p/v2.md",
            "fix_kind": "prompt_patch", "prompt_version": "v2", "bug_flags": {}, "caused_by_commit": "abc",
            "scenarios": [s.model_dump(mode="json") for s in sc], "mock": True}


def test_gate_blocks_buggy_and_passes_fixed(monkeypatch):
    files = {"bad": load("v2"), "good": FIXED}
    monkeypatch.setattr(git_tools, "show_file", lambda ref, path: files.get(ref))
    monkeypatch.setattr(gate, "load_families", lambda *a, **k: [family()])
    st = StateStore()
    report, mock = gate.run_gate("bad", st, echo=lambda _: None)
    assert report.verdict == "blocked" and report.families[0].reopens and mock
    assert "re-opens inc_t" in report.families[0].message
    report, _ = gate.run_gate("good", st, echo=lambda _: None)
    assert report.verdict == "safe"
    assert st.read_gate()["verdict"] == "safe"
    report, _ = gate.run_gate("missing", st, echo=lambda _: None)
    assert report.verdict == "safe" and report.families == []  # n/a, not a pass claim


def test_backtest_counts_catches_and_false_alarms(monkeypatch):
    files = {"abc": load("v2"), "abc^": FIXED, "clean1": FIXED}
    monkeypatch.setattr(git_tools, "show_file", lambda ref, path: files.get(ref))
    monkeypatch.setattr(gate, "load_families", lambda *a, **k: [family()])
    s = gate.backtest(StateStore(), echo=lambda _: None, clean_refs=["clean1"])
    assert s["caught"] == 1 and s["detection_rate"] == 1.0
    assert s["false_alarms"] == 0 and s["clean_checks"] == 2
