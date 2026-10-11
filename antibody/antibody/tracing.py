"""neatlogs tracing for Antibody's own work (workflow "antibody"). No-op without NEATLOGS_API_KEY."""

import atexit
import logging

from .config import get_settings

log = logging.getLogger("antibody.tracing")
_started = False
_nl = None


def init() -> bool:
    global _started, _nl
    if _started:
        return _nl is not None
    _started = True
    key = get_settings().neatlogs_api_key
    if not key:
        log.info("neatlogs: no NEATLOGS_API_KEY, tracing disabled")
        return False
    try:
        import neatlogs

        neatlogs.init(api_key=key, workflow_name="antibody")
        _nl = neatlogs
        atexit.register(shutdown)
        log.info("neatlogs: tracing on (workflow=antibody)")
        return True
    except Exception as e:  # tracing must never break the pipeline
        log.warning("neatlogs: init failed (%s); tracing disabled", e)
        return False


def wrap(client):
    """Wrap an LLM client so its calls are traced (if neatlogs is on)."""
    if init() and hasattr(_nl, "wrap"):
        try:
            return _nl.wrap(client)
        except Exception as e:
            log.warning("neatlogs: wrap failed (%s); client not traced", e)
    return client


def shutdown() -> None:
    if _nl is None:
        return
    for fn in ("flush", "shutdown"):
        try:
            getattr(_nl, fn)()
        except Exception:
            pass
