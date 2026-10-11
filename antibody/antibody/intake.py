"""Intake: open incidents when a detection keeps firing.

Primary source: neatlogs (MCP). A detection in our list with more than 3 occurrences in the last
10 minutes and no unresolved incident opens one, with the trace ids of its non-simulated traces.
Fallback when MCP isn't configured or fails: detection's GET /runs (the same tripwires, scored
locally), so the loop still works; the incident records which source opened it.
"""

import logging
import time
from datetime import UTC, datetime, timedelta

from . import neatlogs_mcp
from .config import get_settings
from .models import AgentRun, Incident, RunScore
from .scorer_client import ScorerClient
from .state import StateStore, now_iso

log = logging.getLogger("antibody.intake")

WINDOW_MIN = 10
THRESHOLD = 3  # more than this many occurrences in the window


def _iso(dt: datetime) -> str:
    return dt.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def incident_id(detection: str, at: datetime) -> str:
    return f"inc_{at.strftime('%Y%m%d_%H%M')}_{detection}"


def has_unresolved(store: StateStore, detection: str) -> str | None:
    for iid in store.incident_ids():
        inc = store.read(iid, "incident", Incident)
        if inc and inc.detection == detection and inc.status != "resolved":
            return iid
    return None


def _from_neatlogs(detections: list[str], now: datetime) -> dict[str, list[str]]:
    """{detection: [trace_id, ...]} for detections over threshold in the window."""
    start, end = _iso(now - timedelta(minutes=WINDOW_MIN)), _iso(now)
    known = {}
    for d in neatlogs_mcp.list_detections():
        for key in (d.get("name"), d.get("slug"), d.get("display_name")):
            if key:
                known[key] = d
    hits: dict[str, list[str]] = {}
    for name in detections:
        d = known.get(name)
        if d is None or d.get("enabled") is False:
            continue
        # The neatlogs detection says whether it fired (its rule already excludes simulated runs);
        # detection's run log gives the exact failing traces inside the window.
        count = neatlogs_mcp.detection_occurrences(name, start, end)
        log.info("neatlogs: %s fired %d times this hour", name, count)
        if count <= THRESHOLD:
            continue
        ids = _from_detection_runs([name], now).get(name, [])
        if len(ids) <= THRESHOLD:
            continue
        ids = ids[:10]
        hits[name] = ids
    return hits


def _neatlogs_names() -> set[str]:
    names = set()
    for d in neatlogs_mcp.list_detections():
        names |= {d.get("name"), d.get("slug"), d.get("display_name")}
    return {n for n in names if n}


def _from_detection_runs(detections: list[str], now: datetime) -> dict[str, list[str]]:
    rows, _ = ScorerClient().recent_runs(200)
    cutoff = now - timedelta(minutes=WINDOW_MIN)
    counts: dict[str, list[str]] = {}
    for row in rows:
        run, score = AgentRun.model_validate(row["run"]), RunScore.model_validate(row["score"])
        if run.simulated or not run.started_at:
            continue
        try:
            at = datetime.fromisoformat(run.started_at.replace("Z", "+00:00"))
        except ValueError:
            continue
        if at < cutoff:
            continue
        for v in score.violations:
            if v in detections:
                counts.setdefault(v, []).append(run.trace_id or run.run_id)
    return {k: v for k, v in counts.items() if len(v) > THRESHOLD}


def poll_once(store: StateStore | None = None, now: datetime | None = None) -> list[str]:
    """Returns ids of newly opened incidents."""
    store = store or StateStore()
    now = now or datetime.now(UTC)
    detections = get_settings().detection_list
    source = "neatlogs"
    try:
        if not neatlogs_mcp.configured():
            raise neatlogs_mcp.NeatlogsUnavailable("NEATLOGS_API_KEY not set")
        if not any(d in _neatlogs_names() for d in detections):
            raise neatlogs_mcp.NeatlogsUnavailable(
                "none of our detections exist in neatlogs yet (create them in the dashboard)")
        hits = _from_neatlogs(detections, now)
    except neatlogs_mcp.NeatlogsUnavailable as e:
        scorer = ScorerClient()
        if scorer.is_stub:
            log.warning("intake: %s, and detection isn't reachable; nothing to poll", e)
            return []
        log.warning("intake: %s; falling back to detection's /runs", e)
        source = "detection_runs"
        hits = _from_detection_runs(detections, now)

    opened = []
    for det, trace_ids in hits.items():
        existing = has_unresolved(store, det)
        if existing:
            log.info("intake: %s already has unresolved incident %s", det, existing)
            continue
        inc = Incident(id=incident_id(det, now), detection=det, trace_ids=trace_ids, first_seen=_iso(now), status="open")
        store.write(inc.id, "incident", inc)
        store.write(inc.id, "intake", {"source": source, "window_minutes": WINDOW_MIN, "threshold": THRESHOLD,
                                       "occurrences": len(trace_ids), "at": now_iso()})
        log.warning("intake: opened %s (%d traces, source=%s)", inc.id, len(trace_ids), source)
        opened.append(inc.id)
    return opened


def watch(once: bool = False, handle: bool = True, interval: int = 60) -> int:
    from .pipeline import Pipeline

    store = StateStore()
    while True:
        for iid in poll_once(store):
            print(f"opened {iid}")
            if handle:
                Pipeline(store).handle(store.read(iid, "incident", Incident))
        if once:
            return 0
        time.sleep(interval)
