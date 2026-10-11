"""Fix candidates: the smallest change that removes the failure while keeping the original intent.

The strong model returns the full revised file; we compute the unified diff ourselves (more reliable
than asking a model to produce a well-formed patch). Without an LLM, a deterministic rule-based fix
is used for the three seeded bug shapes, and the candidate is labelled mock.
"""

import difflib
import json
import logging
import re

from . import llm
from .models import Diagnosis, FamilyResult, FixCandidate, Scenario

log = logging.getLogger("antibody.fix")

FIX_SYSTEM = (
    "You fix silent failures in an AI agent. You get: a diagnosis, the file to change, the failing "
    "scenarios with the checks they failed, and the original reasoning for the change that caused it. "
    "Make the SMALLEST change that removes the failure while respecting the original intent. Example: "
    "if sales wanted at least 3 contacts, keep 'aim for 3 contacts' but add 'never name anyone not in "
    "tool results; list fewer and say why'. Don't rewrite unrelated parts. "
    "Reply with JSON only: {\"description\": \"one sentence\", \"content\": \"the FULL revised file\"}"
)


def unified_diff(path: str, old: str, new: str) -> str:
    return "".join(difflib.unified_diff(
        old.splitlines(keepends=True), new.splitlines(keepends=True), fromfile=f"a/{path}", tofile=f"b/{path}",
    ))


def _rule_based(diag: Diagnosis, content: str) -> tuple[str, str]:
    """Deterministic fixes for the seeded bug shapes (used only without an LLM)."""
    if diag.fix_kind == "tool_wrapper_patch":
        marker = '"crustdata.people_search", {"company": rec["company_name"]}, [], err).index'
        out = []
        for line in content.splitlines(keepends=True):
            out.append(line)
            if marker in line:
                indent = line[: len(line) - len(line.lstrip())]
                nl = line[len(line.rstrip("\r\n")):] or "\n"
                out.append(f'{indent}errors.append("people")  # keep the brief alive, but report the data as unavailable{nl}')
        new = "".join(out)
        return new, "Keep the brief resilient to people-search errors, but report the data as unavailable instead of 'none found'."
    if re.search(r"^-.*at least 3 decision makers", content, re.I | re.M):
        new = re.sub(
            r"^.*at least 3 decision makers.*$",
            "- Sales needs actionable briefs: aim for 3 decision makers, but never name anyone who does not "
            "appear in tool results. If fewer appear, list fewer and say why in no_decision_makers_reason.",
            content, count=1, flags=re.M | re.I,
        )
        return new, "Keep the 3-contact goal but forbid naming anyone absent from tool results; list fewer and say why."
    if "confirm the company" not in content.lower() and diag.target_file and diag.target_file.endswith(".md"):
        new = re.sub(
            r"^.*domain lookup is reliable.*$",
            "- Always confirm the company first: check the enrichment result matches the domain before using it.",
            content, count=1, flags=re.M | re.I,
        )
        if new == content:
            new = content.replace("Rules:\n", "Rules:\n- Always confirm the company first: check the enrichment "
                                  "result matches the domain before using it.\n", 1)
        return new, "Restore the company-confirmation step; lookalike domains made skipping it unsafe."
    return content, "No rule-based fix applies"


def propose(diag: Diagnosis, content: str, family_result: FamilyResult, scenarios: list[Scenario],
            attempt: int, previous: list[dict] | None = None) -> tuple[FixCandidate, str, bool]:
    """Returns (candidate, new_file_content, is_mock). `previous` = [{description, diff, failing}] from earlier attempts."""
    path = diag.target_file or "unknown"
    sc_by_id = {s.id: s for s in scenarios}
    failing = [
        {"scenario": v.scenario_id, "role": sc_by_id[v.scenario_id].role, "domain": sc_by_id[v.scenario_id].domain,
         "faults": [f"{f.tool}@{f.at_call}:{f.error.code}" for f in sc_by_id[v.scenario_id].faults],
         "failed_checks": v.failed_checks}
        for v in family_result.verdicts if not v.passed
    ]
    if llm.available("strong"):
        user = json.dumps({
            "diagnosis": diag.model_dump(), "file_path": path, "file_content": content,
            "failing_scenarios": failing, "original_reasoning": diag.reasoning_excerpt,
            "previous_attempts_that_failed": previous or [],
        }, indent=1)
        res = llm.complete("strong", FIX_SYSTEM, user, max_tokens=8000)
        parsed = _parse(res.text)
        new, desc, mock = parsed.get("content", content), parsed.get("description", "model fix"), False
    else:
        new, desc = _rule_based(diag, content)
        mock = True
    if not new.endswith("\n") and content.endswith("\n"):
        new += "\n"
    cand = FixCandidate(
        id=f"fix_{attempt}", incident_id=diag.incident_id, kind=diag.fix_kind, description=desc,
        diff=unified_diff(path, content, new), attempt=attempt,
    )
    return cand, new, mock


def _parse(text: str) -> dict:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return {}
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return {}
