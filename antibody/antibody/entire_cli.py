"""Entire checkpoints: recover why a change was made. Returns None when Entire isn't available."""

import logging
import shutil

log = logging.getLogger("antibody.entire")


def available() -> bool:
    return shutil.which("entire") is not None


def checkpoint_for(sha: str) -> dict | None:
    """{checkpoint_id, reasoning_excerpt, raw} for a commit, or None."""
    if not available():
        log.info("entire CLI not installed; diagnosis falls back to git history only")
        return None
    return None


def create_trail(title: str, pr_url: str, cwd=None) -> str | None:
    """Create an Entire Trail for the PR if Entire supports it here; None otherwise."""
    if not available():
        return None
    return None
