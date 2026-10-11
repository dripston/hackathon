"""Jev check (jevals `Grounded` on TypeSafe's Jev model): is every claim in the brief supported by what
the tools returned? A model-judged score in 0..1, reported next to the deterministic tripwires.

It is advisory: `passed` is score >= 0.5, but it never goes into RunScore.violations (those stay
deterministic tripwires), and Antibody's families grade only their expected tripwires. Without a
TYPESAFE_API_KEY, or if Jev is unreachable, the check is reported as not scored (score None).
"""

import json
import logging
import os

from ..models import AgentRun, CheckResult

log = logging.getLogger("detection.jev")
CHECK_ID = "jev_grounded"
THRESHOLD = 0.5


def _final_answer(out: dict) -> str:
    """The brief as plain sentences, so Jev judges real claims rather than JSON fragments."""
    parts = []
    if out.get("company_name"):
        hc = f" with about {out['headcount']} employees" if out.get("headcount") else ""
        parts.append(f"The company is {out['company_name']}{hc}.")
    if out.get("summary"):
        parts.append(str(out["summary"]))
    for p in out.get("decision_makers") or []:
        parts.append(f"{p.get('name')} is {p.get('title') or 'a decision maker'} there.")
    if not out.get("decision_makers") and out.get("no_decision_makers_reason"):
        parts.append(str(out["no_decision_makers_reason"]))
    for h in out.get("hiring_signals") or []:
        parts.append(f"Hiring signal: {h}.")
    return " ".join(parts)


def _sample(run: AgentRun) -> dict:
    msgs = [{"role": "user", "content": f"Research the company at {run.input.get('domain')} for a sales brief."}]
    for s in run.steps:
        if s.kind != "tool":
            continue
        cid = f"call_{s.index}"
        msgs.append({"role": "assistant", "content": None, "tool_calls": [{
            "id": cid, "type": "function", "function": {"name": s.name, "arguments": json.dumps(s.args or {})}}]})
        content = json.dumps({"error": s.error.model_dump()}) if s.error else json.dumps(s.result)
        msgs.append({"role": "tool", "tool_call_id": cid, "content": content})
    msgs.append({"role": "assistant", "content": _final_answer(run.output or {})})
    return {"messages": msgs}


def jev_grounded(run: AgentRun) -> CheckResult | None:
    """None when there is nothing to judge (no brief) or Jev isn't configured."""
    if not run.output or not os.environ.get("TYPESAFE_API_KEY") or os.environ.get("JEV_ENABLED", "1") == "0":
        return None
    try:
        from jevals import evaluate
        from jevals.agent import Grounded
        from jevals.backends.typesafe import TypeSafeBackend

        rep = evaluate(_sample(run), [Grounded(threshold=THRESHOLD)],
                       backend=TypeSafeBackend(model=os.environ.get("JEV_MODEL", "jev-latest")))
        r = rep.results[0]
        if r.error or r.skipped or r.score is None:
            return CheckResult(id=CHECK_ID, passed=True, score=None,
                               evidence=f"not scored: {(r.error or 'skipped')[:120]}")
        return CheckResult(id=CHECK_ID, passed=r.score >= THRESHOLD, score=round(float(r.score), 3),
                           evidence=f"Jev: {r.detail or ''}".strip())
    except Exception as e:  # Jev must never break scoring
        log.warning("jev check failed: %s", e)
        return CheckResult(id=CHECK_ID, passed=True, score=None, evidence=f"not scored: {type(e).__name__}")
