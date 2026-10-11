"""Apply each fix attempt in its own git worktree on branch antibody/<incident>/attempt-<n>.

Prompt fixes are replayed by passing the patched prompt as prompt_override.
Code fixes (tool_wrapper_patch) need the patient itself to run from the worktree: we start the
patient service from the worktree on a spare port and point the family replay at it.
"""

import logging
import os
import shutil
import socket
import stat
import subprocess
import time
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

import httpx

from . import git_tools
from .config import REPO_ROOT, get_settings

log = logging.getLogger("antibody.apply")


@dataclass
class Worktree:
    path: Path
    branch: str
    sha: str


def worktrees_root() -> Path:
    p = get_settings().state_path / "worktrees"
    p.mkdir(parents=True, exist_ok=True)
    return p


def branch_name(incident_id: str, attempt: int) -> str:
    return f"antibody/{incident_id}/attempt-{attempt}"


def create(incident_id: str, attempt: int, rel_path: str, new_content: str, message: str,
           base: str = "HEAD") -> Worktree:
    branch = branch_name(incident_id, attempt)
    path = worktrees_root() / f"{incident_id}-attempt-{attempt}"
    remove(path, branch)
    git_tools.git("worktree", "add", "-b", branch, str(path), base)
    target = path / rel_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(new_content, encoding="utf-8", newline="\n")
    git_tools.git("add", rel_path, cwd=path)
    git_tools.git("commit", "-m", message, cwd=path)
    return Worktree(path=path, branch=branch, sha=git_tools.git("rev-parse", "HEAD", cwd=path))


def checkout(ref: str, name: str) -> Path:
    """Detached worktree of an existing ref (used by the gate)."""
    path = worktrees_root() / name
    remove(path, None)
    git_tools.git("worktree", "add", "--detach", str(path), ref)
    return path


def remove(path: Path, branch: str | None) -> None:
    if path.exists():
        git_tools.git("worktree", "remove", "--force", str(path), check=False)
        if path.exists():
            shutil.rmtree(path, onexc=_force_remove)
    git_tools.git("worktree", "prune", check=False)
    if branch:
        git_tools.git("branch", "-D", branch, check=False)


def _launch(module: str, argv: list[str]) -> str:
    """Call a CLI's main() via python -c. Avoids running a freshly built entry-point .exe, which
    Windows Application Control can block."""
    return (f"import sys; sys.argv = {[module.split('.')[0], *argv]!r}; "
            f"from {module} import main; r = main(); sys.exit(r if isinstance(r, int) else 0)")


def _force_remove(func, path, _exc) -> None:
    """rmtree helper: git marks object files read-only on Windows."""
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except OSError as e:
        log.warning("could not remove %s: %s", path, e)


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@contextmanager
def patient_service(worktree: Path, stub: bool):
    """Run the patient + scorer from `worktree` on a spare port; yields its base URL."""
    port = _free_port()
    env = dict(os.environ)
    if stub:
        cwd = worktree / "antibody"
        cmd = ["uv", "run", "--quiet", "python", "-c", _launch("antibody.cli", ["stub-serve", "--port", str(port)])]
    else:
        cwd = worktree / "detection"
        cmd = ["uv", "run", "--quiet", "python", "-c", _launch("detection.cli", ["serve"])]
        env["DETECTION_PORT"] = str(port)
        # Reuse the main checkout's detection/.env (secrets aren't in git, so the worktree lacks it).
        src_env = REPO_ROOT / "detection" / ".env"
        if src_env.exists() and not (cwd / ".env").exists():
            shutil.copy(src_env, cwd / ".env")
    env.pop("VIRTUAL_ENV", None)
    log.info("starting patient from worktree: %s (port %d)", cwd, port)
    proc = subprocess.Popen(cmd, cwd=cwd, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                            start_new_session=os.name != "nt")
    url = f"http://127.0.0.1:{port}"
    try:
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            if proc.poll() is not None:
                err = proc.stderr.read().decode(errors="replace") if proc.stderr else ""
                raise RuntimeError(f"worktree patient exited early: {err[-800:]}")
            try:
                if httpx.get(f"{url}/health", timeout=1.0).status_code == 200:
                    break
            except httpx.HTTPError:
                pass
            time.sleep(0.5)
        else:
            raise RuntimeError("worktree patient did not become healthy in 120 s")
        yield url
    finally:
        _kill_tree(proc)


def _kill_tree(proc: subprocess.Popen) -> None:
    """`uv run` starts the server as a child; on Windows terminate() would orphan it."""
    if proc.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
    else:
        proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()


def cleanup(incident_id: str, keep_attempt: int | None = None) -> None:
    """Remove this incident's attempt worktrees and local branches, except `keep_attempt`."""
    for path in worktrees_root().glob(f"{incident_id}-attempt-*"):
        n = int(path.name.rsplit("-", 1)[1])
        if n != keep_attempt:
            remove(path, branch_name(incident_id, n))
    for b in git_tools.git("branch", "--list", f"antibody/{incident_id}/attempt-*", "--format=%(refname:short)",
                           check=False).splitlines():
        n = int(b.rsplit("-", 1)[1])
        if n != keep_attempt:
            git_tools.git("branch", "-D", b, check=False)
