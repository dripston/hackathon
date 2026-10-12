"""Operator API on :4000, used by the console and the voice agent. Shapes follow /CONTRACT.md."""

import json
import logging
import os
import subprocess
from pathlib import Path
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


@app.get("/incidents/{incident_id}/events")
def incident_events(incident_id: str, after: int = 0):
    """Not in the contract (extra endpoint): live step-by-step events for the console's workspace view."""
    from . import events

    evs = events.read(incident_id, after)
    return {"events": evs, "next": evs[-1]["seq"] if evs else after}


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


DRILL_STATUS = Path(__file__).resolve().parent.parent / ".state" / "drill" / "status.json"
DRILL_ACTIVE = {"starting", "deploying", "traffic", "detecting", "fixing", "awaiting_approval", "verifying"}


def _pid_alive(pid: int | None) -> bool:
    if not pid:
        return False
    if os.name == "nt":  # os.kill(pid, 0) sends CTRL_C_EVENT on Windows; ask the kernel instead
        import ctypes

        k32 = ctypes.windll.kernel32
        h = k32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
        if not h:
            return False
        code = ctypes.c_ulong()
        k32.GetExitCodeProcess(h, ctypes.byref(code))
        k32.CloseHandle(h)
        return code.value == 259  # STILL_ACTIVE
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


@app.get("/drill/status")
def drill_status():
    """Not in the contract (extra endpoint): the live drill mission control is showing, if any."""
    try:
        st = json.loads(DRILL_STATUS.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"state": "idle", "running": False}
    alive = _pid_alive(st.get("pid"))
    st["running"] = alive and not st.get("ended")
    if st.get("state") in DRILL_ACTIVE and not alive:
        st["state"], st["message"] = "failed", "the drill process stopped unexpectedly"
    return st


def _stop_drill(st: dict) -> None:
    """Stop a drill and everything it started (its process group: the sandbox patient and Antibody)."""
    import signal
    import time as _time

    pgid = st.get("pgid") or st.get("pid")
    if not pgid:
        return
    if os.name == "nt":
        subprocess.run(["taskkill", "/T", "/F", "/PID", str(pgid)], capture_output=True)
        return
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(pgid, sig)
        except OSError:
            return
        _time.sleep(2)


@app.post("/drill/stop")
def drill_stop():
    """Stop the current drill (for example one waiting for an approval nobody will give)."""
    st = drill_status()
    if not st.get("running"):
        return {"stopped": False}
    _stop_drill(st)
    DRILL_STATUS.write_text(json.dumps({**st, "state": "failed", "message": "Stopped from the console", "ended": True,
                                        "running": False}), encoding="utf-8")
    return {"stopped": True}


@app.post("/drill/start")
def drill_start():
    """Start one live incident drill (scripts/e2e.py --drill). One at a time; a finished drill that is
    still on screen is replaced."""
    st = drill_status()
    if st.get("running"):
        if st.get("state") in ("done", "expired", "failed"):
            _stop_drill(st)
        else:
            return JSONResponse({"error": "A drill is already running"}, status_code=409)
    root = Path(__file__).resolve().parent.parent
    DRILL_STATUS.parent.mkdir(parents=True, exist_ok=True)
    env = {k: v for k, v in os.environ.items() if k not in ("VIRTUAL_ENV",)}
    log = open(DRILL_STATUS.parent / "drill.log", "wb")
    proc = subprocess.Popen(["uv", "run", "--quiet", "python", "scripts/e2e.py", "--drill"], cwd=root, env=env,
                            stdout=log, stderr=subprocess.STDOUT, start_new_session=os.name != "nt")
    DRILL_STATUS.write_text(json.dumps({"state": "starting", "message": "Launching the drill", "pid": proc.pid, "pgid": proc.pid,
                                        "started_at": __import__("datetime").datetime.now().astimezone().isoformat()}),
                            encoding="utf-8")
    return {"started": True, "pid": proc.pid}


_gh_cache: dict = {}


def _gh_ok() -> bool:
    import shutil
    import time as _time

    if _gh_cache.get("at", 0) > _time.time() - 300:
        return _gh_cache["ok"]
    ok = bool(shutil.which("gh")) and subprocess.run(["gh", "auth", "status"], capture_output=True).returncode == 0
    _gh_cache.update(ok=ok, at=_time.time())
    return ok


@app.get("/system/info")
def system_info():
    """Not in the contract (extra endpoint): what this Antibody is connected to, for the console's
    Agents, Integrations and Settings pages. Presence flags only: no key values ever leave the server."""
    import shutil

    from . import git_tools
    from .config import REPO_ROOT

    s = get_settings()
    env = os.environ.get
    oncall = {}
    try:
        oncall = json.loads((REPO_ROOT / "voice" / ".state" / "oncall.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass
    chat = str(oncall.get("chat_id") or env("ONCALL_CHAT_ID") or "")
    provider = (env("LLM_PROVIDER") or s.llm_provider or "").lower()
    return {
        "workspace": "airo",
        "agent": {
            "name": "sales-research-agent",
            "workflow": "company-research",
            "description": "Researches a company from its domain: confirms it, finds decision makers and hiring signals, writes a sales brief.",
            "llm": {"provider": provider, "model": env("MODEL_CHEAP") or s.model_cheap},
            "prompt_version": env("PATIENT_PROMPT_VERSION", "v1"),
            "tools": ["crustdata.company_enrich", "crustdata.people_search", "crustdata.jobs"],
            "checks": [
                {"id": "tw_invented_person", "label": "Invented person", "kind": "tripwire"},
                {"id": "tw_empty_after_error", "label": "Empty after a tool error", "kind": "tripwire"},
                {"id": "tw_company_match_skipped", "label": "Company check skipped", "kind": "tripwire"},
                {"id": "tw_claimed_success_on_failure", "label": "Claimed success on failure", "kind": "tripwire"},
                {"id": "jev_grounded", "label": "Grounded in tool results (Jev)", "kind": "score"},
            ],
            "data_mode": env("CRUSTDATA_MODE", "replay"),
        },
        "integrations": [
            {"id": "neatlogs", "name": "neatlogs", "role": "Traces every run; detections open incidents",
             "connected": bool(s.neatlogs_api_key), "detail": f"{len([d for d in s.detection_list if d.startswith('tw_')])} detections"},
            {"id": "github", "name": "GitHub", "role": "Pull requests for every fix, merged on approval",
             "connected": _gh_ok(), "detail": git_tools.github_repo() or "no repository"},
            {"id": "entire", "name": "Entire", "role": "The reasoning behind the commit that broke it",
             "connected": bool(shutil.which("entire")),
             "detail": "checkpoint lookup on every diagnosis" if shutil.which("entire") else "Entire CLI not installed on this server: diagnoses quote the commit message"},
            {"id": "telegram", "name": "Telegram on-call", "role": "Calls the engineer; approval by voice",
             "connected": bool(env("TELEGRAM_BOT_TOKEN")) and bool(chat), "detail": f"on-call chat …{chat[-4:]}" if chat else "send /oncall to the bot"},
            {"id": "crustdata", "name": "Crustdata", "role": "Company data the agent researches",
             "connected": bool(env("CRUSTDATA_API_KEY")), "detail": "recorded responses" if env("CRUSTDATA_MODE", "replay") == "replay" else "live API"},
            {"id": "typesafe", "name": "TypeSafe Jev", "role": "Grounding score on every brief",
             "connected": bool(env("TYPESAFE_API_KEY")) and env("JEV_ENABLED", "1") != "0", "detail": env("JEV_MODEL", "jev-latest")},
            {"id": "llm", "name": {"groq": "Groq", "deepseek": "DeepSeek"}.get(provider, provider or "LLM"), "role": "Diagnosis and fixes",
             "connected": bool(env("GROQ_API_KEY") if provider == "groq" else env("DEEPSEEK_API_KEY") if provider == "deepseek" else s.model_strong),
             "detail": env("MODEL_STRONG") or s.model_strong},
        ],
        "settings": {
            "approval_rule": "Exact phrase only: “approve fix N” (typed or spoken). “yes”, “ok” never merge.",
            "cost_cap_usd": s.antibody_cost_cap_usd,
            "family_size": int(env("FAMILY_SIZE", "10") or 10),
            "max_attempts": 3,
            "intake": f"an incident opens when a detection fires more than {intake.THRESHOLD} times in {intake.WINDOW_MIN} minutes",
            "ship_target": s.ship_target,
            "deploy_branch": s.deploy_branch,
            "oncall_poll_seconds": float(env("ONCALL_POLL_SECONDS", "15") or 15),
        },
    }


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
