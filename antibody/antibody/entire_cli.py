"""Entire checkpoints: recover *why* a change was made.

A commit made during an Entire-tracked agent session carries an `Entire-Checkpoint: <id>` trailer.
`entire checkpoint explain --checkpoint <id> --json` gives metadata (intent etc.); the default text
view adds the scoped prompts, i.e. the request the coding agent was given. That request is the
reasoning Antibody quotes ("Sales says briefs with fewer than 3 contacts are useless...").

When there is no checkpoint, the commit message body is used instead and labelled as such.
"""

import json
import logging
import os
import re
import shutil
import subprocess
from pathlib import Path

from . import git_tools
from .config import REPO_ROOT

log = logging.getLogger("antibody.entire")

_EXTRA_PATHS = [Path.home() / ".local" / "bin"]  # where the Windows/Linux installers put it


def _exe() -> str | None:
    found = shutil.which("entire")
    if found:
        return found
    for d in _EXTRA_PATHS:
        for name in ("entire.exe", "entire"):
            if (d / name).exists():
                return str(d / name)
    return None


def available() -> bool:
    return _exe() is not None


def _run(*args: str, cwd: Path | None = None, timeout: int = 60) -> tuple[int, str]:
    exe = _exe()
    if not exe:
        return 127, ""
    try:
        r = subprocess.run([exe, *args], cwd=cwd or REPO_ROOT, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=timeout,
                           env={**os.environ, "NO_COLOR": "1"})
    except subprocess.TimeoutExpired:
        return 124, ""
    return r.returncode, (r.stdout or "") + (r.stderr if r.returncode else "")


def checkpoint_id_for(sha: str) -> str | None:
    out = git_tools.git("log", "-1", "--format=%(trailers:key=Entire-Checkpoint,valueonly)", sha, check=False)
    return out.strip().splitlines()[0].strip() if out.strip() else None


def _first(d, *keys):
    for k in keys:
        if isinstance(d, dict) and d.get(k):
            return d[k]
    return None


def _prompts_from_text(text: str) -> list[str]:
    """Pull user prompts out of the human-readable explain view (format may vary by version)."""
    prompts, grab = [], False
    for line in text.splitlines():
        s = line.strip()
        if re.match(r"^(scoped )?prompts?\b", s, re.I):
            grab = True
            continue
        if grab:
            if not s:
                if prompts:
                    break
                continue
            if re.match(r"^(files?|tokens?|session|intent|id)\b", s, re.I):
                break
            prompts.append(re.sub(r"^[-*>\d.\s]+", "", s))
    return [p for p in prompts if p]


def checkpoint_for(sha: str) -> dict | None:
    """{checkpoint_id, reasoning_excerpt, source, intent} for a commit, or None if nothing is known."""
    cid = checkpoint_id_for(sha) if sha else None
    if cid and available():
        code, out = _run("checkpoint", "explain", "--checkpoint", cid, "--json")
        meta = {}
        if code == 0:
            try:
                meta = json.loads(out[out.find("{"):]) if "{" in out else {}
            except json.JSONDecodeError:
                meta = {}
        code2, text = _run("checkpoint", "explain", "--checkpoint", cid)
        prompts = _prompts_from_text(text) if code2 == 0 else []
        intent = _first(meta, "intent", "summary", "title") or _first(meta.get("checkpoint", {}), "intent", "summary")
        reasoning = prompts[0] if prompts else intent
        return {"checkpoint_id": cid, "reasoning_excerpt": _clip(reasoning), "intent": intent,
                "prompts": prompts[:5], "source": "entire_checkpoint"}
    if cid:
        log.warning("commit %s has checkpoint %s but the entire CLI isn't available", sha[:8], cid)
    body = git_tools.git("log", "-1", "--format=%b", sha, check=False) if sha else ""
    body = "\n".join(l for l in body.splitlines() if not re.match(r"^[\w-]+: ", l)).strip()
    if body:
        return {"checkpoint_id": cid, "reasoning_excerpt": _clip(body), "intent": None, "prompts": [],
                "source": "commit_message"}
    return None


def _clip(text: str | None, n: int = 400) -> str | None:
    if not text:
        return None
    text = " ".join(text.split())
    return text if len(text) <= n else text[: n - 1].rsplit(" ", 1)[0] + "…"


def create_trail(title: str, pr_url: str, branch: str, repo: str, cwd: Path | None = None) -> str | None:
    """Create an Entire Trail for the fix branch via the API (--repo form: non-interactive, no local
    changes). Needs `entire login`. Returns the trail URL/id, or None if unavailable or it fails."""
    if not available() or not repo:
        return None
    code, out = _run("trail", "create", "--repo", f"gh/{repo}", "--title", title, "--base", "main",
                     "--branch", branch, "--type", "bug", "--body", f"Pull request: {pr_url}",
                     cwd=cwd, timeout=120)
    if code != 0:
        log.warning("entire trail create failed (is `entire login` done?): %s", out.strip()[-300:])
        return None
    m = re.search(r"https?://\S+", out)
    return m.group(0) if m else (out.strip().splitlines()[-1] if out.strip() else "created")
