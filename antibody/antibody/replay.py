"""Run a family through the patient in replay mode (simulated=true), then grade it.

Concurrency 3. Hard cost cap per incident (ANTIBODY_COST_CAP_USD): stop submitting and report.
"""

import logging
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

from . import events, grade
from .config import get_settings
from .models import FamilyResult, Scenario, Verdict
from .patient_client import PatientClient
from .scorer_client import ScorerClient

log = logging.getLogger("antibody.replay")


class CostCapExceeded(RuntimeError):
    pass


class Budget:
    def __init__(self, cap_usd: float, spent: float = 0.0):
        self.cap = cap_usd
        self.spent = spent
        self._lock = threading.Lock()

    def add(self, usd: float) -> None:
        with self._lock:
            self.spent += usd

    @property
    def exceeded(self) -> bool:
        return self.spent >= self.cap


def run_family(
    incident_id: str,
    scenarios: list[Scenario],
    candidate: str,
    *,
    prompt_version: str | None = None,
    prompt_override: str | None = None,
    bug_flags: dict[str, bool] | None = None,
    patient: PatientClient | None = None,
    scorer: ScorerClient | None = None,
    budget: Budget | None = None,
    concurrency: int = 3,
) -> tuple[FamilyResult, bool]:
    """Returns (FamilyResult, is_mock)."""
    patient = patient or PatientClient()
    scorer = scorer or ScorerClient()
    budget = budget or Budget(get_settings().antibody_cost_cap_usd)
    mock = False
    verdicts: dict[str, Verdict] = {}
    tool_calls = 0
    cost = 0.0
    warnings: list[str] = []
    lock = threading.Lock()

    def one(sc: Scenario):
        if budget.exceeded:
            return sc, None
        run, m1 = patient.run(sc.domain, prompt_version=prompt_version, prompt_override=prompt_override,
                              cassette_set=sc.cassette_set, faults=sc.faults, bug_flags=bug_flags, simulated=True)
        score, m2 = scorer.score(run)
        budget.add(run.total_cost_usd or 0.0)
        return sc, (run, score, m1 or m2)

    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = [pool.submit(one, sc) for sc in scenarios]
        for fut in as_completed(futures):
            try:
                sc, res = fut.result()
            except Exception as e:
                warnings.append(f"scenario failed to run: {e}")
                log.error("scenario error: %s", e)
                continue
            if res is None:
                continue
            run, score, m = res
            with lock:
                mock = mock or m
                verdicts[sc.id] = grade.verdict(sc, run, score)
                v = verdicts[sc.id]
            events.emit(incident_id, "verdict", candidate=candidate, scenario_id=sc.id, domain=sc.domain, role=sc.role,
                        passed=v.passed, failed_checks=v.failed_checks)
            with lock:
                tool_calls += sum(1 for s in run.steps if s.kind == "tool")
                cost += run.total_cost_usd or 0.0

    if budget.exceeded:
        warnings.append(f"cost cap ${budget.cap:.2f} reached after ${budget.spent:.4f}; "
                        f"{len(scenarios) - len(verdicts)} scenarios not run")
    ordered = [verdicts[s.id] for s in scenarios if s.id in verdicts]
    result = grade.summarise(incident_id, candidate, scenarios, ordered, tool_calls, cost, warnings)
    if budget.exceeded and len(ordered) < len(scenarios):
        raise CostCapExceeded(grade.line(result))
    return result, mock
