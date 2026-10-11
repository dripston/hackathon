"""Intake rules with the neatlogs MCP layer faked (tests never call the network)."""

from datetime import UTC, datetime

import pytest

from antibody import config, intake, neatlogs_mcp
from antibody.models import Incident
from antibody.state import StateStore

NOW = datetime(2026, 10, 11, 14, 20, tzinfo=UTC)


@pytest.fixture
def fake_neatlogs(monkeypatch):
    monkeypatch.setenv("NEATLOGS_API_KEY", "test-key")
    config.get_settings.cache_clear()
    # The detections themselves exclude simulated runs, so flagged traces are all real.
    flagged = {"tw_invented_person": ["t1", "t2", "t3", "t4", "t5"], "tw_empty_after_error": ["t6", "t7", "t8"]}
    monkeypatch.setattr(neatlogs_mcp, "list_detections",
                        lambda: [{"name": n, "enabled": True} for n in [*flagged, "something_else"]])
    monkeypatch.setattr(neatlogs_mcp, "detection_occurrences", lambda name, s, e: len(flagged.get(name, [])))
    monkeypatch.setattr(intake, "_from_detection_runs",
                        lambda names, now: {n: flagged[n] for n in names if len(flagged.get(n, [])) > 3})
    return flagged


def test_opens_incident_only_over_threshold(fake_neatlogs):
    st = StateStore()
    opened = intake.poll_once(st, now=NOW)
    assert opened == ["inc_20261011_1420_tw_invented_person"]  # 3 is not "more than 3"
    inc = st.read(opened[0], "incident", Incident)
    assert inc.trace_ids == ["t1", "t2", "t3", "t4", "t5"]
    assert st.read(opened[0], "intake")["source"] == "neatlogs"


def test_no_duplicate_while_unresolved(fake_neatlogs):
    st = StateStore()
    assert intake.poll_once(st, now=NOW)
    assert intake.poll_once(st, now=NOW.replace(minute=30)) == []
    inc = st.read("inc_20261011_1420_tw_invented_person", "incident", Incident)
    inc.status = "resolved"
    st.write(inc.id, "incident", inc)
    assert intake.poll_once(st, now=NOW.replace(minute=40)) == ["inc_20261011_1440_tw_invented_person"]


def test_without_neatlogs_or_detection_nothing_opens():
    assert intake.poll_once(StateStore(), now=NOW) == []


def test_detection_rule_matches_only_real_failures():
    cfg = neatlogs_mcp.detection_config("tw_empty_after_error")
    values = [c["value"] for c in cfg["root"]["children"]]
    assert values == ["antibody.score", '"antibody.tw.tw_empty_after_error":1', '"antibody.simulated":false']
