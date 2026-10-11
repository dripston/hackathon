"""What happens after an approval merges a fix: pull main, gate main against every immunity family,
and refresh the backtest behind GET /trust. Runs in the background; one at a time."""

import json
import logging
import threading

from . import git_tools
from .state import StateStore, now_iso

log = logging.getLogger("antibody.aftercare")
_lock = threading.Lock()


def _status(store: StateStore, **fields) -> None:
    path = store.root / "aftercare.json"
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    data.update(fields, updated_at=now_iso())
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def status(store: StateStore) -> dict:
    path = store.root / "aftercare.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"state": "idle"}


def after_merge(incident_id: str, store: StateStore | None = None) -> None:
    from .gate import backtest, run_gate

    store = store or StateStore()
    if not _lock.acquire(blocking=False):
        log.info("aftercare already running; %s will be covered by it", incident_id)
        return
    try:
        _status(store, state="pulling", incident_id=incident_id, error=None)
        out = git_tools.git("pull", "--ff-only", check=False)
        log.info("aftercare: git pull: %s", (out or "").strip()[-200:])
        _status(store, state="gating", pulled=(out or "").strip()[-200:])
        report, _ = run_gate("main", store, echo=lambda m: log.info("gate: %s", m))
        _status(store, state="backtesting", gate_verdict=report.verdict)
        summary = backtest(store, echo=lambda m: log.info("backtest: %s", m))
        _status(store, state="done", backtest_caught=summary.get("caught"), backtest_families=summary.get("families"))
    except Exception as e:  # keep the API alive; the console shows the error
        log.exception("aftercare failed")
        _status(store, state="failed", error=str(e)[:300])
    finally:
        _lock.release()


def start(incident_id: str) -> None:
    threading.Thread(target=after_merge, args=(incident_id,), daemon=True, name="aftercare").start()
