"""Thin wrappers over git and gh. Every call is explicit; nothing force-pushes."""

import subprocess
from pathlib import Path

from .config import REPO_ROOT


def git(*args: str, cwd: Path | None = None, check: bool = True) -> str:
    r = subprocess.run(["git", *args], cwd=cwd or REPO_ROOT, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if check and r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {r.stderr.strip()}")
    return r.stdout.strip()


def gh(*args: str, cwd: Path | None = None) -> str:
    r = subprocess.run(["gh", *args], cwd=cwd or REPO_ROOT, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise RuntimeError(f"gh {' '.join(args)} failed: {r.stderr.strip()}")
    return r.stdout.strip()


def last_commit_touching(path: Path) -> dict | None:
    """The most recent commit that changed `path` (follows renames)."""
    rel = str(Path(path).resolve().relative_to(REPO_ROOT)).replace("\\", "/")
    out = git("log", "-1", "--follow", "--format=%H%x1f%s%x1f%an%x1f%aI", "--", rel, check=False)
    if not out:
        return None
    sha, subject, author, date = out.split("\x1f")
    return {"sha": sha, "subject": subject, "author": author, "date": date, "file": rel}


def show_file(ref: str, rel_path: str) -> str | None:
    r = subprocess.run(["git", "show", f"{ref}:{rel_path}"], cwd=REPO_ROOT, capture_output=True,
                       text=True, encoding="utf-8", errors="replace")
    return r.stdout if r.returncode == 0 else None


def current_branch() -> str:
    return git("rev-parse", "--abbrev-ref", "HEAD")
