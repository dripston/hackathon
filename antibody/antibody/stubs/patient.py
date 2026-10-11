"""Stub patient: a deterministic fake of detection's POST /run (replay mode).

Its behaviour depends on the prompt text, so prompt fixes visibly change outcomes:
- a prompt demanding "at least 3 decision makers" with no "fewer" escape hatch makes it invent people;
- a prompt without "confirm the company" skips the identify step;
- bug_flags.swallow_tool_errors turns people-search errors into an empty list.
"""

import re
import uuid

from ..models import AgentRun, Fault, Step, ToolError
from ..state import now_iso
from .data import COMPANIES, INVENTED_NAMES
from .prompts import load as load_prompt


def _faults_for(faults: list[Fault]):
    calls: dict[str, int] = {}

    def check(tool: str) -> ToolError | None:
        calls[tool] = calls.get(tool, 0) + 1
        for f in faults:
            if f.tool == tool and f.at_call == calls[tool]:
                return f.error
        return None

    return check


def run(
    domain: str,
    prompt_version: str = "v1",
    prompt_override: str | None = None,
    faults: list[Fault] | None = None,
    simulated: bool = True,
    bug_flags: dict[str, bool] | None = None,
    cassette_set: str = "base",
) -> AgentRun:
    prompt = (prompt_override or load_prompt(prompt_version)).lower()
    flags = dict(bug_flags or {})
    fault = _faults_for(faults or [])
    started = now_iso()
    steps: list[Step] = []
    rec = COMPANIES.get(domain)

    def add(kind, name, args=None, result=None, error=None, synthetic=False):
        steps.append(Step(index=len(steps), kind=kind, name=name, args=args, result=result,
                          error=error, latency_ms=50.0, cost_usd=0.0 if kind == "tool" else 0.0005,
                          synthetic=synthetic))
        return steps[-1]

    brief: dict = {"domain": domain, "company_name": None, "company_match_confirmed": False,
                   "headcount": None, "hiring_signals": [], "decision_makers": [],
                   "summary": "", "no_decision_makers_reason": None}
    errors: list[str] = []

    # 1. identify
    err = fault("crustdata.company_enrich")
    if err:
        add("tool", "crustdata.company_enrich", {"domain": domain}, None, err)
        errors.append("company")
    elif rec is None:
        add("tool", "crustdata.company_enrich", {"domain": domain}, {}, None, synthetic=True)
    else:
        add("tool", "crustdata.company_enrich", {"domain": domain},
            {"company_name": rec["company_name"], "headcount": rec["headcount"], "domain": rec.get("lookalike_of", domain)})

    company_ok = bool(rec) and "company" not in errors
    # Any instruction to confirm/verify the company or the enrichment result counts (a real model would follow it).
    if company_ok and re.search(r"\b(confirm|verify|check)\w*\b.{0,60}\b(company|enrichment)", prompt):
        match = "lookalike_of" not in rec
        add("llm", "llm.confirm_company", {"domain": domain}, {"match": match})
        brief["company_match_confirmed"] = match
        company_ok = match
        if not match:
            brief["no_decision_makers_reason"] = (
                f"Enrichment returned {rec['company_name']}, which does not match {domain}; brief withheld."
            )
    if company_ok:
        brief["company_name"] = rec["company_name"]
        brief["headcount"] = rec["headcount"]

    # 2. people
    people_idx = None
    people: list[tuple[str, str]] = []
    if company_ok:
        err = fault("crustdata.people_search")
        if err and flags.get("swallow_tool_errors"):
            # The provider still records the error on the step; the agent just carries on with [].
            people_idx = add("tool", "crustdata.people_search", {"company": rec["company_name"]}, [], err).index
        elif err:
            add("tool", "crustdata.people_search", {"company": rec["company_name"]}, None, err)
            errors.append("people")
        else:
            res = [{"name": n, "title": t} for n, t in rec["people"]]
            people_idx = add("tool", "crustdata.people_search", {"company": rec["company_name"]}, res).index
            people = list(rec["people"])

        # 3. hiring
        err = fault("crustdata.jobs")
        if err:
            add("tool", "crustdata.jobs", {"company": rec["company_name"]}, None, err)
            errors.append("jobs")
        else:
            add("tool", "crustdata.jobs", {"company": rec["company_name"]}, [{"title": j} for j in rec["jobs"]])
            brief["hiring_signals"] = [f"Hiring: {j}" for j in rec["jobs"][:4]]

    # 4. brief
    contacts = [{"name": n, "title": t, "linkedin_url": None, "source_step_index": people_idx} for n, t in people]
    pressured = "at least 3 decision makers" in prompt and "fewer" not in prompt
    if company_ok and pressured and len(contacts) < 3:
        for n, t in INVENTED_NAMES[: 3 - len(contacts)]:
            contacts.append({"name": n, "title": t, "linkedin_url": None, "source_step_index": people_idx})
    brief["decision_makers"] = contacts
    if company_ok and not contacts:
        brief["no_decision_makers_reason"] = (
            "People data unavailable: the people search failed." if "people" in errors
            else "No decision makers found."
        )
    name = brief["company_name"] or domain
    if errors:
        brief["summary"] = f"Partial brief for {name}: {', '.join(errors)} data unavailable."
    else:
        brief["summary"] = f"Research completed for {name}."
    add("llm", "llm.write_brief", {"prompt_chars": len(prompt)}, {"ok": True})

    return AgentRun(
        run_id=f"run_stub_{uuid.uuid4().hex[:10]}", trace_id=None, input={"domain": domain},
        prompt_version="override" if prompt_override else prompt_version, bug_flags=flags,
        steps=steps, output=brief, total_cost_usd=round(sum(s.cost_usd or 0 for s in steps), 6),
        simulated=simulated, started_at=started, ended_at=now_iso(),
    )
