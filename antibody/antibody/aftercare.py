"""What happens after an approval merges a fix: pull main, gate main against every immunity family,
and refresh the backtest behind GET /trust. Runs in the background; one at a time."""

import json
import logging
import threading

from . import git_tools
from .config import get_settings
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


_pending = threading.Event()


def after_merge(incident_id: str, store: StateStore | None = None) -> None:
    """Pull main, gate it and refresh the backtest. A merge that lands while this runs is not lost: the
    job runs once more afterwards, so main is gated with every merged family."""
    from .gate import backtest, run_gate

    store = store or StateStore()
    if not _lock.acquire(blocking=False):
        _pending.set()
        log.info("aftercare already running; it will run again for %s", incident_id)
        return
    try:
        while True:
            _pending.clear()
            s = get_settings()
            _status(store, state="pulling", incident_id=incident_id, error=None)
            out = git_tools.git("pull", "--ff-only", check=False) if s.ship_target == "github" else "local merge, nothing to pull"
            log.info("aftercare: git pull: %s", (out or "").strip()[-200:])
            _status(store, state="gating", pulled=(out or "").strip()[-200:])
            report, _ = run_gate(s.deploy_branch, store, echo=lambda m: log.info("gate: %s", m))
            _status(store, state="backtesting", gate_verdict=report.verdict)
            summary = backtest(store, echo=lambda m: log.info("backtest: %s", m))
            _status(store, state="done", backtest_caught=summary.get("caught"),
                    backtest_families=summary.get("families"))
            if not _pending.is_set():
                break
    except Exception as e:  # keep the API alive; the console shows the error
        log.exception("aftercare failed")
        _status(store, state="failed", error=str(e)[:300])
    finally:
        _lock.release()


def start(incident_id: str) -> None:
    threading.Thread(target=after_merge, args=(incident_id,), daemon=True, name="aftercare").start()
