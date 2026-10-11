"""Calls detection's scorer (POST /score, GET /risks, GET /runs) or the built-in stub."""

import httpx

from .config import get_settings
from .models import AgentRun, RunScore
from .patient_client import using_stub
from .stubs import scorer as stub_scorer


class ScorerClient:
    def __init__(self, url: str | None = None, timeout: float = 120.0, force_http: bool = False):
        """force_http: always call `url` (used for a patient served from a worktree)."""
        self.force_http = force_http
        self.url = (url or get_settings().scorer_url).rstrip("/")
        self.timeout = timeout

    @property
    def is_stub(self) -> bool:
        return not self.force_http and using_stub(self.url)

    def score(self, run: AgentRun) -> tuple[RunScore, bool]:
        if self.is_stub:
            return stub_scorer.score(run), True
        r = httpx.post(f"{self.url}/score", json=run.model_dump(mode="json"), timeout=self.timeout)
        r.raise_for_status()
        return RunScore.model_validate(r.json()), r.headers.get("x-antibody-mock") == "1"

    def risks(self) -> tuple[list[dict], bool]:
        """Passthrough of detection's /risks. Stub: empty list (we never invent forecasts)."""
        if self.is_stub:
            return [], True
        try:
            r = httpx.get(f"{self.url}/risks", timeout=10.0)
            r.raise_for_status()
            return r.json(), r.headers.get("x-antibody-mock") == "1"
        except httpx.HTTPError:
            return [], True

    def recent_runs(self, limit: int = 50) -> tuple[list[dict], bool]:
        """detection's GET /runs: [{run, score}] for recent real runs."""
        if self.is_stub:
            return [], True
        r = httpx.get(f"{self.url}/runs", params={"limit": limit}, timeout=10.0)
        r.raise_for_status()
        return r.json(), r.headers.get("x-antibody-mock") == "1"
