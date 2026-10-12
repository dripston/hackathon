"""Live events for an incident: what Antibody is doing right now, step by step.

Appended to .state/incidents/<id>/events.jsonl and served by GET /incidents/{id}/events, so the console can
render the work as it happens (terminal commands, the fix being written, each replay verdict, the PR).
Every event describes a real step that just ran; nothing here is a re-enactment.

Kinds:
  stage    {stage, status: start|done, text}
  cmd      {cmd, out}                 a real git / gh / service command and a short excerpt of its output
  note     {text}                     a step that is not a shell command (comparing runs, reading a checkpoint)
  scenario {id, role, domain, fault}  a bred variant
  verdict  {candidate, scenario_id, domain, role, passed, failed_checks}
  llm      {purpose, status: start|done, model}
  code     {file, attempt, fix_id, description, diff}
  pr       {action: opened|merged|local, url, branch, title}
"""

import json
import logging
import threading
from datetime import UTC, datetime

from .config import get_settings

log = logging.getLogger("antibody.events")
_lock = threading.Lock()
_seq: dict[str, int] = {}


def _path(incident_id: str):
    d = get_settings().state_path / "incidents" / incident_id
    d.mkdir(parents=True, exist_ok=True)
    return d / "events.jsonl"


def emit(incident_id: str | None, kind: str, **data) -> None:
    """Append one event. Never raises: live rendering must not break the pipeline."""
    if not incident_id:
        return
    try:
        with _lock:
            path = _path(incident_id)
            if incident_id not in _seq:
                _seq[incident_id] = sum(1 for _ in path.open(encoding="utf-8")) if path.exists() else 0
            _seq[incident_id] += 1
            ev = {"seq": _seq[incident_id], "ts": datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                  "kind": kind, **data}
            with path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(ev, default=str) + "\n")
    except Exception as e:  # pragma: no cover - defensive
        log.warning("event emit failed: %s", e)


def read(incident_id: str, after: int = 0, limit: int = 500) -> list[dict]:
    path = _path(incident_id)
    if not path.exists():
        return []
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        if ev.get("seq", 0) > after:
            out.append(ev)
            if len(out) >= limit:
                break
    return out


def cmdline(*args: str) -> str:
    """A shell-style rendering of a command, for display."""
    def q(a: str) -> str:
        return a if a and all(c.isalnum() or c in "-_./:=@%,+" for c in a) else json.dumps(a)
    return " ".join(q(str(a)) for a in args)
