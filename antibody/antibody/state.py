"""File-based state: .state/incidents/<id>/<stage>.json. No database."""

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel

from .config import get_settings

M = TypeVar("M", bound=BaseModel)


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


class StateStore:
    def __init__(self, root: Path | None = None):
        self.root = Path(root) if root else get_settings().state_path
        self.root.mkdir(parents=True, exist_ok=True)

    def incident_dir(self, incident_id: str) -> Path:
        d = self.root / "incidents" / incident_id
        d.mkdir(parents=True, exist_ok=True)
        return d

    def has(self, incident_id: str, stage: str) -> bool:
        return (self.root / "incidents" / incident_id / f"{stage}.json").exists()

    def write(self, incident_id: str, stage: str, data: BaseModel | list | dict) -> Path:
        path = self.incident_dir(incident_id) / f"{stage}.json"
        _write_json(path, data)
        return path

    def read(self, incident_id: str, stage: str, model: type[M] | None = None):
        path = self.root / "incidents" / incident_id / f"{stage}.json"
        if not path.exists():
            return None
        data = json.loads(_retry(lambda: path.read_text(encoding="utf-8")))
        return model.model_validate(data) if model else data

    def delete(self, incident_id: str, stage: str) -> None:
        (self.root / "incidents" / incident_id / f"{stage}.json").unlink(missing_ok=True)

    def incident_ids(self) -> list[str]:
        base = self.root / "incidents"
        if not base.exists():
            return []
        return sorted(p.name for p in base.iterdir() if (p / "incident.json").exists())

    # Meta: whether anything in this incident came from stubs (drives x-antibody-mock).
    def mark_mock(self, incident_id: str, source: str) -> None:
        meta = self.read(incident_id, "meta") or {"mock": False, "mock_sources": []}
        meta["mock"] = True
        if source not in meta["mock_sources"]:
            meta["mock_sources"].append(source)
        self.write(incident_id, "meta", meta)

    def is_mock(self, incident_id: str) -> bool:
        meta = self.read(incident_id, "meta") or {}
        return bool(meta.get("mock"))

    def save_webhook(self, body: bytes) -> Path:
        d = self.root / "webhooks"
        d.mkdir(parents=True, exist_ok=True)
        path = d / f"{datetime.now(UTC).strftime('%Y%m%dT%H%M%S%fZ')}.json"
        path.write_bytes(body)
        return path

    def write_gate(self, report: BaseModel) -> Path:
        d = self.root / "gate"
        d.mkdir(parents=True, exist_ok=True)
        path = d / "latest.json"
        _write_json(path, report)
        return path

    def read_gate(self) -> dict | None:
        path = self.root / "gate" / "latest.json"
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def _write_json(path: Path, data) -> None:
    if isinstance(data, BaseModel):
        text = data.model_dump_json(indent=2)
    elif isinstance(data, list):
        text = json.dumps(
            [d.model_dump(mode="json") if isinstance(d, BaseModel) else d for d in data], indent=2
        )
    else:
        text = json.dumps(data, indent=2, default=str)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(text, encoding="utf-8")
    _retry(lambda: tmp.replace(path))


def _retry(fn, attempts: int = 20, delay: float = 0.05):
    """Windows locks a file while another thread or process has it open, so a read that lands while a
    write replaces the file (or the reverse) fails with PermissionError for a few milliseconds. Retry it."""
    import time

    for i in range(attempts):
        try:
            return fn()
        except PermissionError:
            if i == attempts - 1:
                raise
            time.sleep(delay)
