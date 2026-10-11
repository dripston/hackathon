"""neatlogs tracing for the patient (workflow "company-research"). No-op without NEATLOGS_API_KEY.

Custom attributes (shared names from /CONTRACT.md) are set on the run's root span:
antibody.run_id, antibody.prompt_version, antibody.bug_flags, antibody.simulated, antibody.violations,
antibody.tw.<check_id> (1 = failed), antibody.jev.<check> (score 0..1).
"""

import atexit
import json
import logging
from contextlib import contextmanager

from .config import get_settings

log = logging.getLogger("detection.tracing")
_nl = None
_started = False


def init() -> bool:
    global _nl, _started
    if _started:
        return _nl is not None
    _started = True
    key = get_settings().neatlogs_api_key
    if not key:
        log.info("neatlogs: no NEATLOGS_API_KEY, tracing disabled")
        return False
    try:
        import neatlogs

        neatlogs.init(api_key=key, workflow_name="company-research")
        _nl = neatlogs
        atexit.register(shutdown)
        return True
    except Exception as e:  # tracing must never break the patient
        log.warning("neatlogs init failed: %s", e)
        return False


def wrap(client):
    if init():
        try:
            return _nl.wrap(client)
        except Exception as e:
            log.warning("neatlogs wrap failed: %s", e)
    return client


@contextmanager
def run_span(name: str = "company-research"):
    """Root span for one patient run. Yields (span or None, trace_id or None)."""
    if not init():
        yield None, None
        return
    try:
        cm = _nl.trace(name, kind="WORKFLOW")
        span = cm.__enter__()
    except Exception as e:
        log.warning("neatlogs span failed: %s", e)
        yield None, None
        return
    trace_id = None
    try:
        ctx = span.get_span_context()
        trace_id = format(ctx.trace_id, "032x") if ctx and ctx.trace_id else None
    except Exception:
        pass
    try:
        yield span, trace_id
    finally:
        cm.__exit__(None, None, None)


def set_attributes(span, attrs: dict) -> None:
    """The SDK exports only `neatlogs.*` keys; custom tags travel as one JSON string in
    `neatlogs.metadata`, which neatlogs search and conditional detections match on (compact JSON:
    a detection can test `"antibody.tw.tw_empty_after_error":1`)."""
    if span is None:
        return
    for k, v in attrs.items():
        try:
            span.set_attribute(k, v if isinstance(v, (str, int, float, bool)) else json.dumps(v))
        except Exception:
            pass
    blob = json.dumps(attrs, separators=(",", ":"), sort_keys=True)
    try:
        span.set_attribute("neatlogs.metadata", blob)
    except Exception:
        pass
    # Attributes set after a span starts don't reliably reach neatlogs, so the scores also go on a
    # short child span created with them: name `antibody.score`, input/output = the compact JSON.
    # The neatlogs detections match `span_name = antibody.score` and `output contains ...`.
    if _nl is not None:
        try:
            with _nl.trace("antibody.score", kind="CHAIN", **{"neatlogs.metadata": blob, "input.value": blob,
                                                             "output.value": blob}) as child:
                child.set_attribute("output.value", blob)
        except Exception as e:
            log.debug("score span failed: %s", e)


def flush() -> None:
    if _nl is not None:
        try:
            _nl.flush()
        except Exception:
            pass


def shutdown() -> None:
    if _nl is None:
        return
    for fn in ("flush", "shutdown"):
        try:
            getattr(_nl, fn)()
        except Exception:
            pass
