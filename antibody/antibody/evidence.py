"""`antibody evidence`: everything Antibody can prove, in one JSON file for the evidence page.

Every item is labelled: LIVE (real patient + real detection), SIMULATED (replays of recorded tool
responses), or MOCK (Antibody's built-in stubs). Seeded bugs are always called seeded.
"""

import json

from . import git_tools
from .config import ANTIBODY_DIR
from .models import Attempt, Diagnosis, FamilyResult, Incident, Resolution
from .state import StateStore, now_iso


def build(store: StateStore | None = None) -> dict:
    store = store or StateStore()
    repo = git_tools.github_repo()
    items = []
    for iid in store.incident_ids():
        inc = store.read(iid, "incident", Incident)
        diag = store.read(iid, "diagnosis", Diagnosis)
        base = store.read(iid, "baseline", FamilyResult)
        res = store.read(iid, "resolution", Resolution)
        attempts = [Attempt.model_validate(a) for a in store.read(iid, "attempts") or []]
        intake = store.read(iid, "intake") or {}
        mock = store.is_mock(iid)
        accepted = next((a for a in attempts if a.accepted), None)
        items.append({
            "kind": "incident",
            "label": "MOCK" if mock else "SIMULATED",
            "seeded_bug": True,
            "incident_id": iid,
            "detection": inc.detection,
            "status": inc.status,
            "opened_by": intake.get("source", "file"),
            "trace_ids": inc.trace_ids,
            "commit": diag.commit_sha if diag else None,
            "commit_url": f"https://github.com/{repo}/commit/{diag.commit_sha}" if diag and diag.commit_sha and repo else None,
            "checkpoint_url": diag.checkpoint_url if diag else None,
            "reasoning": diag.reasoning_excerpt if diag else None,
            "reasoning_source": diag.reasoning_source if diag else None,
            "explanation": diag.explanation if diag else None,
            "before": {"must_fix": f"{base.must_fix_passed}/{base.must_fix_total}",
                       "must_not_change": f"{base.must_not_change_passed}/{base.must_not_change_total}"} if base else None,
            "after": {"must_fix": f"{accepted.result.must_fix_passed}/{accepted.result.must_fix_total}",
                      "must_not_change": f"{accepted.result.must_not_change_passed}/{accepted.result.must_not_change_total}"}
            if accepted else None,
            "attempts": [{"id": a.fix.id, "accepted": a.accepted, "description": a.fix.description,
                          "error": a.error} for a in attempts],
            "pr_url": res.pr_url if res else None,
            "approval": res.approval.model_dump() if res and res.approval else None,
            "cost_usd": res.cost_usd if res else None,
            "duration_ms": res.duration_ms if res else None,
        })
    gate = store.read_gate()
    if gate:
        meta = store.root / "gate" / "meta.json"
        gmock = meta.exists() and json.loads(meta.read_text()).get("mock", False)
        items.append({"kind": "gate", "label": "MOCK" if gmock else "SIMULATED", **gate})
    bt = store.root / "backtest.json"
    if bt.exists():
        items.append({"kind": "backtest", **json.loads(bt.read_text(encoding="utf-8"))})
    costs = store.root / "costs.json"
    if costs.exists():
        items.append({"kind": "costs", **json.loads(costs.read_text(encoding="utf-8"))})
    return {"source": "antibody", "created_at": now_iso(), "items": items}


def write(store: StateStore | None = None) -> str:
    data = build(store)
    path = ANTIBODY_DIR / ".state" / "evidence.json" if store is None else store.root / "evidence.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return str(path)
