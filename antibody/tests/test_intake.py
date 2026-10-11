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
    counts = {"tw_invented_person": 5, "tw_empty_after_error": 3}
    simulated = {"t_sim"}
    monkeypatch.setattr(neatlogs_mcp, "list_detections",
                        lambda: [{"name": n, "enabled": True} for n in [*counts, "something_else"]])
    monkeypatch.setattr(neatlogs_mcp, "detection_count", lambda name, s, e: counts.get(name, 0))
    monkeypatch.setattr(neatlogs_mcp, "search_traces",
                        lambda q, limit=20, date_range=None: [{"trace_id": t} for t in ("t1", "t_sim", "t2")])
    monkeypatch.setattr(neatlogs_mcp, "trace_context", lambda tid: {"sim": tid in simulated})
    monkeypatch.setattr(neatlogs_mcp, "is_simulated", lambda ctx: ctx["sim"])
    return counts


def test_opens_incident_only_over_threshold(fake_neatlogs):
    st = StateStore()
    opened = intake.poll_once(st, now=NOW)
    assert opened == ["inc_20261011_1420_tw_invented_person"]  # 3 is not "more than 3"
    inc = st.read(opened[0], "incident", Incident)
    assert inc.trace_ids == ["t1", "t2"]  # simulated trace ignored
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
