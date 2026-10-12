"""Apply each fix attempt in its own git worktree on branch antibody/<incident>/attempt-<n>.

Prompt fixes are replayed by passing the patched prompt as prompt_override.
Code fixes (tool_wrapper_patch) need the patient itself to run from the worktree: we start the
patient service from the worktree on a spare port and point the family replay at it.
"""

import logging
import os
import re
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
from .config import ENV_FILE, REPO_ROOT, get_settings

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
    if path.exists():  # Windows can keep a folder locked (indexers, AV); use a fresh name rather than fail
        path = worktrees_root() / f"{incident_id}-attempt-{attempt}-{int(time.time())}"
    git_tools.git("worktree", "add", "-b", branch, str(path), base)
    from . import events

    events.emit(incident_id, "cmd", cmd=events.cmdline("git", "worktree", "add", "-b", branch, f".state/worktrees/{path.name}", base),
                out=f"Preparing worktree (new branch '{branch}')")
    target = path / rel_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(new_content, encoding="utf-8", newline="\n")
    git_tools.git("add", rel_path, cwd=path)
    git_tools.git("commit", "-m", message, cwd=path)
    sha = git_tools.git("rev-parse", "HEAD", cwd=path)
    events.emit(incident_id, "cmd", cmd=events.cmdline("git", "commit", "-m", message.splitlines()[0]),
                out=f"[{branch} {sha[:7]}] {message.splitlines()[0]}\n 1 file changed")
    return Worktree(path=path, branch=branch, sha=sha)


def checkout(ref: str, name: str) -> Path:
    """Detached worktree of an existing ref (used by the gate)."""
    import uuid

    # A unique suffix: two gate runs (e.g. a post-merge job and a manual backtest) must never share a
    # folder, and Windows can keep a just-removed one locked.
    path = worktrees_root() / f"{name[:100]}-{uuid.uuid4().hex[:6]}"
    git_tools.git("worktree", "add", "--detach", str(path), ref)
    return path


def remove(path: Path, branch: str | None) -> None:
    for i in range(5):  # a just-killed patient can hold files open for a moment on Windows
        if not path.exists():
            break
        git_tools.git("worktree", "remove", "--force", str(path), check=False)
        if path.exists():
            shutil.rmtree(path, onexc=_force_remove if i == 4 else _ignore)
        if path.exists():
            time.sleep(1 + i)
    git_tools.git("worktree", "prune", check=False)
    if branch:
        git_tools.git("branch", "-D", branch, check=False)


def _launch(module: str, argv: list[str]) -> str:
    """Call a CLI's main() via python -c. Avoids running a freshly built entry-point .exe, which
    Windows Application Control can block."""
    return (f"import sys; sys.argv = {[module.split('.')[0], *argv]!r}; "
            f"from {module} import main; r = main(); sys.exit(r if isinstance(r, int) else 0)")


def _ignore(func, path, _exc) -> None:
    """rmtree helper for early attempts: clear read-only, try once, stay quiet (the caller retries)."""
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except OSError:
        pass


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
    # Secrets aren't in git, so the worktree has no .env. Current code reads the repo-root .env; older
    # commits (e.g. a backtest of the commit that caused an incident) read detection/.env, so give both.
    src_env = REPO_ROOT / ".env" if (REPO_ROOT / ".env").exists() else ENV_FILE
    if src_env.exists():
        for dst in (worktree / ".env", worktree / "detection" / ".env"):
            if dst.parent.exists() and not dst.exists():
                shutil.copy(src_env, dst)
    if stub:
        cwd = worktree / "antibody"
        cmd = ["uv", "run", "--quiet", "python", "-c", _launch("antibody.cli", ["stub-serve", "--port", str(port)])]
    else:
        cwd = worktree / "detection"
        cmd = ["uv", "run", "--quiet", "python", "-c", _launch("detection.cli", ["serve"])]
        env["DETECTION_PORT"] = str(port)
        # detection keeps its uv cache inside the project; reuse the main checkout's so a fresh worktree
        # doesn't re-download every dependency.
        env.setdefault("UV_CACHE_DIR", str(REPO_ROOT / "detection" / ".uv-cache"))
        # An older commit's patient only knows the GROQ_* settings. Groq and DeepSeek both speak the
        # OpenAI API, so point those at the provider in use (process env beats the copied .env).
        if src_env.exists():
            from dotenv import dotenv_values

            denv = dotenv_values(src_env)
            if (denv.get("LLM_PROVIDER") or "").lower() == "deepseek" and denv.get("DEEPSEEK_API_KEY"):
                env["GROQ_API_KEY"] = denv["DEEPSEEK_API_KEY"]
                env["GROQ_BASE_URL"] = denv.get("DEEPSEEK_BASE_URL") or "https://api.deepseek.com"
        # Recordings are test data, not the code under test: an older commit (e.g. a backtest of the commit
        # that caused an incident) predates today's recordings, so give it the current ones.
        src_cassettes = REPO_ROOT / "detection" / "fixtures" / "cassettes"
        if src_cassettes.exists():
            shutil.copytree(src_cassettes, cwd / "fixtures" / "cassettes", dirs_exist_ok=True)
    env.pop("VIRTUAL_ENV", None)
    log.info("starting patient from worktree: %s (port %d)", cwd, port)
    # Output goes to a file, never a pipe: nobody reads a pipe while the service runs, and once its
    # buffer fills (request logs, tracing) the service blocks mid-write and every run times out.
    log_path = cwd / ".service.log"
    log_file = open(log_path, "wb")
    proc = subprocess.Popen(cmd, cwd=cwd, env=env, stdout=log_file, stderr=subprocess.STDOUT,
                            start_new_session=os.name != "nt")
    url = f"http://127.0.0.1:{port}"
    try:
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            if proc.poll() is not None:
                err = log_path.read_text(encoding="utf-8", errors="replace")
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
        log_file.close()


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
        n = int(re.search(r"-attempt-(\d+)", path.name).group(1))
        if n != keep_attempt:
            remove(path, branch_name(incident_id, n))
    for b in git_tools.git("branch", "--list", f"antibody/{incident_id}/attempt-*", "--format=%(refname:short)",
                           check=False).splitlines():
        n = int(b.rsplit("-", 1)[1])
        if n != keep_attempt:
            git_tools.git("branch", "-D", b, check=False)


def worktree_for(incident_id: str, attempt: int) -> Path:
    """The worktree directory holding this attempt's branch (it may carry a suffix, see create)."""
    out = git_tools.git("worktree", "list", "--porcelain", check=False)
    branch = f"refs/heads/{branch_name(incident_id, attempt)}"
    path = None
    for line in out.splitlines():
        if line.startswith("worktree "):
            path = Path(line[len("worktree "):])
        elif line.strip() == f"branch {branch}" and path is not None:
            return path
    return worktrees_root() / f"{incident_id}-attempt-{attempt}"
