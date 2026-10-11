"""score_run(run) -> RunScore. Real (non-simulated) runs are appended to .state/runs.jsonl, which is
what GET /runs serves, and their scores become neatlogs attributes so detections and alerts fire."""

import json
import threading

from ..config import get_settings
from ..models import AgentRun, RunScore
from .jev import jev_grounded
from .tripwires import ALL

_lock = threading.Lock()


def score_run(run: AgentRun) -> RunScore:
    checks = [check(run) for check in ALL]
    jev = jev_grounded(run)
    # Violations are the deterministic tripwires only; the Jev score is advisory (see checks/jev.py).
    violations = [c.id for c in checks if not c.passed]
    return RunScore(run_id=run.run_id, checks=checks + ([jev] if jev else []), violations=violations)


def attributes(run: AgentRun, score: RunScore) -> dict:
    attrs = {
        "antibody.run_id": run.run_id,
        "antibody.prompt_version": run.prompt_version,
        "antibody.bug_flags": json.dumps(run.bug_flags, sort_keys=True),
        "antibody.simulated": run.simulated,
        "antibody.violations": len(score.violations),
        "antibody.domain": run.input.get("domain", ""),
    }
    for c in score.checks:
        if c.id.startswith("tw_"):
            attrs[f"antibody.tw.{c.id}"] = 0 if c.passed else 1
        elif c.score is not None:
            attrs[f"antibody.jev.{c.id.removeprefix('jev_')}"] = c.score
    return attrs


def runs_path():
    p = get_settings().state_dir
    p.mkdir(parents=True, exist_ok=True)
    return p / "runs.jsonl"


def record(run: AgentRun, score: RunScore) -> None:
    """Append a real run; simulated runs are never stored as production traffic."""
    if run.simulated:
        return
    line = json.dumps({"run": run.model_dump(mode="json"), "score": score.model_dump(mode="json")})
    with _lock, runs_path().open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def recent(limit: int = 20) -> list[dict]:
    path = runs_path()
    if not path.exists():
        return []
    lines = path.read_text(encoding="utf-8").splitlines()
    out = []
    for line in reversed(lines):
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
        if len(out) >= limit:
            break
    return out
