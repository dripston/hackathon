"""The patient: a company research agent. Give it a domain; it finds the company, its leaders and its
hiring on Crustdata, and an LLM writes a short brief. Every step is recorded on the AgentRun.

The prompt file has sections. `## Identify` (optional) makes the agent confirm the company before
using it; `## Brief` instructs the brief writer. Prompt versions live in prompts/<version>.md.
"""

import json
import re
import uuid
from datetime import UTC, datetime

from pydantic import ValidationError

from .. import llm
from ..config import PROMPTS_DIR, get_settings
from ..models import AgentRun, Fault, ResearchBrief, Step, ToolError
from .tools.crustdata import LIVE
from .tools.provider import Provider, ToolCallError


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def load_prompt(version: str) -> str:
    path = PROMPTS_DIR / f"{version}.md"
    if not path.exists():
        raise FileNotFoundError(f"no prompt version {version!r} in {PROMPTS_DIR}")
    return path.read_text(encoding="utf-8")


def sections(prompt: str) -> dict[str, str]:
    """'## Name' sections of a prompt file, keyed by lower-case name."""
    parts = re.split(r"^##\s+(.+?)\s*$", prompt, flags=re.M)
    return {parts[i].strip().lower(): parts[i + 1].strip() for i in range(1, len(parts) - 1, 2)}


class Run:
    def __init__(self):
        self.steps: list[Step] = []

    def add(self, kind, name, args=None, result=None, error=None, latency_ms=None, cost_usd=None, synthetic=False):
        step = Step(index=len(self.steps), kind=kind, name=name, args=args, result=result, error=error,
                    latency_ms=round(latency_ms, 1) if latency_ms is not None else None,
                    cost_usd=round(cost_usd, 8) if cost_usd is not None else None, synthetic=synthetic)
        self.steps.append(step)
        return step

    def tool(self, provider: Provider, name: str, args: dict):
        """Call a tool through the provider and record the step. Returns (result, step)."""
        try:
            result, synthetic, latency = provider.call(name, args, LIVE[name])
            return result, self.add("tool", name, args, result, None, latency, 0.0, synthetic)
        except ToolCallError as e:
            return None, self.add("tool", name, args, None, e.error, None, 0.0)

    def llm(self, name: str, system: str, user: str, max_tokens: int = 1200):
        try:
            r = llm.complete(system, user, max_tokens)
        except Exception as e:
            self.add("llm", name, {"input_chars": len(user)}, None,
                     ToolError(code="LLM_ERROR", message=str(e)[:200]))
            return None
        self.add("llm", name, {"input_chars": len(user)}, {"text": r.text[:2000]}, None, r.latency_ms, r.cost_usd)
        return r.text


def run_research(
    domain: str,
    prompt_version: str | None = None,
    prompt_override: str | None = None,
    provider: Provider | None = None,
    simulated: bool = False,
    bug_flags: dict[str, bool] | None = None,
) -> AgentRun:
    s = get_settings()
    version = prompt_version or s.patient_prompt_version
    prompt = prompt_override or load_prompt(version)
    sec = sections(prompt)
    provider = provider or Provider(s.crustdata_mode, s.default_cassette_set)
    flags = {"swallow_tool_errors": s.bug_swallow_tool_errors, **(bug_flags or {})}
    started = now_iso()
    run = Run()

    # 1. Identify
    company, enrich_step = run.tool(provider, "crustdata.company_enrich", {"domain": domain})
    confirmed = None
    if company and "identify" in sec:
        text = run.llm("llm.identify", sec["identify"], json.dumps({"domain": domain, "enrichment": company}), 400)
        try:
            confirmed = bool(llm.parse_json(text or "").get("match"))
        except Exception:
            confirmed = False
    usable = bool(company) and confirmed is not False

    # 2. People
    people, people_status, people_step = [], "not searched", None
    if usable:
        people, people_step = run.tool(provider, "crustdata.people_search", {"company": company.get("name"), "limit": 10})
        if people_step.error and flags["swallow_tool_errors"]:
            # still resilient: no crash, empty list, but never claim the search succeeded
            people, people_status = [], f"unavailable ({people_step.error.code})"
        elif people_step.error:
            people, people_status = [], f"unavailable ({people_step.error.code})"
        else:
            people, people_status = people or [], "ok"

    # 3. Hiring
    jobs, jobs_status = [], "not searched"
    if usable and company.get("company_id") is not None:
        jobs, jobs_step = run.tool(provider, "crustdata.jobs", {"company_id": company["company_id"], "limit": 10})
        jobs, jobs_status = ([], f"unavailable ({jobs_step.error.code})") if jobs_step.error else (jobs or [], "ok")

    # 4. Brief
    facts = {
        "domain": domain,
        "company": company if usable else None,
        "company_status": ("ok" if usable else "lookup failed" if not company
                           else "found a record, but it does not match this domain"),
        "company_confirmed_by_identify_step": confirmed,
        "people_search": {"source_step_index": people_step.index if people_step else None,
                          "status": people_status, "results": people},
        "job_postings": {"status": jobs_status, "results": jobs},
    }
    system = sec.get("brief", prompt)
    output, last_err = None, None
    for attempt in range(2):  # invalid JSON: retry once, then fail loudly
        user = json.dumps(facts) if attempt == 0 else json.dumps(facts) + f"\n\nYour previous reply was invalid: {last_err}. Reply with valid JSON only."
        text = run.llm("llm.brief", system, user, 1500)
        if text is None:
            break
        try:
            data = llm.parse_json(text)
            data["domain"] = domain
            brief = ResearchBrief.model_validate(data)
            output = brief.model_dump()
            break
        except (ValueError, ValidationError, json.JSONDecodeError) as e:
            last_err = str(e)[:200]
    if output is not None and confirmed is not None:
        output["company_match_confirmed"] = bool(confirmed and usable)

    return AgentRun(
        run_id=f"run_{uuid.uuid4().hex[:12]}", trace_id=None, input={"domain": domain},
        prompt_version="override" if prompt_override else version,
        bug_flags={k: v for k, v in flags.items() if v}, steps=run.steps, output=output,
        total_cost_usd=round(sum(st.cost_usd or 0 for st in run.steps), 8), simulated=simulated,
        started_at=started, ended_at=now_iso(),
    )


def faults_from(raw: list[dict] | None) -> list[Fault]:
    return [Fault.model_validate(f) for f in raw or []]
