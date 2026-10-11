"""Stub stand-in for detection's GET /runs: a small batch of seeded 'production' runs.

Used only when detection isn't available, so diagnosis can run the same code path on stubs.
Every run here is MOCK and comes from the seeded-bug prompt versions.
"""

import random

from ..models import Fault, ToolError
from . import patient, scorer
from .data import COMPANIES

# Which seeded bug each detection comes from (stub only; real diagnosis infers it from traces).
BUG_FOR_DETECTION = {
    "tw_invented_person": {"prompt_version": "v2", "bug_flags": {}},
    "tw_company_match_skipped": {"prompt_version": "v3", "bug_flags": {}},
    "tw_empty_after_error": {"prompt_version": "v1", "bug_flags": {"swallow_tool_errors": True}},
    "tw_claimed_success_on_failure": {"prompt_version": "v1", "bug_flags": {"swallow_tool_errors": True}},
}


def recent_runs(detection: str, n: int = 24, seed: int = 7) -> list[dict]:
    rng = random.Random(seed)
    bug = BUG_FOR_DETECTION.get(detection, BUG_FOR_DETECTION["tw_invented_person"])
    domains = sorted(COMPANIES)
    out = []
    for i in range(n):
        domain = domains[i % len(domains)]
        # The first third of traffic predates the bad change: healthy prompt, no bug flags.
        before = i < n // 3
        faults = []
        if rng.random() < 0.3:
            faults = [Fault(tool="crustdata.people_search", at_call=1, error=ToolError(code="HTTP_429", message="rate limited"))]
        run = patient.run(
            domain,
            prompt_version="v1" if before else bug["prompt_version"],
            faults=faults,
            simulated=False,
            bug_flags={} if before else bug["bug_flags"],
        )
        run.trace_id = f"trace_stub_{i:03d}"
        out.append({"run": run.model_dump(mode="json"), "score": scorer.score(run).model_dump(mode="json")})
    return out
