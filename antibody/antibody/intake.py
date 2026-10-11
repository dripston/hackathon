"""Intake: poll neatlogs detections and open incidents. (Filled in during Phase 1.)"""

import logging

log = logging.getLogger("antibody.intake")


def poll_once() -> list[str]:
    """Returns ids of newly opened incidents."""
    log.info("intake: neatlogs polling not configured yet")
    return []


def watch(once: bool = False, handle: bool = True) -> int:
    poll_once()
    return 0
