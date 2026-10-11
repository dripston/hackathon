"""Stage order, skip/force behaviour, and the Operator API, all on stubs."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from antibody import apply, ship
from antibody.models import Incident
from antibody.pipeline import STAGES, Pipeline
from antibody.state import StateStore

SAMPLE = Path(__file__).resolve().parent.parent / "fixtures" / "incidents" / "sample.json"


@pytest.fixture
def no_git(monkeypatch, tmp_path):
    """Replace worktree + ship side effects with in-memory fakes (tests never touch git or GitHub)."""
    def fake_create(incident_id, attempt, rel_path, new_content, message, base="HEAD"):
        p = tmp_path / f"wt{attempt}"
        p.mkdir(exist_ok=True)
        return apply.Worktree(path=p, branch=apply.branch_name(incident_id, attempt), sha="0" * 40)

    shipped = []
    monkeypatch.setattr(apply, "create", fake_create)
    monkeypatch.setattr(ship, "ship", lambda *a, **k: shipped.append(a) or {"pr_url": None, "note": "test"})
    return shipped


def sample() -> Incident:
    return Incident.model_validate(json.loads(SAMPLE.read_text()))


def test_stages_run_in_order_and_write_files(no_git):
    lines = []
    st = StateStore()
    out = Pipeline(st, echo=lines.append).handle(sample())
    order = [l.split("]")[0].strip("[ ") for l in lines if not l.startswith("[attempts  ] fix_")]
    assert order == STAGES
    for stage in STAGES:
        assert st.has(out.id, stage)
    assert out.status == "awaiting_approval"
    assert st.is_mock(out.id)  # everything here came from stubs
    assert len(no_git) == 1


def test_existing_stages_are_skipped_unless_forced(no_git):
    st = StateStore()
    Pipeline(st, echo=lambda _: None).handle(sample())
    lines = []
    Pipeline(st, echo=lines.append).handle(sample())
    assert all("skip" in l for l in lines) and len(lines) == len(STAGES)
    lines.clear()
    Pipeline(st, echo=lines.append).handle(sample(), force=True)
    assert not any("skip" in l for l in lines)


def test_baseline_reproduces_and_fix_is_accepted(no_git):
    st = StateStore()
    inc = Pipeline(st, echo=lambda _: None).handle(sample())
    base = st.read(inc.id, "baseline")
    assert base["must_fix_passed"] < base["must_fix_total"]
    attempts = st.read(inc.id, "attempts")
    assert attempts[-1]["accepted"] and "fewer" in attempts[-1]["fix"]["diff"]
    res = st.read(inc.id, "resolution")
    assert res["accepted_fix_id"] == attempts[-1]["fix"]["id"]


def test_api_endpoints(no_git):
    from antibody.api import app

    st = StateStore()
    inc = Pipeline(st, echo=lambda _: None).handle(sample())
    c = TestClient(app)
    assert c.get("/health").json() == {"ok": True}
    r = c.get("/incidents")
    assert r.status_code == 200 and r.json()[0]["id"] == inc.id and r.headers["x-antibody-mock"] == "1"
    d = c.get(f"/incidents/{inc.id}").json()
    assert set(d) == {"incident", "diagnosis", "families", "resolution"}
    text = c.get(f"/incidents/{inc.id}/brief").json()["text"]
    assert "approve fix 1" in text
    bad = c.post(f"/incidents/{inc.id}/approve", json={"fix_id": "fix_1", "phrase": "yes", "channel": "voice"})
    assert bad.status_code == 400 and bad.json() == {"error": "Not an approval phrase"}
    ok = c.post(f"/incidents/{inc.id}/approve", json={"fix_id": "fix_1", "phrase": "approve fix 1", "channel": "voice"})
    assert ok.status_code == 200 and ok.json()["approval"]["channel"] == "voice"
    assert c.get("/incidents/nope").status_code == 404
    assert c.get("/gate/latest").status_code == 404
    r = c.get("/risks")
    assert r.json() == [] and r.headers["x-antibody-mock"] == "1"
    assert c.post("/webhooks/neatlogs", content=b'{"x":1}').status_code == 200
