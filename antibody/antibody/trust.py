"""GET /trust: why believe Antibody. Built from the latest backtest (.state/backtest.json) and the
seeded bug list (detection/fixtures/bug-commits.json). Misses are listed, not hidden."""

import json

from .config import REPO_ROOT
from .state import StateStore

BUGS = REPO_ROOT / "detection" / "fixtures" / "bug-commits.json"


def report(store: StateStore | None = None) -> dict:
    store = store or StateStore()
    path = store.root / "backtest.json"
    bt = json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
    seeded = json.loads(BUGS.read_text(encoding="utf-8")) if BUGS.exists() else {"bugs": [], "label": ""}
    rows = {r["commit"]: r for r in (bt or {}).get("rows", [])}

    bugs = []
    for b in seeded.get("bugs", []):
        row = rows.get(b["commit"])
        if row:
            caught, note = row["caught"], row["bad"]
        else:
            caught, note = False, ("no immunity family: it never fired on real traffic, so there was no incident "
                                   "to learn from" if bt else "not measured yet")
        bugs.append({"bug": b["bug"], "commit": b["commit"], "check": b["check"],
                     "incident_id": row["incident_id"] if row else None, "would_have_blocked": caught, "note": note})

    blocked = sum(b["would_have_blocked"] for b in bugs)
    return {
        "status": "measured" if bt else "not_measured_yet",
        "label": (bt or {}).get("label", "SIMULATED (replay of recorded tool responses against seeded bugs)"),
        "seeded_label": seeded.get("label", ""),
        "created_at": (bt or {}).get("created_at"),
        "seeded_bugs": bugs,
        "would_have_blocked": blocked,
        "catch_rate": (blocked / len(bugs)) if bugs and bt else None,
        "misses": [b for b in bugs if not b["would_have_blocked"]],
        "false_alarm_rate": (bt or {}).get("false_alarm_rate"),
        "false_alarm_checks": (bt or {}).get("clean_checks", 0),
        "false_alarms": (bt or {}).get("false_alarms", 0),
        "families": (bt or {}).get("rows", []),
    }
