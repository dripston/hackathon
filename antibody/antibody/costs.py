"""Antibody's cost per incident, for the cfo.ai business plan.

Two sources, reported side by side (never blended):
- ledger: Antibody's own token usage x PRICE_* env prices, plus the patient's reported replay cost,
  recorded in resolution.json when the incident was handled;
- neatlogs: the summed cost of traces neatlogs returns for the incident id (Antibody's spans carry
  antibody.incident_id), when neatlogs is configured.
"""

import json
import logging

from . import neatlogs_mcp
from .models import Incident, Resolution
from .state import StateStore, now_iso

log = logging.getLogger("antibody.costs")


def neatlogs_cost(incident_id: str) -> tuple[float | None, int]:
    if not neatlogs_mcp.configured():
        return None, 0
    try:
        traces = neatlogs_mcp.search_traces(incident_id, limit=100)
    except neatlogs_mcp.NeatlogsUnavailable as e:
        log.warning("costs: neatlogs unavailable (%s)", e)
        return None, 0
    return round(sum(float(t.get("cost") or 0) for t in traces), 6), len(traces)


def report(store: StateStore | None = None) -> dict:
    store = store or StateStore()
    rows = []
    for iid in store.incident_ids():
        inc = store.read(iid, "incident", Incident)
        res = store.read(iid, "resolution", Resolution)
        if res is None:
            continue
        nl_cost, nl_traces = neatlogs_cost(iid)
        rows.append({
            "incident_id": iid, "detection": inc.detection, "status": inc.status,
            "ledger_cost_usd": res.cost_usd, "neatlogs_cost_usd": nl_cost, "neatlogs_traces": nl_traces,
            "duration_ms": res.duration_ms, "attempts": len(res.attempts), "mock": store.is_mock(iid),
        })
    real = [r for r in rows if not r["mock"]]
    def avg(key, rs):
        vals = [r[key] for r in rs if r[key] is not None]
        return round(sum(vals) / len(vals), 6) if vals else None
    out = {
        "incidents": len(rows), "real_incidents": len(real),
        "avg_ledger_cost_usd_real": avg("ledger_cost_usd", real),
        "avg_neatlogs_cost_usd_real": avg("neatlogs_cost_usd", real),
        "avg_duration_ms_real": avg("duration_ms", real),
        "rows": rows, "created_at": now_iso(),
        "note": "Only non-mock incidents count toward the averages. Ledger prices come from PRICE_* env vars.",
    }
    (store.root / "costs.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    return out
