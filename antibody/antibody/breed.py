"""Turn one incident into a deterministic family of ~10 scenarios.

must_fix (6-7): the failing domains, similar recorded domains, and the same domain with faults at
different calls (429 on call 1 vs 2, timeout, empty).
must_not_change (3-4): healthy domains that must stay correct.
"""

import hashlib
import random

from .config import REPO_ROOT
from .models import Diagnosis, Fault, Incident, Scenario, ToolError
from .stubs.data import COMPANIES

TRIPWIRES = ["tw_invented_person", "tw_empty_after_error", "tw_company_match_skipped", "tw_claimed_success_on_failure"]

PEOPLE = "crustdata.people_search"
JOBS = "crustdata.jobs"
ENRICH = "crustdata.company_enrich"


def _err(code: str) -> ToolError:
    return ToolError(code=code, message={"HTTP_429": "rate limited", "HTTP_500": "server error",
                                         "TIMEOUT": "timed out", "EMPTY": "empty result"}.get(code, code))


# Fault variants worth trying for each detection: (tool, at_call, code).
FAULT_VARIANTS = {
    "tw_invented_person": [(PEOPLE, 1, "EMPTY"), (PEOPLE, 1, "HTTP_429"), (PEOPLE, 1, "TIMEOUT")],
    "tw_empty_after_error": [(PEOPLE, 1, "HTTP_429"), (PEOPLE, 2, "HTTP_429"), (PEOPLE, 1, "TIMEOUT"), (PEOPLE, 1, "HTTP_500")],
    "tw_company_match_skipped": [(ENRICH, 1, "EMPTY")],
    "tw_claimed_success_on_failure": [(JOBS, 1, "HTTP_429"), (JOBS, 1, "TIMEOUT"), (JOBS, 1, "HTTP_500")],
}


def catalogue(stub: bool) -> list[str]:
    """Domains that have recordings."""
    if stub:
        return sorted(COMPANIES)
    f = REPO_ROOT / "detection" / "fixtures" / "domains.txt"
    if f.exists():
        return [l.strip() for l in f.read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")]
    return []


def _seed(incident_id: str) -> int:
    return int(hashlib.sha256(incident_id.encode()).hexdigest()[:8], 16)


def breed(incident: Incident, diagnosis: Diagnosis, evidence: dict, stub: bool, size: int = 10) -> list[Scenario]:
    rng = random.Random(_seed(incident.id))
    det = incident.detection
    failing = evidence.get("failing_domains") or list(dict.fromkeys(f["domain"] for f in evidence.get("failing", []) if f.get("domain")))
    healthy = evidence.get("healthy_domains") or [d for d in dict.fromkeys(h["domain"] for h in evidence.get("healthy", []) if h.get("domain")) if d not in failing]
    cat = catalogue(stub) or list(dict.fromkeys(failing + healthy))

    n_fix = 7 if size >= 10 else max(3, size - 3)
    n_keep = size - n_fix

    # must_not_change: domains seen healthy and never failing, topped up from the catalogue.
    keep_pool = sorted(healthy)
    rng.shuffle(keep_pool)
    extra = [d for d in cat if d not in failing and d not in keep_pool]
    rng.shuffle(extra)
    keep = (keep_pool + extra)[:n_keep]

    must_fix: list[tuple[str, list[Fault]]] = []
    seen: set = set()

    def add(domain: str, faults: list[Fault], limit: int = n_fix) -> None:
        key = (domain, tuple((f.tool, f.at_call, f.error.code) for f in faults))
        if key not in seen and len(must_fix) < limit:
            seen.add(key)
            must_fix.append((domain, faults))

    # 1. the failures as seen in production (with the faults they hit, if any), at most 3
    for f in evidence.get("failing", []):
        faults = [Fault(tool=te.split(":", 1)[0], at_call=1, error=_err(te.split(":", 1)[1]))
                  for te in f.get("tool_errors", [])]
        add(f["domain"], faults, limit=3)
    # 2. the first failing domain under different faults (leave room for 2 similar domains)
    anchor = failing[0] if failing else (cat[0] if cat else "example.com")
    for tool, at, code in FAULT_VARIANTS.get(det, []):
        add(anchor, [Fault(tool=tool, at_call=at, error=_err(code))], limit=n_fix - 2)
    # 3. the other failing domains, then similar recorded domains the incident hasn't touched
    for d in failing[1:]:
        add(d, [])
    similar = [d for d in cat if d not in failing and d not in keep]
    rng.shuffle(similar)
    for d in similar:
        add(d, [])

    scenarios = []
    for i, (d, fl) in enumerate(must_fix, 1):
        scenarios.append(Scenario(id=f"sc_{i:02d}", incident_id=incident.id, role="must_fix", domain=d,
                                  faults=fl, cassette_set="base", expected_checks=[det]))
    for j, d in enumerate(keep, len(must_fix) + 1):
        scenarios.append(Scenario(id=f"sc_{j:02d}", incident_id=incident.id, role="must_not_change", domain=d,
                                  faults=[], cassette_set="base", expected_checks=TRIPWIRES))
    return scenarios
