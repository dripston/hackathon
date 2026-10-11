"""Every tool call goes through here: live | record | replay, plus injected faults.

- live:   real call, nothing saved.
- record: real call, saved to fixtures/cassettes/<set>/<tool>/<args_hash>.json (errors too, e.g. real 429s).
          A call that is already recorded is replayed instead of paid for again.
- replay: recordings only, never the network. A call with no recording returns an empty result marked
          synthetic=true on the step.
Faults (e.g. HTTP_429 on the 2nd people search) are applied in live and replay, never recorded.
"""

import hashlib
import json
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from ...config import FIXTURES
from ...models import Fault, ToolError

CASSETTES = FIXTURES / "cassettes"


class ToolCallError(Exception):
    def __init__(self, error: ToolError):
        super().__init__(f"{error.code}: {error.message}")
        self.error = error


def args_hash(args: dict) -> str:
    return hashlib.sha256(json.dumps(args, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:24]


def cassette_path(cassette_set: str, tool: str, args: dict) -> Path:
    return CASSETTES / cassette_set / tool / f"{args_hash(args)}.json"


EMPTY_RESULT = {"crustdata.company_enrich": {}, "crustdata.people_search": [], "crustdata.jobs": []}


class Provider:
    def __init__(self, mode: str = "replay", cassette_set: str = "base", faults: list[Fault] | None = None):
        if mode not in ("live", "record", "replay"):
            raise ValueError(f"unknown tool mode {mode!r}")
        self.mode = mode
        self.cassette_set = cassette_set
        self.faults = faults or []
        self._calls: dict[str, int] = {}

    def call(self, tool: str, args: dict, live_fn: Callable[[dict], Any]) -> tuple[Any, bool, float]:
        """Returns (result, synthetic, latency_ms). Raises ToolCallError for tool errors."""
        self._calls[tool] = self._calls.get(tool, 0) + 1
        t0 = time.monotonic()
        if self.mode != "record":
            for f in self.faults:
                if f.tool == tool and f.at_call == self._calls[tool]:
                    raise ToolCallError(f.error)

        path = cassette_path(self.cassette_set, tool, args)
        # Record mode never pays twice for the same call: an existing recording is replayed.
        if self.mode == "replay" or (self.mode == "record" and path.exists()):
            if not path.exists():
                return EMPTY_RESULT.get(tool, None), True, 0.0
            rec = json.loads(path.read_text(encoding="utf-8"))
            if rec.get("error"):
                raise ToolCallError(ToolError.model_validate(rec["error"]))
            return rec.get("result"), False, float(rec.get("latency_ms") or 0.0)

        try:
            result = live_fn(args)
            latency = (time.monotonic() - t0) * 1000
            if self.mode == "record":
                _save(path, {"tool": tool, "args": args, "result": result, "error": None,
                             "latency_ms": round(latency, 1), "label": "RECORDED"})
            return result, False, latency
        except ToolCallError as e:
            if self.mode == "record":
                _save(path, {"tool": tool, "args": args, "result": None, "error": e.error.model_dump(),
                             "latency_ms": round((time.monotonic() - t0) * 1000, 1), "label": "RECORDED"})
            raise


def _save(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")
