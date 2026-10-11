"""Diagnosis: what changed between failing and healthy runs, which commit did it, and why.

1. Failing vs healthy runs (detection's GET /runs, or the stub traffic).
2. What changed: prompt version and bug flags that separate failing runs from healthy ones.
3. Which commit: git log on the suspect file.
4. Why: the Entire checkpoint for that commit (see entire_cli.py).
5. The strong model writes the explanation and picks fix_kind from that evidence (narrow job).
"""

import json
import logging
from collections import Counter
from pathlib import Path

from . import entire_cli, git_tools, llm
from .config import ANTIBODY_DIR, REPO_ROOT, get_settings
from .models import AgentRun, Diagnosis, Incident, RunScore
from .scorer_client import ScorerClient
from .stubs import traffic as stub_traffic
from .stubs.prompts import STUB_PROMPT_DIR

log = logging.getLogger("antibody.diagnose")


def collect_runs(incident: Incident, limit: int = 100) -> tuple[list[dict], bool]:
    scorer = ScorerClient()
    if scorer.is_stub:
        return stub_traffic.recent_runs(incident.detection), True
    rows, mock = scorer.recent_runs(limit)
    return rows, mock


def split_runs(rows: list[dict], incident: Incident) -> tuple[list[tuple[AgentRun, RunScore]], list[tuple[AgentRun, RunScore]]]:
    failing, healthy = [], []
    for row in rows:
        run, score = AgentRun.model_validate(row["run"]), RunScore.model_validate(row["score"])
        if run.simulated:
            continue
        if incident.detection in score.violations or (run.trace_id and run.trace_id in incident.trace_ids):
            failing.append((run, score))
        elif not score.violations:
            healthy.append((run, score))
    return failing, healthy


def summarise(run: AgentRun, score: RunScore) -> dict:
    out = run.output or {}
    return {
        "run_id": run.run_id,
        "trace_id": run.trace_id,
        "domain": run.input.get("domain"),
        "prompt_version": run.prompt_version,
        "bug_flags": {k: v for k, v in run.bug_flags.items() if v},
        "tool_errors": [f"{s.name}:{s.error.code}" for s in run.steps if s.error],
        "violations": score.violations,
        "evidence": [c.evidence for c in score.checks if not c.passed],
        "decision_makers": [d.get("name") for d in out.get("decision_makers") or []],
        "summary": out.get("summary"),
    }


def what_changed(failing: list[dict], healthy: list[dict]) -> dict:
    """Prompt versions / flags present in failing runs but not in healthy ones."""
    fv = Counter(f["prompt_version"] for f in failing)
    hv = Counter(h["prompt_version"] for h in healthy)
    ff = Counter(k for f in failing for k in f["bug_flags"])
    hf = Counter(k for h in healthy for k in h["bug_flags"])
    suspect_versions = [v for v in fv if v not in hv]
    suspect_flags = [k for k in ff if k not in hf]
    return {
        "failing_prompt_versions": dict(fv), "healthy_prompt_versions": dict(hv),
        "failing_flags": dict(ff), "healthy_flags": dict(hf),
        "suspect_prompt_version": suspect_versions[0] if suspect_versions else (fv.most_common(1)[0][0] if fv else None),
        "suspect_flag": suspect_flags[0] if suspect_flags else None,
        "healthy_prompt_version": hv.most_common(1)[0][0] if hv else None,
    }


def prompt_dir(stub: bool) -> Path:
    return STUB_PROMPT_DIR if stub else REPO_ROOT / get_settings().patient_prompt_dir


def target_file(change: dict, stub: bool) -> Path | None:
    """The file a fix would touch: the suspect prompt, or the tool wrapper when a flag is to blame."""
    if change["suspect_flag"]:
        if stub:
            return ANTIBODY_DIR / "antibody" / "stubs" / "patient.py"
        files = [REPO_ROOT / f for f in get_settings().tool_file_list]
        return next((f for f in files if f.exists()), files[0] if files else None)
    v = change["suspect_prompt_version"]
    return prompt_dir(stub) / f"{v}.md" if v else None


EXPLAIN_SYSTEM = (
    "You are the diagnosis step of an on-call system for AI agents. You get evidence about a silent "
    "failure: failing vs healthy runs, what changed, the commit, and the reasoning recorded when the "
    "change was made. Explain in 2-4 plain sentences what broke and why, using only the evidence. "
    "Then choose fix_kind: prompt_patch (edit the prompt, keeping its intent), prompt_rollback (the "
    "change has no intent worth keeping), or tool_wrapper_patch (the bug is in tool-calling code, not "
    'the prompt). Reply with JSON only: {"explanation": "...", "fix_kind": "..."}'
)


def _fallback_explanation(incident: Incident, change: dict, commit: dict | None, reasoning: str | None) -> tuple[str, str]:
    what = (f"bug flag '{change['suspect_flag']}'" if change["suspect_flag"]
            else f"prompt version {change['suspect_prompt_version']}")
    parts = [f"Runs failing {incident.detection} all use {what}; healthy runs don't."]
    if commit:
        parts.append(f"It was introduced in commit {commit['sha'][:8]} ('{commit['subject']}').")
    if reasoning:
        parts.append(f"The change was made because: {reasoning[:200]}")
    kind = "tool_wrapper_patch" if change["suspect_flag"] else "prompt_patch"
    return " ".join(parts), kind


def diagnose(incident: Incident) -> tuple[Diagnosis, bool, dict]:
    """Returns (diagnosis, is_mock, evidence)."""
    rows, mock = collect_runs(incident)
    failing, healthy = split_runs(rows, incident)
    f_all = [summarise(r, s) for r, s in failing]
    h_all = [summarise(r, s) for r, s in healthy]
    change = what_changed(f_all, h_all)
    f_sum, h_sum = f_all[:5], h_all[:5]
    tfile = target_file(change, mock)

    commit = None
    if tfile is not None and tfile.exists():
        commit = git_tools.last_commit_touching(tfile)

    checkpoint = entire_cli.checkpoint_for(commit["sha"]) if commit else None
    reasoning = checkpoint.get("reasoning_excerpt") if checkpoint else None

    failing_domains = list(dict.fromkeys(f["domain"] for f in f_all if f["domain"]))
    evidence = {"failing": f_sum, "healthy": h_sum, "change": change, "commit": commit,
                "failing_domains": failing_domains,
                "healthy_domains": [d for d in dict.fromkeys(h["domain"] for h in h_all if h["domain"])
                                    if d not in failing_domains],
                "checkpoint": checkpoint, "target_file": str(tfile) if tfile else None}

    explanation, fix_kind = _fallback_explanation(incident, change, commit, reasoning)
    if llm.available("strong"):
        try:
            res = llm.complete("strong", EXPLAIN_SYSTEM, json.dumps(evidence, indent=1, default=str), 800)
            parsed = _parse_json(res.text)
            explanation = parsed.get("explanation") or explanation
            if parsed.get("fix_kind") in ("prompt_patch", "prompt_rollback", "tool_wrapper_patch"):
                fix_kind = parsed["fix_kind"]
        except Exception as e:
            log.warning("diagnosis LLM failed (%s); using the template explanation", e)
    else:
        mock = True  # explanation is a template, not a model

    repo = get_settings().github_repo
    sha = commit["sha"] if commit else None
    diag = Diagnosis(
        incident_id=incident.id,
        commit_sha=sha,
        checkpoint_id=checkpoint.get("checkpoint_id") if checkpoint else None,
        checkpoint_url=f"https://entire.io/gh/{repo}/commit/{sha}" if (sha and repo and checkpoint) else None,
        reasoning_excerpt=reasoning,
        good_trace_ids=[h["trace_id"] for h in h_sum if h["trace_id"]],
        explanation=explanation,
        fix_kind=fix_kind,
        target_file=str(tfile.relative_to(REPO_ROOT)).replace("\\", "/") if tfile else None,
        prompt_version=change["suspect_prompt_version"],
        bug_flags={change["suspect_flag"]: True} if change["suspect_flag"] else {},
    )
    return diag, mock, evidence


def _parse_json(text: str) -> dict:
    start, end = text.find("{"), text.rfind("}")
    return json.loads(text[start : end + 1]) if start >= 0 else {}
