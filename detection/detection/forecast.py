"""Risk forecasts: notice things getting worse before they break.

From .state/runs.jsonl, per tool: error rate in 10-minute windows. Fit a straight line over the recent
windows and estimate minutes until the rate crosses its threshold. This is a straight-line estimate,
not machine learning: 'likely' when the fit is clean and the crossing is close, 'possible' otherwise.
When a forecast's related check actually fires, its outcome becomes 'happened'; if its window passes
without that, 'did_not_happen'.
"""

import json
import os
from collections import defaultdict
from datetime import UTC, datetime, timedelta

from .checks.score import runs_path
from .config import get_settings
from .models import RiskForecast

WINDOW_MIN = 10
# Only the recent trend matters: an outage an hour ago shouldn't flatten today's slow rise.
LOOKBACK_MIN = float(os.environ.get("FORECAST_LOOKBACK_MIN", "40"))
THRESHOLDS = {"crustdata.people_search": 0.15, "crustdata.company_enrich": 0.15, "crustdata.jobs": 0.20}
RELATED = {"crustdata.people_search": "tw_empty_after_error", "crustdata.company_enrich": "tw_company_match_skipped",
           "crustdata.jobs": "tw_claimed_success_on_failure"}


def linear_fit(xs: list[float], ys: list[float]) -> tuple[float, float, float]:
    """Least squares y = a + b*x. Returns (a, b, r2)."""
    n = len(xs)
    if n < 2:
        return (ys[0] if ys else 0.0), 0.0, 0.0
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    if sxx == 0:
        return my, 0.0, 0.0
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    a = my - b * mx
    ss_tot = sum((y - my) ** 2 for y in ys)
    ss_res = sum((y - (a + b * x)) ** 2 for x, y in zip(xs, ys))
    return a, b, (1 - ss_res / ss_tot) if ss_tot > 0 else 1.0


def eta_minutes(current: float, threshold: float, slope_per_min: float) -> float | None:
    if current >= threshold:
        return 0.0
    if slope_per_min <= 0:
        return None
    return (threshold - current) / slope_per_min


def _load(now: datetime, minutes: float | None = None) -> list[dict]:
    path = runs_path()
    if not path.exists():
        return []
    cutoff = now - timedelta(minutes=minutes or LOOKBACK_MIN)
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            row = json.loads(line)
            at = datetime.fromisoformat(row["run"]["started_at"].replace("Z", "+00:00"))
        except Exception:
            continue
        if at >= cutoff:
            row["_at"] = at
            rows.append(row)
    return rows


def forecasts(now: datetime | None = None, min_windows: int = 3) -> list[RiskForecast]:
    now = now or datetime.now(UTC)
    rows = _load(now)
    # per tool, per window: [errors, calls]
    stats: dict[str, dict[int, list[int]]] = defaultdict(lambda: defaultdict(lambda: [0, 0]))
    violations_after: dict[str, list[datetime]] = defaultdict(list)
    for row in rows:
        w = int((now - row["_at"]).total_seconds() // (WINDOW_MIN * 60))
        for s in row["run"]["steps"]:
            if s["kind"] == "tool":
                stats[s["name"]][w][1] += 1
                stats[s["name"]][w][0] += 1 if s.get("error") else 0
        for v in row["score"]["violations"]:
            violations_after[v].append(row["_at"])

    out = []
    for tool, windows in stats.items():
        ws = sorted(windows)  # 0 = most recent window
        if len(ws) < min_windows:
            continue
        xs = [-(w * WINDOW_MIN) for w in ws]  # minutes relative to now
        ys = [windows[w][0] / windows[w][1] for w in ws]
        a, b, r2 = linear_fit(xs, ys)
        current = ys[0]
        threshold = THRESHOLDS.get(tool, 0.2)
        eta = eta_minutes(current, threshold, b)
        if eta is None or b <= 0:
            continue
        likely = r2 >= 0.6 and eta <= 60
        first = ys[-1]
        out.append(RiskForecast(
            id=f"risk_{tool.split('.')[-1]}_{now.strftime('%Y%m%d%H%M')}",
            signal="tool_error_rate", subject=tool, current=round(current, 4), threshold=threshold,
            trend_per_hour=round(b * 60, 4), eta_minutes=round(eta, 1),
            likelihood="likely" if likely else "possible", related_check=RELATED.get(tool),
            evidence=(f"{tool} errors rose from {first:.0%} to {current:.0%} over the last "
                      f"{len(ws) * WINDOW_MIN} minutes (fit r2={r2:.2f})"),
            created_at=now.isoformat(timespec="seconds").replace("+00:00", "Z"),
        ))
    return _with_outcomes(out, violations_after, now)


def _with_outcomes(new: list[RiskForecast], violations_after: dict, now: datetime) -> list[RiskForecast]:
    """Keep a history of forecasts and settle their outcomes."""
    path = get_settings().state_dir / "risks.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    hist = [RiskForecast.model_validate(r) for r in json.loads(path.read_text())] if path.exists() else []
    known = {r.id for r in hist}
    hist += [r for r in new if r.id not in known]
    for r in hist:
        if r.outcome != "pending":
            continue
        made = datetime.fromisoformat(r.created_at.replace("Z", "+00:00"))
        deadline = made + timedelta(minutes=(r.eta_minutes or 0) + WINDOW_MIN * 3)
        fired = [t for t in violations_after.get(r.related_check or "", []) if made <= t <= deadline]
        if fired:
            r.outcome = "happened"
        elif now > deadline:
            r.outcome = "did_not_happen"
    hist = hist[-200:]
    path.write_text(json.dumps([r.model_dump() for r in hist], indent=2), encoding="utf-8")
    return list(reversed(hist))
