"""Ship an accepted fix: save the immunity family, push the attempt branch, open a PR with evidence."""

import json
import logging
import tempfile
from pathlib import Path

from . import entire_cli, git_tools, grade
from .config import get_settings
from .models import Diagnosis, FamilyResult, FixCandidate, Incident, Scenario
from .state import now_iso

log = logging.getLogger("antibody.ship")

IMMUNITY_DIR = "antibody/fixtures/immunity"


def immunity_record(incident: Incident, diag: Diagnosis, scenarios: list[Scenario], fix: FixCandidate,
                    before: FamilyResult, after: FamilyResult, mock: bool) -> dict:
    return {
        "incident_id": incident.id,
        "detection": incident.detection,
        "target_file": diag.target_file,
        "fix_kind": diag.fix_kind,
        "prompt_version": diag.prompt_version,
        "bug_flags": diag.bug_flags,
        "caused_by_commit": diag.commit_sha,
        "fix_id": fix.id,
        "scenarios": [s.model_dump(mode="json") for s in scenarios],
        "before": grade.line(before),
        "after": grade.line(after),
        "mock": mock,
        "created_at": now_iso(),
    }


def trace_link(trace_id: str | None) -> str:
    if not trace_id:
        return "(no trace id)"
    tmpl = get_settings().neatlogs_trace_url
    return f"[{trace_id}]({tmpl.format(trace_id=trace_id)})" if tmpl else f"`{trace_id}`"


def ref(trace_id: str | None, run_id: str | None) -> str:
    return trace_link(trace_id) if trace_id else f"run `{run_id}`"


def pr_body(incident: Incident, diag: Diagnosis, fix: FixCandidate, before: FamilyResult, after: FamilyResult,
            cost_usd: float, duration_ms: int, mock: bool) -> str:
    # Before: the real failing production traces when we have them; else the failing replays.
    bad = [ref(t, None) for t in incident.trace_ids[:2]] or           [ref(v.trace_id, v.run_id) for v in before.verdicts if not v.passed][:2]
    good = [ref(v.trace_id, v.run_id) for v in after.verdicts if v.passed][:2]
    lines = [
        f"## What broke: `{incident.detection}`",
        "",
        diag.explanation,
        "",
        f"- Incident: `{incident.id}` (first seen {incident.first_seen})",
        f"- Caused by: `{diag.commit_sha or 'unknown'}`" + (f" ([Entire checkpoint]({diag.checkpoint_url}))" if diag.checkpoint_url else ""),
    ]
    if diag.reasoning_excerpt:
        src = "the Entire checkpoint" if diag.reasoning_source == "entire_checkpoint" else "the commit message"
        lines += ["", f"**Why that change was made (from {src}):**", "", f"> {diag.reasoning_excerpt}"]
    lines += [
        "",
        f"## The fix ({fix.id}, {fix.kind})",
        "",
        fix.description,
        "",
        "## Evidence: the whole variant family, replayed on recorded tool responses",
        "",
        "| | must_fix | must_not_change |",
        "|---|---|---|",
        f"| Before | {before.must_fix_passed}/{before.must_fix_total} | {before.must_not_change_passed}/{before.must_not_change_total} |",
        f"| After | {after.must_fix_passed}/{after.must_fix_total} | {after.must_not_change_passed}/{after.must_not_change_total} |",
        "",
        "Failing before: " + (", ".join(bad) or "n/a"),
        "",
        "Passing after (replays): " + (", ".join(good) or "n/a"),
        "",
        f"Antibody cost: ${cost_usd:.4f} · time: {duration_ms / 1000:.0f} s",
        "",
        f"The family is saved to `{IMMUNITY_DIR}/{incident.id}.json` and becomes part of the pre-deploy gate.",
        "",
        "Merge only with the exact phrase `approve fix N` (typed in the console or spoken to the voice agent).",
    ]
    if mock:
        lines += ["", "> **MOCK:** parts of this run used Antibody's built-in stubs, not the real patient."]
    lines += ["", "🤖 Generated with [Claude Code](https://claude.com/claude-code)"]
    return "\n".join(lines)


def ship(incident: Incident, diag: Diagnosis, scenarios: list[Scenario], fix: FixCandidate, worktree: Path,
         before: FamilyResult, after: FamilyResult, cost_usd: float, duration_ms: int, mock: bool,
         allow_mock_pr: bool = False) -> dict:
    """Commit the immunity file on the attempt branch, push, open a PR. Returns {pr_url, note}."""
    rec = immunity_record(incident, diag, scenarios, fix, before, after, mock)
    rel = f"{IMMUNITY_DIR}/{incident.id}.json"
    target = worktree / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(rec, indent=2) + "\n", encoding="utf-8", newline="\n")
    git_tools.git("add", rel, cwd=worktree)
    git_tools.git("commit", "-m",
                  f"Save immunity family for {incident.id}\n\nThe {len(scenarios)} scenarios that proved {fix.id} "
                  f"become a pre-deploy gate, so this failure can't quietly come back.",
                  cwd=worktree)

    if mock and not allow_mock_pr:
        return {"pr_url": None, "note": "mock run: branch committed locally, not pushed (use --ship-mock to open a PR)"}

    branch = git_tools.git("rev-parse", "--abbrev-ref", "HEAD", cwd=worktree)
    if get_settings().ship_target == "local":
        return {"pr_url": None, "note": f"local run: {branch} committed, not pushed; approval merges it locally"}
    git_tools.git("push", "-u", "origin", branch, cwd=worktree)
    body = pr_body(incident, diag, fix, before, after, cost_usd, duration_ms, mock)
    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8") as f:
        f.write(body)
        body_file = f.name
    title = f"Antibody: fix {incident.detection} ({fix.id})" + (" [MOCK]" if mock else "")
    pr_url = git_tools.gh("pr", "create", "--base", "main", "--head", branch, "--title", title,
                          "--body-file", body_file, cwd=worktree).splitlines()[-1]
    Path(body_file).unlink(missing_ok=True)
    note = ""
    trail = entire_cli.create_trail(title, pr_url, branch, git_tools.github_repo(), cwd=worktree)
    if trail:
        note = f"Entire trail: {trail}"
    return {"pr_url": pr_url, "note": note}
