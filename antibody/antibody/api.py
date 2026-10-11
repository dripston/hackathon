"""Operator API on :4000, used by the console and the voice agent. Shapes follow /CONTRACT.md."""

import logging
from typing import Literal

from fastapi import BackgroundTasks, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from . import aftercare, brief, intake, trust
from .config import get_settings
from .models import Attempt, Diagnosis, FamilyResult, Incident, Resolution, Scenario
from .pipeline import ApprovalError, approve, reject
from .scorer_client import ScorerClient
from .state import StateStore

log = logging.getLogger("antibody.api")
app = FastAPI(title="Antibody Operator API")
app.add_middleware(CORSMiddleware, allow_origins=get_settings().cors_list, allow_methods=["*"],
                   allow_headers=["*"], expose_headers=["x-antibody-mock"])


def store() -> StateStore:
    return StateStore()


def _mock(resp: Response, is_mock: bool) -> None:
    if is_mock:
        resp.headers["x-antibody-mock"] = "1"


class ApproveBody(BaseModel):
    fix_id: str
    phrase: str
    channel: Literal["typed", "voice"] = "typed"


class RejectBody(BaseModel):
    fix_id: str
    reason: str = ""


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/incidents")
def incidents(response: Response) -> list[Incident]:
    st = store()
    out = [st.read(i, "incident", Incident) for i in st.incident_ids()]
    out.sort(key=lambda i: i.first_seen, reverse=True)
    _mock(response, any(st.is_mock(i.id) for i in out))
    return out


@app.get("/incidents/{incident_id}")
def incident(incident_id: str, response: Response):
    st = store()
    inc = st.read(incident_id, "incident", Incident)
    if inc is None:
        return JSONResponse({"error": "Unknown incident"}, status_code=404)
    families = []
    base = st.read(incident_id, "baseline", FamilyResult)
    if base:
        families.append(base)
    attempts = [Attempt.model_validate(x) for x in (st.read(incident_id, "attempts") or [])]
    families += [a.result for a in attempts if a.result]
    scenarios = [Scenario.model_validate(x) for x in (st.read(incident_id, "family") or [])]
    _mock(response, st.is_mock(incident_id))
    return {
        "incident": inc,
        "diagnosis": st.read(incident_id, "diagnosis", Diagnosis),
        "families": families,
        "resolution": st.read(incident_id, "resolution", Resolution),
        # Not in the contract shape (extra keys): what the incident page's Family and Attempts steps show.
        "scenarios": scenarios,
        "attempts": [_attempt_view(a, scenarios) for a in attempts],
        "intake": st.read(incident_id, "intake"),
        "trace_url_template": get_settings().neatlogs_trace_url or None,
    }


def _attempt_view(a: Attempt, scenarios: list[Scenario]) -> dict:
    """An attempt plus a one-line verdict: accepted, or what it still fails / which healthy case it broke."""
    by_id = {s.id: s for s in scenarios}
    r = a.result
    if a.error and r is None:
        verdict, broke, still = f"error: {a.error}", [], []
    else:
        failed = [v for v in (r.verdicts if r else []) if not v.passed]
        broke = [{"scenario_id": v.scenario_id, "domain": by_id[v.scenario_id].domain if v.scenario_id in by_id else None,
                  "failed_checks": v.failed_checks} for v in failed
                 if v.scenario_id in by_id and by_id[v.scenario_id].role == "must_not_change"]
        still = [v.scenario_id for v in failed if v.scenario_id in by_id and by_id[v.scenario_id].role == "must_fix"]
        if a.accepted:
            verdict = "accepted"
        elif broke:
            verdict = "rejected: broke " + ", ".join(b["domain"] or b["scenario_id"] for b in broke)
        elif r:
            verdict = f"rejected: must_fix {r.must_fix_passed}/{r.must_fix_total}"
        else:
            verdict = "not run"
    return {**a.model_dump(), "verdict": verdict, "broke": broke, "still_failing": still}


@app.get("/incidents/{incident_id}/brief")
def incident_brief(incident_id: str, response: Response):
    st = store()
    try:
        text = brief.build(st, incident_id)
    except KeyError:
        return JSONResponse({"error": "Unknown incident"}, status_code=404)
    _mock(response, st.is_mock(incident_id))
    return {"text": text}


@app.post("/incidents/{incident_id}/approve")
def incident_approve(incident_id: str, body: ApproveBody, response: Response):
    st = store()
    try:
        res = approve(st, incident_id, body.fix_id, body.phrase, body.channel)
    except ApprovalError as e:
        return JSONResponse({"error": str(e)}, status_code=e.status)
    except RuntimeError as e:  # gh merge failed
        return JSONResponse({"error": f"Approved, but merge failed: {e}"}, status_code=502)
    if res.merged and get_settings().aftercare_auto:
        aftercare.start(incident_id)  # pull main, re-run the gate on main, refresh /trust
    _mock(response, st.is_mock(incident_id))
    return res


@app.post("/incidents/{incident_id}/reject")
def incident_reject(incident_id: str, body: RejectBody, response: Response):
    st = store()
    try:
        res = reject(st, incident_id, body.fix_id, body.reason)
    except ApprovalError as e:
        return JSONResponse({"error": str(e)}, status_code=e.status)
    _mock(response, st.is_mock(incident_id))
    return res


@app.get("/gate/latest")
def gate_latest(response: Response):
    st = store()
    report = st.read_gate()
    if report is None:
        return JSONResponse({"error": "No gate report yet"}, status_code=404)
    meta = st.root / "gate" / "meta.json"
    import json
    _mock(response, meta.exists() and json.loads(meta.read_text()).get("mock", False))
    return report


@app.get("/trust")
def trust_report():
    """Not in the contract (extra endpoint): the Trust page's numbers, from the latest backtest."""
    return trust.report(store())


@app.get("/evidence")
def evidence_export():
    """Not in the contract (extra endpoint): labelled proof for judges (incidents with traces, commits,
    Entire checkpoints, before/after, PRs, gate, backtest, costs). Same as `antibody evidence`."""
    from .evidence import build

    return build(store())


@app.get("/aftercare")
def aftercare_status():
    """Progress of the post-merge job (pull, gate main, backtest)."""
    return aftercare.status(store())


@app.get("/overview")
def overview(response: Response):
    """Not in the contract (extra endpoint): the Live ward's top strip in one call."""
    from datetime import UTC, datetime, timedelta

    st = store()
    incs = [st.read(i, "incident", Incident) for i in st.incident_ids()]
    try:
        rows, mock = ScorerClient().recent_runs(200)
    except Exception:
        rows, mock = [], False
    cutoff = datetime.now(UTC) - timedelta(minutes=10)

    def recent(row):
        try:
            t = datetime.fromisoformat(row["run"]["started_at"].replace("Z", "+00:00"))
        except (KeyError, ValueError):
            return False
        return t >= cutoff

    last10 = [r for r in rows if recent(r)]
    failed = [r for r in last10 if (r.get("score") or {}).get("violations")]
    gate = st.read_gate()
    _mock(response, mock or any(st.is_mock(i.id) for i in incs if i))
    return {
        "runs_last_10_min": len(last10),
        "silent_failures_last_10_min": len(failed),
        "silent_failure_rate": (len(failed) / len(last10)) if last10 else None,
        "open_incidents": sum(1 for i in incs if i and i.status not in ("resolved",)),
        "awaiting_approval": sum(1 for i in incs if i and i.status == "awaiting_approval"),
        "gate_verdict": (gate.verdict if hasattr(gate, "verdict") else (gate or {}).get("verdict")) if gate else None,
    }


@app.get("/risks")
def risks(response: Response):
    data, mock = ScorerClient().risks()
    _mock(response, mock)
    return data


@app.post("/webhooks/neatlogs")
async def neatlogs_webhook(request: Request, background: BackgroundTasks):
    path = store().save_webhook(await request.body())
    background.add_task(intake.poll_once)
    return {"stored": path.name}
