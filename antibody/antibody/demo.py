"""`antibody demo`: the golden path, narrated for the video. Same pipeline as `handle`, readable output."""

import json
import time
from pathlib import Path

from . import brief, grade
from .models import Attempt, Diagnosis, FamilyResult, Incident, Resolution
from .pipeline import Pipeline
from .state import StateStore

BOLD, DIM, GREEN, RED, YELLOW, CYAN, RESET = "\033[1m", "\033[2m", "\033[32m", "\033[31m", "\033[33m", "\033[36m", "\033[0m"

LABELS = {
    "diagnosis": "Diagnosing: what changed, which commit, and why",
    "family": "Breeding a family of variants from one incident",
    "baseline": "Replaying the family on recorded tool responses (before)",
    "attempts": "Writing the smallest fix and proving it on the whole family",
    "resolution": "Shipping: pull request + immunity for the pre-deploy gate",
}


def _say(text: str = "", color: str = "") -> None:
    print(f"{color}{text}{RESET}" if color else text, flush=True)


def run(file: str, ship_mock: bool = False, pause: float = 0.6) -> int:
    store = StateStore()
    inc = Incident.model_validate(json.loads(Path(file).read_text(encoding="utf-8")))
    _say()
    _say(f"  ANTIBODY  ·  incident {inc.id}", BOLD)
    _say(f"  detection {inc.detection} fired; the agent returned 200 OK the whole time.", DIM)
    _say()
    t0 = time.monotonic()

    def echo(line: str) -> None:
        stage = line[1:].split("]")[0].strip()
        body = line.split("]", 1)[1].strip() if "]" in line else line
        if body.startswith("fix_"):
            color = GREEN if "ACCEPTED" in body else RED
            _say(f"      {body}", color)
            return
        _say(f"  ▸ {LABELS.get(stage, stage)}", CYAN)
        _say(f"      {body}")
        time.sleep(pause)

    out = Pipeline(store, echo=echo, ship_mock=ship_mock).handle(inc, force=True)

    diag = store.read(inc.id, "diagnosis", Diagnosis)
    base = store.read(inc.id, "baseline", FamilyResult)
    attempts = [Attempt.model_validate(a) for a in store.read(inc.id, "attempts") or []]
    res = store.read(inc.id, "resolution", Resolution)
    accepted = next((a for a in attempts if a.accepted), None)

    _say()
    _say("  WHY IT BROKE", BOLD)
    _say(f"      {diag.explanation}")
    if diag.reasoning_excerpt:
        src = "Entire checkpoint" if diag.reasoning_source == "entire_checkpoint" else "commit message"
        _say(f"      reason recorded in the {src}: \"{diag.reasoning_excerpt[:200]}\"", YELLOW)
    if accepted:
        _say()
        _say(f"  THE FIX ({accepted.fix.id})", BOLD)
        for line in accepted.fix.diff.splitlines():
            if line.startswith(("+++", "---", "@@")):
                continue
            if line.startswith("+"):
                _say(f"      {line}", GREEN)
            elif line.startswith("-"):
                _say(f"      {line}", RED)
        _say()
        _say("  PROOF", BOLD)
        _say(f"      before: {grade.line(base)}")
        _say(f"      after:  {grade.line(accepted.result)}", GREEN)
    _say()
    _say("  BRIEF FOR THE ON-CALL ENGINEER (what the voice agent reads)", BOLD)
    _say(f"      {brief.build(store, inc.id)}")
    _say()
    _say(f"  status: {out.status}  ·  PR: {res.pr_url if res and res.pr_url else 'not opened'}  ·  "
         f"{time.monotonic() - t0:.0f} s  ·  ${res.cost_usd if res else 0:.4f}", DIM)
    if store.is_mock(inc.id):
        _say("  (MOCK: the patient and scorer were Antibody's stubs for this run)", YELLOW)
    _say()
    return 0
