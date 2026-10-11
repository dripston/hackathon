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


def checkpoint_ids_for(sha: str) -> list[str]:
    out = git_tools.git("log", "-1", "--format=%(trailers:key=Entire-Checkpoint,valueonly)", sha, check=False)
    return [l.strip() for l in out.splitlines() if l.strip()]


def checkpoint_id_for(sha: str, file: str | None = None) -> str | None:
    """A commit can carry several checkpoints (several agent sessions touched the work). Prefer the one
    whose session touched `file`; otherwise the newest (last trailer)."""
    ids = checkpoint_ids_for(sha)
    if len(ids) <= 1 or not file or not available():
        return ids[-1] if ids else None
    for cid in reversed(ids):
        code, out = _run("checkpoint", "explain", "--checkpoint", cid, "--json")
        try:
            meta = json.loads(out[out.find("{"):]) if code == 0 and "{" in out else {}
        except json.JSONDecodeError:
            meta = {}
        if file in (meta.get("files_touched") or []):
            return cid
    return ids[-1]


def _first(d, *keys):
    for k in keys:
        if isinstance(d, dict) and d.get(k):
            return d[k]
    return None


def _section(text: str, name: str) -> str | None:
    """Body of a '## Name' section in the explain view (None if missing or not generated yet)."""
    m = re.search(rf"^## {name}\s*$(.*?)(?=^## |^──|\Z)", text, re.M | re.S)
    body = m.group(1).strip() if m else ""
    return None if not body or body.startswith("*Not generated") else body


def _prompts_from_text(text: str) -> list[str]:
    """[User] turns from the checkpoint-scope transcript in the explain view, oldest first."""
    prompts, cur = [], None
    for line in text.splitlines():
        tag = re.match(r"^\[(User|Assistant|Tool)\]\s?(.*)$", line)
        if tag:
            if cur is not None:
                prompts.append(" ".join(cur).strip())
            cur = [tag.group(2)] if tag.group(1) == "User" else None
        elif cur is not None:
            cur.append(line.strip())
    if cur is not None:
        prompts.append(" ".join(cur).strip())
    # Skip automated turns (task notifications, IDE context, system reminders): not human requests.
    return [p for p in prompts if p and not p.startswith("<")]


def _meta(cid: str) -> dict:
    code, out = _run("checkpoint", "explain", "--checkpoint", cid, "--json")
    try:
        return json.loads(out[out.find("{"):]) if code == 0 and "{" in out else {}
    except json.JSONDecodeError:
        return {}


def session_that_touched(sha: str, file: str) -> tuple[str, int, str] | None:
    """(checkpoint_id, session_index, session_id) of the agent session that touched `file` in this
    commit. A commit can carry several checkpoints and a checkpoint several sessions; prefer the
    checkpoint with the fewest sessions, then the newest."""
    best = None
    for order, cid in enumerate(checkpoint_ids_for(sha)):
        sessions = _meta(cid).get("sessions") or []
        for s in sessions:
            if file in (s.get("files_touched") or []):
                key = (len(sessions), -order)
                if best is None or key < best[0]:
                    best = (key, (cid, int(s.get("index", 0)), s.get("session_id", "")))
    return best[1] if best else None


def session_requests(cid: str, index: int) -> list[str]:
    """Human requests in one session's stored transcript (Claude Code JSONL), oldest first."""
    code, out = _run("checkpoint", "explain", "--checkpoint", cid, "--transcript", "--session-index", str(index),
                     timeout=120)
    if code != 0:
        return []
    prompts = []
    for line in out.splitlines():
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        if rec.get("type") != "user":
            continue
        content = (rec.get("message") or {}).get("content")
        text = content if isinstance(content, str) else " ".join(
            c.get("text", "") for c in content or [] if isinstance(c, dict) and c.get("type") == "text")
        text = text.strip()
        if text and not text.startswith("<"):  # skip tool results, notifications, IDE context
            prompts.append(text)
    return prompts


def checkpoint_for(sha: str, file: str | None = None) -> dict | None:
    """{checkpoint_id, reasoning_excerpt, source, intent} for a commit, or None if nothing is known."""
    if sha and file and available():
        hit = session_that_touched(sha, file)
        if hit:
            cid, index, session_id = hit
            requests = session_requests(cid, index)
            if requests:
                # The session's first human request is what the change was made for.
                return {"checkpoint_id": cid, "session_id": session_id, "reasoning_excerpt": _clip(requests[0]),
                        "intent": _clip(requests[0]), "prompts": [_clip(p, 300) for p in requests[:5]],
                        "files": [file], "source": "entire_checkpoint"}
    cid = checkpoint_id_for(sha, file) if sha else None
    if cid and available():
        code, out = _run("checkpoint", "explain", "--checkpoint", cid, "--json")
        meta = {}
        if code == 0:
            try:
                meta = json.loads(out[out.find("{"):]) if "{" in out else {}
            except json.JSONDecodeError:
                meta = {}
        code2, text = _run("checkpoint", "explain", "--checkpoint", cid)
        text = text if code2 == 0 else ""
        prompts = _prompts_from_text(text)
        intent = _section(text, "Intent") or _first(meta, "intent")
        summary = _section(text, "Summary")
        # The request that led to the commit is the last user turn in the checkpoint's scope; a
        # generated summary is better still. Intent (the session's first request) is the fallback.
        reasoning = summary or (prompts[-1] if prompts else None) or intent
        return {"checkpoint_id": cid, "reasoning_excerpt": _clip(reasoning), "intent": _clip(intent),
                "prompts": [_clip(p, 300) for p in prompts[-5:]], "files": meta.get("files_touched", []),
                "source": "entire_checkpoint"}
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
