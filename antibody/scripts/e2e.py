"""One command, the whole loop on real data: patient -> detection -> prediction -> incident -> fix -> evals
-> voice approval -> merge -> fixed in production.

    cd antibody
    uv run python scripts/e2e.py            # fast: about 10-15 minutes
    uv run python scripts/e2e.py --full     # also unit tests, the pre-deploy gate and the post-merge gate
    uv run python scripts/e2e.py --full --backtest   # and wait for the post-merge backtest (+~10 min)
    uv run python scripts/e2e.py --telegram # the bot calls you on Telegram; you approve the fix yourself

It never touches main or GitHub. It makes a throwaway checkout (.e2e/<stamp>, branch e2e/<stamp>, never
pushed), reintroduces a real bug there (a failed people search reported as "ok"), deploys that checkout as
the patient on a spare port and lets Antibody find and fix it. Everything is deleted at the end (--keep
to inspect it).

Labels: LLM calls are LIVE (DeepSeek), Crustdata responses are RECORDED (real, replayed), tool outages are
SIMULATED (injected faults), the bug is SEEDED by this script. Cost: a few cents of DeepSeek.
"""

import argparse
import asyncio
import json
import os
import random
import shutil
import socket
import stat
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

import httpx

ANTIBODY_DIR = Path(__file__).resolve().parent.parent
MAIN = ANTIBODY_DIR.parent
STAMP = datetime.now().strftime("%m%d%H%M")
LAB_ROOT = MAIN / ".e2e" / STAMP
LAB = LAB_ROOT / "repo"
BRANCH = f"e2e/{STAMP}"
DETECTION = "tw_empty_after_error"
PEOPLE = "crustdata.people_search"
CLEAN_ENV = dict(os.environ)

FIXED = '''        if people_step.error and flags["swallow_tool_errors"]:
            # still resilient: no crash, empty list, but never claim the search succeeded
            people, people_status = [], f"unavailable ({people_step.error.code})"
'''
BUGGY = '''        swallow = flags["swallow_tool_errors"]
        if people_step.error and swallow:
            # upstream retries are costly: treat a failed search as "nobody found" and move on
            people, people_status = [], "ok"
'''

B, DIM, G, R, Y, C, X = "\033[1m", "\033[2m", "\033[32m", "\033[31m", "\033[33m", "\033[36m", "\033[0m"
RESULTS: list[tuple[str, bool | None, str]] = []
PROCS: list[subprocess.Popen] = []


def say(text: str = "", color: str = "") -> None:
    print(f"{color}{text}{X}" if color else text, flush=True)


def step(title: str) -> None:
    say()
    say(f"== {title}", B + C)


def check(name: str, ok: bool | None, detail: str = "") -> bool:
    mark = {True: G + "PASS", False: R + "FAIL", None: Y + "SKIP"}[ok]
    say(f"   {mark}{X} {name}" + (f"  {DIM}{detail}{X}" if detail else ""))
    RESULTS.append((name, ok, detail))
    return bool(ok)


class Abort(Exception):
    pass


def require(name: str, ok: bool, detail: str = "") -> None:
    if not check(name, ok, detail):
        raise Abort(name)


# ---------- processes ----------
def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def launch(module: str, argv: list[str]) -> str:
    return (f"import sys; sys.argv = {[module.split('.')[0], *argv]!r}; "
            f"from {module} import main; r = main(); sys.exit(r if isinstance(r, int) else 0)")


def start(cmd: list[str], cwd: Path, env: dict, log: Path) -> subprocess.Popen:
    env = {k: v for k, v in env.items() if k != "VIRTUAL_ENV"}
    p = subprocess.Popen(cmd, cwd=cwd, env=env, stdout=open(log, "wb"), stderr=subprocess.STDOUT)
    PROCS.append(p)
    return p


def wait_healthy(url: str, proc: subprocess.Popen, log: Path, timeout: float = 240) -> None:
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if proc.poll() is not None:
            raise Abort(f"{url} exited: {log.read_text(encoding='utf-8', errors='replace')[-600:]}")
        try:
            if httpx.get(f"{url}/health", timeout=2).status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(1)
    raise Abort(f"{url} not healthy after {timeout:.0f} s (log: {log})")


def kill(proc: subprocess.Popen) -> None:
    if proc.poll() is None:
        if os.name == "nt":
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
        else:
            proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()


def git(*args: str, cwd: Path = MAIN, check_: bool = True) -> str:
    r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if check_ and r.returncode != 0:
        raise Abort(f"git {' '.join(args)}: {r.stderr.strip()}")
    return r.stdout.strip()


# ---------- the patient (lab detection service) ----------
def detection_env(port: int) -> dict:
    env = dict(CLEAN_ENV)
    env.update({
        "DETECTION_PORT": str(port),
        "DETECTION_STATE_DIR": str(LAB_ROOT / "det"),
        "BUG_SWALLOW_TOOL_ERRORS": "1",          # the flag is on in production, as when the bug first shipped
        "FORECAST_WINDOW_MIN": "0.5",            # 30 s windows so a forecast forms within minutes
        "FORECAST_LOOKBACK_MIN": "3",
        "UV_CACHE_DIR": str(MAIN / "detection" / ".uv-cache"),
        "PYTHONIOENCODING": "utf-8",
    })
    return env


def start_patient(port: int, tag: str) -> tuple[subprocess.Popen, str]:
    log = LAB_ROOT / f"patient-{tag}.log"
    p = start(["uv", "run", "--quiet", "python", "-c", launch("detection.cli", ["serve", "--port", str(port)])],
              LAB / "detection", detection_env(port), log)
    url = f"http://127.0.0.1:{port}"
    wait_healthy(url, p, log)
    return p, url


def fault(code: str = "HTTP_429") -> dict:
    return {"tool": PEOPLE, "at_call": 1, "error": {"code": code, "message": "injected (SIMULATED outage)"}}


def run_once(url: str, domain: str, faults: list[dict] | None = None) -> tuple[dict, dict]:
    with httpx.Client(timeout=180) as c:
        run = c.post(f"{url}/run", json={"domain": domain, "faults": faults or [], "simulated": False}).json()
        score = c.post(f"{url}/score", json=run).json()
    return run, score


def jev(score: dict) -> float | None:
    return next((c.get("score") for c in score.get("checks", []) if c["id"] == "jev_grounded"), None)


def domains() -> list[str]:
    f = LAB / "detection" / "fixtures" / "domains.txt"
    return [l.strip() for l in f.read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")]


# ---------- stages ----------
def unit_tests() -> None:
    step("0. Unit tests (all three services)")
    for name, cwd, args in [("antibody", MAIN / "antibody", []), ("detection", MAIN / "detection", ["tests_detection"]),
                            ("voice", MAIN / "voice", [])]:
        env = {k: v for k, v in CLEAN_ENV.items() if k != "VIRTUAL_ENV"}
        r = subprocess.run(["uv", "run", "--quiet", "pytest", "-q", *args], cwd=cwd, env=env, capture_output=True,
                           text=True, encoding="utf-8", errors="replace")
        lines = r.stdout.strip().splitlines() or ["(no output)"]
        last = next((l for l in reversed(lines) if " passed" in l or " failed" in l), lines[-1])
        check(f"{name} unit tests", r.returncode == 0, last)


def make_lab() -> str:
    step("1. Throwaway checkout with a real bug (SEEDED)")
    LAB_ROOT.mkdir(parents=True, exist_ok=True)
    git("worktree", "add", "-b", BRANCH, str(LAB), "HEAD")
    agent = LAB / "detection" / "detection" / "patient" / "agent.py"
    text = agent.read_text(encoding="utf-8")
    if FIXED not in text:
        raise Abort("agent.py no longer has the fixed people-search block; update FIXED in this script")
    agent.write_text(text.replace(FIXED, BUGGY), encoding="utf-8", newline="\n")
    if (MAIN / ".env").exists():
        shutil.copy(MAIN / ".env", LAB / ".env")  # the repo's single .env; secrets aren't in git
    git("add", "detection/detection/patient/agent.py", cwd=LAB)
    # hooks off for this one commit: it is test scaffolding, not work to record
    git("-c", f"core.hooksPath={LAB_ROOT / 'no-hooks'}", "commit", "-q", "-m",
        "Patient: treat a failed people search as no results when swallow_tool_errors is on\n\n"
        "People-search retries are burning Crustdata credits during rate limits. When the search fails, "
        "move on with an empty list instead of retrying; sales can live with fewer contacts.\n\n"
        "Planted-by: antibody/scripts/e2e.py (end-to-end test / live drill; this branch is never pushed)", cwd=LAB)
    sha = git("rev-parse", "HEAD", cwd=LAB)
    check("bug committed on a local branch", True, f"{BRANCH} @ {sha[:8]} (people search failure -> status 'ok')")
    return sha


def predeploy_gate(bug_sha: str) -> None:
    step("2. Pre-deploy gate on the bug commit (would Antibody have stopped it?)")
    from antibody.gate import run_gate

    report, mock = run_gate(bug_sha, echo=lambda m: say(f"   {DIM}{m}{X}"))
    check("gate ran on the real patient, not the stub", not mock)
    check("gate blocks the reintroduced bug", report.verdict == "blocked", f"verdict {report.verdict.upper()}")


def patient_healthy(url: str) -> None:
    step("3. Patient agent on healthy traffic (LIVE LLM, RECORDED Crustdata)")
    with ThreadPoolExecutor(3) as ex:
        rows = list(ex.map(lambda d: (d, *run_once(url, d)), domains()[:3]))
    for d, run, score in rows:
        brief = run.get("output") or {}
        tools = [s for s in run["steps"] if s["kind"] == "tool"]
        say(f"   {d:18} tools={len(tools)} violations={score['violations'] or '-'} jev={jev(score)} "
            f"cost=${run.get('total_cost_usd') or 0:.5f}")
        say(f"   {DIM}{(brief.get('summary') or '')[:150]}{X}")
    check("patient writes briefs", all((r.get("output") or {}).get("summary") for _, r, _ in rows))
    check("no tripwire fires on healthy runs", all(not s["violations"] for _, _, s in rows))
    scores = [jev(s) for _, _, s in rows]
    check("Jev grounding score on every run", all(x is not None for x in scores), f"scores {scores}")


def traffic_and_forecast(url: str, minutes: float, workers: int) -> dict | None:
    step(f"4. Production traffic for {minutes:g} min, people-search errors rising 0% -> 30% (SIMULATED outage)")
    rng = random.Random(7)
    doms = domains()
    t0 = time.monotonic()
    end = t0 + minutes * 60
    stats = {"runs": 0, "faults": 0, "violations": 0}
    forecast = None
    next_poll = t0 + 30

    def one(_):
        frac = (time.monotonic() - t0) / (minutes * 60)
        inject = rng.random() < 0.30 * min(frac, 1.0)
        faults = [fault(rng.choice(["HTTP_429", "HTTP_429", "TIMEOUT", "HTTP_500"]))] if inject else []
        try:
            run, score = run_once(url, rng.choice(doms), faults)
        except Exception as e:
            return None, inject, str(e)
        return score, inject, None

    with ThreadPoolExecutor(workers) as ex:
        pending = set()
        while time.monotonic() < end or pending:
            while time.monotonic() < end and len(pending) < workers:
                pending.add(ex.submit(one, None))
            done = {f for f in pending if f.done()}
            for f in done:
                score, injected, err = f.result()
                stats["runs"] += 1
                stats["faults"] += injected
                if score and DETECTION in score["violations"]:
                    stats["violations"] += 1
            pending -= done
            if time.monotonic() >= next_poll:
                next_poll += 30
                risks = httpx.get(f"{url}/risks", timeout=30).json()
                hit = next((r for r in risks if r["subject"] == PEOPLE), None)
                el = (time.monotonic() - t0) / 60
                say(f"   {el:4.1f} min  runs={stats['runs']} faults={stats['faults']} "
                    f"{DETECTION}={stats['violations']}  forecast: "
                    + (f"{hit['likelihood']} ({hit['evidence']}, ETA {hit['eta_minutes']} min)" if hit else "none yet"))
                if hit and forecast is None:
                    forecast = hit
            time.sleep(0.2)
    check("traffic ran", stats["runs"] >= 20, f"{stats['runs']} runs, {stats['faults']} injected faults")
    check("prediction: error-rate forecast for people search", forecast is not None,
          (f"{forecast['likelihood']}: {forecast['evidence']}; related check {forecast['related_check']}"
           if forecast else "no forecast formed (needs >=3 windows with >=5 people searches)"))
    check(f"detection: {DETECTION} fires on the silent failure", stats["violations"] > 3,
          f"{stats['violations']} runs said 'ok' after the search failed")
    return forecast


def open_incident(scorer_url: str, wait_s: int) -> str:
    step("5. Intake: neatlogs detection -> incident")
    from antibody import intake, neatlogs_mcp
    from antibody.state import StateStore

    store = StateStore()
    end = time.monotonic() + wait_s
    while True:
        opened = intake.poll_once(store)
        mine = [i for i in opened if i.endswith(DETECTION)]
        if mine:
            src = (store.read(mine[0], "intake") or {}).get("source")
            check("incident opened", True, f"{mine[0]} (source: {src})")
            return mine[0]
        if time.monotonic() > end:
            break
        say(f"   {DIM}neatlogs hasn't counted enough {DETECTION} yet (ingest delay); retrying in 20 s{X}")
        time.sleep(20)
    say(f"   {Y}neatlogs didn't confirm within {wait_s} s; using detection's /runs (Antibody's own fallback){X}")
    neatlogs_mcp.configured = lambda: False
    opened = [i for i in intake.poll_once(store) if i.endswith(DETECTION)]
    require("incident opened", bool(opened), f"{opened[0]} (source: detection_runs)" if opened else "nothing opened")
    return opened[0]


def fix_incident(iid: str, bug_sha: str) -> dict:
    step("6. Antibody: diagnose, breed a family, prove a fix (LIVE)")
    from antibody.models import Attempt, Diagnosis, FamilyResult, Incident
    from antibody.pipeline import Pipeline
    from antibody.state import StateStore

    store = StateStore()
    t0 = time.monotonic()
    out = Pipeline(store, echo=lambda m: say(f"   {m}")).handle(store.read(iid, "incident", Incident))
    diag = store.read(iid, "diagnosis", Diagnosis)
    base = store.read(iid, "baseline", FamilyResult)
    attempts = [Attempt.model_validate(a) for a in store.read(iid, "attempts") or []]
    acc = next((a for a in attempts if a.accepted), None)
    say(f"   {DIM}why: {diag.explanation[:300]}{X}")
    check("diagnosis names the commit that caused it", diag.commit_sha == bug_sha,
          f"blamed {(diag.commit_sha or 'none')[:8]}, bug is {bug_sha[:8]}")
    check("diagnosis targets the right file", (diag.target_file or "").endswith("patient/agent.py"),
          f"{diag.fix_kind} on {diag.target_file}")
    check("baseline reproduces the failure", base is not None and base.must_fix_passed < base.must_fix_total,
          f"must_fix {base.must_fix_passed}/{base.must_fix_total}" if base else "no baseline")
    if acc:
        r = acc.result
        check("fix eval: every must_fix scenario now passes", r.must_fix_passed == r.must_fix_total,
              f"{acc.fix.id}: must_fix {base.must_fix_passed}/{base.must_fix_total} -> {r.must_fix_passed}/{r.must_fix_total}")
        check("fix eval: no healthy scenario broke", r.must_not_change_passed == r.must_not_change_total,
              f"must_not_change {base.must_not_change_passed}/{base.must_not_change_total} -> "
              f"{r.must_not_change_passed}/{r.must_not_change_total}")
        say(f"   {DIM}{acc.fix.diff[:600]}{X}")
    require("a fix was accepted and is awaiting approval", out.status == "awaiting_approval",
            f"status {out.status} after {len(attempts)} attempt(s), {time.monotonic() - t0:.0f} s")
    return {"fix": acc.fix.id, "attempts": len(attempts)}


def console_and_voice(iid: str, fix_id: str, api_url: str, scripted_approve: bool = True) -> None:
    step("7. Console API + voice on-call: the call, refusals, then 'approve fix N'")
    d = httpx.get(f"{api_url}/incidents/{iid}", timeout=30).json()
    ov = httpx.get(f"{api_url}/overview", timeout=30)
    check("console: incident detail has scenarios, attempts and diffs",
          bool(d.get("scenarios")) and bool(d.get("attempts")) and bool((d["attempts"][0].get("fix") or {}).get("diff")),
          f"{len(d.get('scenarios') or [])} scenarios, {len(d.get('attempts') or [])} attempt(s); /overview {ov.status_code}")
    bad = httpx.post(f"{api_url}/incidents/{iid}/approve", json={"fix_id": fix_id, "phrase": "yes", "channel": "typed"})
    check("API refuses 'yes' as an approval", bad.status_code == 400, f"HTTP {bad.status_code}")

    n = int(fix_id.split("_")[1])
    word = ["zero", "one", "two", "three"][n] if n < 4 else str(n)
    script = f'''
import asyncio, json, sys
from app.config import get_settings
from app.services.antibody import AntibodyClient
from app.bot.oncall import OnCallState, call_script, handle_command

async def main():
    s = get_settings(); c = AntibodyClient(s)
    inc = next(i for i in await c.awaiting() if i["id"] == {iid!r})
    out = {{"call": await call_script(c, inc)}}
    st = OnCallState(s); st.set_current(1, inc["id"])
    out["replies"] = [[said, await handle_command(c, st, 1, said, "voice")]
                      for said in {["yes do it", f"please approve fix {n}"] + ([f"Approve fix {word}."] if scripted_approve else [])!r}]
    print("E2E_JSON" + json.dumps(out))

asyncio.run(main())
'''
    env = {k: v for k, v in CLEAN_ENV.items() if k != "VIRTUAL_ENV"}
    env.update({"ANTIBODY_URL": api_url, "STATE_DIR": str(LAB_ROOT / "voice-script"), "PYTHONIOENCODING": "utf-8"})
    r = subprocess.run(["uv", "run", "--quiet", "python", "-c", script], cwd=MAIN / "voice", env=env,
                       capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300)
    line = next((l for l in r.stdout.splitlines() if l.startswith("E2E_JSON")), None)
    require("voice agent ran against the incident", line is not None, (r.stderr or r.stdout)[-400:] if not line else "")
    out = json.loads(line[len("E2E_JSON"):])
    say(f"   {B}bot calls:{X} {out['call'][:400]}")
    for said, reply in out["replies"]:
        say(f"   {B}engineer:{X} \"{said}\"  ->  {reply or DIM + '(not a decision: goes to the chat model, nothing merged)' + X}")
    check("voice: the call reads the brief and the exact phrase", f"approve fix {n}" in out["call"])
    check("voice: 'yes do it' / 'please approve...' don't approve", out["replies"][0][1] is None and out["replies"][1][1] is None)
    if scripted_approve:
        approved = out["replies"][2][1]
        check("voice: 'Approve fix N.' approves and merges", bool(approved) and "and merged" in approved, approved or "")


def telegram_approval(iid: str, fix_id: str, api_url: str, timeout: int) -> None:
    step("7b. Telegram: the bot calls YOU; you approve")
    n = fix_id.split("_")[1]
    vdir = LAB_ROOT / "voice"
    vdir.mkdir(parents=True, exist_ok=True)
    saved = MAIN / "voice" / ".state" / "oncall.json"
    chat = None
    try:
        chat = json.loads(saved.read_text(encoding="utf-8")).get("chat_id")
    except (OSError, ValueError):
        pass
    # Same chat as your real bot, but a clean slate: nothing announced yet, so it calls about this incident.
    (vdir / "oncall.json").write_text(json.dumps({"chat_id": chat, "announced": [], "current": {}}), encoding="utf-8")
    port = free_port()
    env = {k: v for k, v in CLEAN_ENV.items() if k != "VIRTUAL_ENV"}
    env.update({"ANTIBODY_URL": api_url, "STATE_DIR": str(vdir), "HOST": "127.0.0.1", "PORT": str(port),
                "ONCALL_POLL_SECONDS": "5", "PYTHONIOENCODING": "utf-8", "PYTHONUNBUFFERED": "1"})
    log = LAB_ROOT / "voice-bot.log"
    bot = start(["uv", "run", "--quiet", "python", "main.py"], MAIN / "voice", env, log)
    wait_healthy(f"http://127.0.0.1:{port}", bot, log)
    say(f"   {B}Open Telegram (@anti_body_bot).{X} The bot is calling you about {iid}.")
    if chat is None:
        say(f"   {Y}No on-call chat saved yet: send /oncall to the bot first.{X}")
    say(f"   Ask it anything about the incident, then say or type exactly: {B}approve fix {n}{X}")
    say(f"   {DIM}(try 'yes' first if you like: it must not merge. 'reject fix {n}' turns it down.){X}")
    end = time.monotonic() + timeout
    called = False
    inc = {}
    while time.monotonic() < end:
        if not called:
            try:
                st = json.loads((vdir / "oncall.json").read_text(encoding="utf-8"))
                if iid in st.get("announced", []):
                    called = True
                    say(f"   {G}the bot called you (voice note + text){X}")
            except (OSError, ValueError):
                pass
        inc = httpx.get(f"{api_url}/incidents/{iid}", timeout=30).json()
        status = (inc.get("incident") or {}).get("status")
        if status in ("resolved", "escalated"):
            break
        if bot.poll() is not None:
            raise Abort(f"voice bot exited: {log.read_text(encoding='utf-8', errors='replace')[-600:]}")
        time.sleep(3)
    status = (inc.get("incident") or {}).get("status")
    res = inc.get("resolution") or {}
    ap = res.get("approval") or {}
    check("Telegram: the bot called you", called)
    if status == "escalated":
        require("Telegram: you approved the fix", False, f"you rejected it: {(res.get('rejection') or {}).get('reason')}")
    require("Telegram: you approved the fix", status == "resolved",
            f"'{ap.get('phrase')}' via {ap.get('channel')} at {ap.get('at')}" if status == "resolved"
            else f"no decision within {timeout // 60} min")
    check("your approval merged the fix", bool(res.get("merged")))


def verify_merge(bug_sha: str) -> None:
    step("8. Merge landed on the deploy branch")
    agent = (LAB / "detection" / "detection" / "patient" / "agent.py").read_text(encoding="utf-8")
    log = git("log", "--oneline", "-3", cwd=LAB)
    say(f"   {DIM}{log}{X}")
    check("fix merged into the deploy branch", git("rev-parse", "HEAD", cwd=LAB) != bug_sha and "Merge Antibody" in log)
    check("buggy line gone from the deployed code", 'people_status = [], "ok"' not in agent)


def production_after_fix(url: str, n: int = 8) -> None:
    step("9. Redeployed patient under the same outage (every people search fails)")
    doms = domains()[:n]
    with ThreadPoolExecutor(8) as ex:
        rows = list(ex.map(lambda d: (d, *run_once(url, d, [fault()])), doms))
    bad = [d for d, _, s in rows if DETECTION in s["violations"]]
    said = [((r.get("output") or {}).get("summary") or "")[:110] for _, r, _ in rows[:2]]
    for s in said:
        say(f"   {DIM}{s}{X}")
    check(f"{DETECTION} no longer fires", not bad, f"{len(rows) - len(bad)}/{len(rows)} runs honest" + (f"; failing {bad}" if bad else ""))


def aftercare_wait(api_url: str, backtest: bool, timeout: int = 1800) -> None:
    step("10. Aftercare: gate the merged branch with every family" + (", then the backtest" if backtest else ""))
    say(f"   {DIM}the gate replays every saved family on the merged branch (~3-5 min)"
        + ("; the backtest then replays each causing commit and its parent (~10 more min)" if backtest
           else "; the backtest keeps running in Antibody, not waited for (add --backtest){X}"))
    t0 = time.monotonic()
    end = t0 + timeout
    st, last = {}, None
    while time.monotonic() < end:
        st = httpx.get(f"{api_url}/aftercare", timeout=30).json()
        wts = sorted(p.name for p in (LAB_ROOT / "ab" / "worktrees").glob("gate-*")) if (LAB_ROOT / "ab" / "worktrees").exists() else []
        now = (st.get("state"), st.get("gate_verdict"), wts[-1] if wts else None)
        if now != last:  # print only when something moves
            last = now
            what = f"checking {wts[-1].split('-', 1)[1][:70]}" if wts else ""
            verdict = f" (gate: {st['gate_verdict'].upper()})" if st.get("gate_verdict") else ""
            say(f"   {(time.monotonic() - t0) / 60:4.1f} min  {st.get('state')}{verdict}  {DIM}{what}{X}")
        if st.get("state") in ("done", "failed") or (not backtest and st.get("state") == "backtesting"):
            break
        time.sleep(10)
    if st.get("state") == "failed":
        check("aftercare finished", False, json.dumps(st)[:300])
    gate = httpx.get(f"{api_url}/gate/latest", timeout=30).json()
    check("gate on the merged branch is SAFE", gate.get("verdict") == "safe",
          "; ".join(f.get("message", "") for f in gate.get("families", [])) or gate.get("note") or "")
    if not backtest:
        return
    check("aftercare finished", st.get("state") == "done", json.dumps(st)[:300])
    trust = httpx.get(f"{api_url}/trust", timeout=30).json()
    check("backtest has numbers", trust.get("status") == "measured",
          f"blocked {trust.get('would_have_blocked')}/{len(trust.get('seeded_bugs') or [])} seeded bugs; "
          f"false alarms {trust.get('false_alarms')}/{trust.get('false_alarm_checks')}")


# ---------- cleanup ----------
def _force_remove(func, path, _exc) -> None:
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except OSError:
        pass


def cleanup(iid: str | None) -> None:
    for p in PROCS:
        kill(p)
    lab_prefix = str(LAB_ROOT.resolve()).replace("\\", "/").lower()
    paths = [l[len("worktree "):] for l in git("worktree", "list", "--porcelain", check_=False).splitlines()
             if l.startswith("worktree ")]
    for p in sorted(paths, key=len, reverse=True):
        if p.replace("\\", "/").lower().startswith(lab_prefix):
            git("worktree", "remove", "--force", p, check_=False)
    shutil.rmtree(LAB_ROOT, onexc=_force_remove)
    git("worktree", "prune", check_=False)
    branches = [BRANCH] + (git("branch", "--list", f"antibody/{iid}/*", "--format=%(refname:short)",
                                check_=False).splitlines() if iid else [])
    for b in filter(None, branches):
        git("branch", "-D", b, check_=False)
    say(f"   {DIM}removed {LAB_ROOT} and local branches {', '.join(filter(None, branches))}{X}")


# ---------- live drill (mission control's "Run a live incident") ----------
DRILL_STATUS = ANTIBODY_DIR / ".state" / "drill" / "status.json"
DRILL_FAULTY = ["stripe.com", "figma.com", "supabase.com", "airtable.com", "mercury.com"]
DRILL_HEALTHY = ["cal.com", "resend.com"]


def drill_status(state: str, message: str, **extra) -> None:
    DRILL_STATUS.parent.mkdir(parents=True, exist_ok=True)
    try:
        cur = json.loads(DRILL_STATUS.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        cur = {}
    cur.update(extra, state=state, message=message, pid=os.getpid(), updated_at=datetime.now().astimezone().isoformat())
    cur.setdefault("started_at", cur["updated_at"])
    DRILL_STATUS.write_text(json.dumps(cur, indent=2), encoding="utf-8")
    say(f"   [drill] {state}: {message}", C)


def drill_main(a) -> int:
    """One real incident, live, for mission control: a real bug in a sandbox, real traffic with an injected
    outage, real detection, diagnosis, family, fix and proof. Approval is left to a human."""
    DRILL_STATUS.parent.mkdir(parents=True, exist_ok=True)
    try:  # keep only the launcher's process group (the API stops the drill through it)
        pgid = json.loads(DRILL_STATUS.read_text(encoding="utf-8")).get("pgid")
    except (OSError, ValueError):
        pgid = None
    DRILL_STATUS.write_text(json.dumps({"pgid": pgid} if pgid else {}), encoding="utf-8")
    # A replaced or stopped drill can't clean up after itself: remove earlier drill sandboxes first.
    for line in git("worktree", "list", "--porcelain", check_=False).splitlines():
        if line.startswith("worktree ") and "/.e2e/" in line.replace("\\", "/") and STAMP not in line:
            git("worktree", "remove", "--force", line[len("worktree "):], check_=False)
    git("worktree", "prune", check_=False)
    for b in git("branch", "--list", "e2e/*", "antibody/inc_*", "--format=%(refname:short)", check_=False).splitlines():
        if b.startswith("e2e/") or not (MAIN / "antibody" / "fixtures" / "immunity" / f"{b.split('/')[1]}.json").exists():
            git("branch", "-D", b, check_=False)
    for old in (MAIN / ".e2e").glob("*"):
        if old.name != STAMP:
            shutil.rmtree(old, onexc=_force_remove)
    det_port, api_port = a.drill_detection_port, a.drill_api_port
    det_url, api_url = f"http://127.0.0.1:{det_port}", f"http://127.0.0.1:{api_port}"
    iid = None
    try:
        drill_status("starting", "Planting a real bug in a sandbox copy of the agent", stamp=STAMP,
                     detection_port=det_port, api_port=api_port)
        bug_sha = make_lab()
        from dotenv import dotenv_values

        root_env = dotenv_values(MAIN / ".env")
        os.environ.update({
            "ANTIBODY_REPO_ROOT": str(LAB), "ANTIBODY_STATE_DIR": str(LAB_ROOT / "ab"),
            "PATIENT_URL": det_url, "SCORER_URL": det_url, "USE_STUBS": "false",
            "SHIP_TARGET": "local", "DEPLOY_BRANCH": BRANCH, "AFTERCARE_AUTO": "false",
            "FAMILY_SIZE": str(a.family_size), "LLM_MAX_RETRIES": "12",
            "UV_CACHE_DIR": str(MAIN / "detection" / ".uv-cache"), "PYTHONIOENCODING": "utf-8",
        })
        # A drill may get its own Groq key (DRILL_GROQ_API_KEY) so it doesn't share a budget with production.
        # Never borrow the voice bot's key: a drill can burn its daily quota and silence the on-call call.
        if root_env.get("LLM_PROVIDER", "").lower() == "groq" and root_env.get("DRILL_GROQ_API_KEY"):
            os.environ["GROQ_API_KEY"] = root_env["DRILL_GROQ_API_KEY"]
        from antibody import tracing

        tracing.init()
        drill_status("deploying", "Deploying the buggy agent and a fresh Antibody", bug_commit=bug_sha)
        det, det_url = start_patient(det_port, "buggy")
        api = start(["uv", "run", "--quiet", "python", "-c", launch("antibody.cli", ["serve", "--port", str(api_port)])],
                    ANTIBODY_DIR, dict(os.environ), LAB_ROOT / "antibody-api.log")
        wait_healthy(api_url, api, LAB_ROOT / "antibody-api.log")

        drill_status("traffic", "Production traffic: people search starts failing (injected outage)")
        jobs = [(d, None) for d in DRILL_HEALTHY[:1]] + [(d, fault(c)) for d, c in
                zip(DRILL_FAULTY, ["HTTP_429", "HTTP_500", "TIMEOUT", "HTTP_429", "HTTP_500"])] + [(d, None) for d in DRILL_HEALTHY[1:]]
        fails = 0
        with ThreadPoolExecutor(2) as ex:
            for run, score in ex.map(lambda j: run_once(det_url, j[0], [j[1]] if j[1] else None), jobs):
                fails += "tw_empty_after_error" in score["violations"]
                drill_status("traffic", f"{fails} silent failures so far ({run['input']['domain']})", silent_failures=fails)

        drill_status("detecting", "Waiting for the detection to fire and open an incident")
        iid = open_incident(det_url, a.neatlogs_wait)
        drill_status("fixing", "Diagnosing, breeding a family and proving a fix", incident_id=iid)
        fix_incident(iid, bug_sha)

        drill_status("awaiting_approval", "Fix proven. Waiting for a human to approve it", incident_id=iid)
        end = time.monotonic() + a.approve_timeout
        inc = {}
        while time.monotonic() < end:
            inc = httpx.get(f"{api_url}/incidents/{iid}", timeout=30).json()
            if (inc.get("incident") or {}).get("status") in ("resolved", "escalated"):
                break
            time.sleep(3)
        status = (inc.get("incident") or {}).get("status")
        if status == "resolved":
            drill_status("verifying", "Approved and merged. Redeploying the fixed agent under the same outage")
            kill(det)
            det, det_url = start_patient(det_port, "fixed")
            production_after_fix(det_url, 3)
            drill_status("done", "Fixed in production: the outage no longer fools the agent", incident_id=iid,
                         expires_in_s=a.drill_linger)
        elif status == "escalated":
            drill_status("done", "Rejected by the engineer: nothing merged", incident_id=iid, expires_in_s=a.drill_linger)
        else:
            drill_status("expired", "No approval arrived in time: nothing merged", incident_id=iid, expires_in_s=a.drill_linger)
        time.sleep(a.drill_linger)  # keep the result on screen for a while
        return 0
    except Exception as e:  # Abort included: report it on screen, then clean up
        drill_status("failed", str(e)[:300], incident_id=iid)
        time.sleep(min(120, a.drill_linger))
        return 1
    finally:
        try:
            from antibody import tracing

            tracing.shutdown()
        except Exception:
            pass
        cleanup(iid)
        drill_status_final = json.loads(DRILL_STATUS.read_text(encoding="utf-8")) if DRILL_STATUS.exists() else {}
        if drill_status_final.get("state") not in ("done", "failed", "expired"):
            drill_status("failed", "stopped", incident_id=iid)
        else:
            drill_status(drill_status_final["state"], drill_status_final.get("message", ""), ended=True)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--full", action="store_true", help="also unit tests, the pre-deploy gate and aftercare (+~15 min)")
    ap.add_argument("--minutes", type=float, default=3.0, help="traffic duration (default 3)")
    ap.add_argument("--workers", type=int, default=8, help="concurrent patient runs (default 8)")
    ap.add_argument("--neatlogs-wait", type=int, default=120, help="seconds to wait for neatlogs to count the failures")
    ap.add_argument("--keep", action="store_true", help="keep the throwaway checkout and branches")
    ap.add_argument("--telegram", action="store_true", help="the bot calls you on Telegram and you approve (stop your running bot first)")
    ap.add_argument("--approve-timeout", type=int, default=900, help="seconds to wait for your Telegram decision")
    ap.add_argument("--backtest", action="store_true", help="with --full: also wait for the post-merge backtest (+~10 min)")
    ap.add_argument("--drill", action="store_true", help="one live incident for mission control (fixed ports, waits for a human)")
    ap.add_argument("--drill-detection-port", type=int, default=5150)
    ap.add_argument("--drill-api-port", type=int, default=4100)
    ap.add_argument("--family-size", type=int, default=6)
    ap.add_argument("--drill-linger", type=int, default=900, help="seconds to keep the finished drill on screen")
    a = ap.parse_args()
    if a.drill:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        return drill_main(a)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if os.name == "nt":
        os.system("")  # turn on ANSI colours in the Windows console

    say(f"{B}ANTIBODY end-to-end test{X}  {DIM}(throwaway checkout {LAB_ROOT}, branch {BRANCH}; main and GitHub untouched){X}")
    if a.telegram:
        try:
            httpx.get("http://127.0.0.1:8000/health", timeout=2)
            say(f"{R}Your voice bot is running on :8000. Telegram lets only one copy of a bot read messages, so stop it "
                f"first (Ctrl+C in its window), run this again, then start it back with: cd voice; uv run python main.py{X}")
            return 1
        except httpx.HTTPError:
            pass
    t0 = time.monotonic()
    if a.full:
        unit_tests()
    try:
        bug_sha = make_lab()
    except Abort as e:
        say(f"   {R}stopped: {e}{X}")
        return 1

    det_port, api_port = free_port(), free_port()
    det_url = f"http://127.0.0.1:{det_port}"
    # Antibody runs in this process against the throwaway checkout. Must be set before antibody is imported.
    os.environ.update({
        "ANTIBODY_REPO_ROOT": str(LAB), "ANTIBODY_STATE_DIR": str(LAB_ROOT / "ab"),
        "PATIENT_URL": det_url, "SCORER_URL": det_url, "USE_STUBS": "false",
        "SHIP_TARGET": "local", "DEPLOY_BRANCH": BRANCH, "AFTERCARE_AUTO": "true" if a.full else "false",
        "UV_CACHE_DIR": str(MAIN / "detection" / ".uv-cache"), "PYTHONIOENCODING": "utf-8",
    })
    from antibody import llm, tracing

    tracing.init()
    iid = None
    ok = False
    try:
        say(f"\n   {DIM}deploying the buggy patient on :{det_port} (first start builds its environment)...{X}")
        det, det_url = start_patient(det_port, "buggy")
        if a.full:  # after the patient is up: otherwise Antibody falls back to its stub and the verdict means nothing
            predeploy_gate(bug_sha)
        patient_healthy(det_url)
        traffic_and_forecast(det_url, a.minutes, a.workers)
        iid = open_incident(det_url, a.neatlogs_wait)
        fx = fix_incident(iid, bug_sha)

        api_log = LAB_ROOT / "antibody-api.log"
        api = start(["uv", "run", "--quiet", "python", "-c", launch("antibody.cli", ["serve", "--port", str(api_port)])],
                    ANTIBODY_DIR, dict(os.environ), api_log)
        api_url = f"http://127.0.0.1:{api_port}"
        wait_healthy(api_url, api, api_log)
        console_and_voice(iid, fx["fix"], api_url, scripted_approve=not a.telegram)
        if a.telegram:
            telegram_approval(iid, fx["fix"], api_url, a.approve_timeout)
        verify_merge(bug_sha)

        kill(det)
        say(f"\n   {DIM}redeploying the patient from the merged branch...{X}")
        det, det_url = start_patient(det_port, "fixed")
        production_after_fix(det_url)
        if a.full:
            aftercare_wait(api_url, a.backtest)
        ok = True
    except Abort as e:
        say(f"\n   {R}stopped: {e}{X}")
    except KeyboardInterrupt:
        say(f"\n   {Y}interrupted{X}")
    finally:
        tracing.shutdown()
        step("Summary")
        passed = sum(r[1] is True for r in RESULTS)
        failed = [r for r in RESULTS if r[1] is False]
        for name, res, detail in failed:
            say(f"   {R}FAIL{X} {name}  {DIM}{detail}{X}")
        lab_cost = 0.0
        try:
            rows = json.loads("[" + ",".join((LAB_ROOT / "det" / "runs.jsonl").read_text(encoding="utf-8").splitlines()) + "]")
            lab_cost = sum(r["run"].get("total_cost_usd") or 0 for r in rows)
        except Exception:
            pass
        say(f"   {passed}/{len(RESULTS)} checks passed in {(time.monotonic() - t0) / 60:.1f} min; "
            f"LLM cost ~${lab_cost + llm.ledger.usd:.3f} (patient ${lab_cost:.3f} + Antibody ${llm.ledger.usd:.3f})")
        say(f"   {DIM}LIVE: DeepSeek calls, neatlogs, Jev. RECORDED: Crustdata responses. SIMULATED: tool outages. "
            f"SEEDED: the bug.{X}")
        if a.keep or failed or not ok:
            for p in PROCS:
                kill(p)
            say(f"   {Y}kept {LAB_ROOT} for inspection (logs: patient-*.log, antibody-api.log). Remove with:{X}\n"
                f"   git worktree remove --force {LAB} ; git branch -D {BRANCH}")
        else:
            cleanup(iid)
    return 0 if ok and not any(r[1] is False for r in RESULTS) else 1


if __name__ == "__main__":
    sys.exit(main())
