"""Calls the patient (detection's POST /run) or the built-in stub.

Stubs are used when USE_STUBS=1 or when the detection service doesn't answer GET /health.
Every result says which one produced it, so mock data can be labelled downstream.
"""

import logging
import time

import httpx

from .config import get_settings
from .models import AgentRun, Fault
from .stubs import patient as stub_patient

log = logging.getLogger("antibody.patient")

_health_cache: dict[str, tuple[float, bool]] = {}


def service_up(url: str) -> bool:
    """GET /health with a 30 s cache."""
    cached = _health_cache.get(url)
    if cached and time.monotonic() - cached[0] < 30:
        return cached[1]
    try:
        ok = httpx.get(f"{url.rstrip('/')}/health", timeout=2.0).status_code == 200
    except httpx.HTTPError:
        ok = False
    _health_cache[url] = (time.monotonic(), ok)
    return ok


def using_stub(url: str) -> bool:
    s = get_settings()
    if s.use_stubs:
        return True
    if not service_up(url):
        log.warning("STUB IN USE: %s did not answer /health; falling back to the built-in stub", url)
        return True
    return False


class PatientClient:
    def __init__(self, url: str | None = None, timeout: float = 120.0, force_http: bool = False):
        """force_http: always call `url` (used for a patient served from a worktree)."""
        self.force_http = force_http
        self.url = (url or get_settings().patient_url).rstrip("/")
        self.timeout = timeout

    @property
    def is_stub(self) -> bool:
        return not self.force_http and using_stub(self.url)

    def run(
        self,
        domain: str,
        *,
        prompt_version: str | None = None,
        prompt_override: str | None = None,
        cassette_set: str = "base",
        faults: list[Fault] | None = None,
        bug_flags: dict[str, bool] | None = None,
        simulated: bool = True,
    ) -> tuple[AgentRun, bool]:
        """Run the patient in replay mode. Returns (run, is_mock)."""
        faults = faults or []
        if self.is_stub:
            return stub_patient.run(
                domain, prompt_version=prompt_version or "v1", prompt_override=prompt_override,
                faults=faults, simulated=simulated, bug_flags=bug_flags, cassette_set=cassette_set,
            ), True
        body = {
            "domain": domain,
            "tool_mode": "replay",  # never live from Antibody
            "cassette_set": cassette_set,
            "faults": [f.model_dump() for f in faults],
            "simulated": simulated,
        }
        if prompt_version:
            body["prompt_version"] = prompt_version
        if prompt_override:
            body["prompt_override"] = prompt_override
        if bug_flags:
            body["bug_flags"] = bug_flags
        r = httpx.post(f"{self.url}/run", json=body, timeout=self.timeout)
        r.raise_for_status()
        return AgentRun.model_validate(r.json()), r.headers.get("x-antibody-mock") == "1"
