"""Runs the stages in order, one JSON file per stage under .state/incidents/<id>/.

Stages whose output exists are skipped unless force=True.
Acceptance rule: all must_fix pass AND all must_not_change pass. Max 3 attempts, then escalate.
"""

import logging
import os
import re
import time
from pathlib import Path
from typing import Callable

from . import apply, breed, diagnose, events, fix, git_tools, grade, llm, replay, ship, tracing
from .config import REPO_ROOT
from .models import (Approval, Attempt, Diagnosis, FamilyResult, Incident, Resolution, Scenario)
from .patient_client import PatientClient
from .scorer_client import ScorerClient
from .state import StateStore, now_iso

log = logging.getLogger("antibody.pipeline")

STAGES = ["diagnosis", "family", "baseline", "attempts", "resolution"]
MAX_ATTEMPTS = 3


class Pipeline:
    def __init__(self, store: StateStore | None = None, echo: Callable[[str], None] = print,
                 ship_mock: bool = False, on_stage: Callable[[str], None] | None = None):
        self.store = store or StateStore()
        self.echo = echo
        self.on_stage = on_stage  # called just before a stage runs (used by the narrated demo)
        self.ship_mock = ship_mock

    # ---------- helpers ----------
    def _incident(self, iid: str) -> Incident:
        return self.store.read(iid, "incident", Incident)

    def _status(self, inc: Incident, status: str) -> Incident:
        inc.status = status
        self.store.write(inc.id, "incident", inc)
        return inc

    def _mock(self, iid: str, is_mock: bool, source: str) -> None:
        if is_mock:
            self.store.mark_mock(iid, source)

    def open_incident(self, inc: Incident) -> Incident:
        if not self.store.has(inc.id, "incident"):
            self.store.write(inc.id, "incident", inc)
        return self._incident(inc.id)

    # ---------- run ----------
    def handle(self, inc: Incident, force: bool = False) -> Incident:
        inc = self.open_incident(inc)
        t0 = time.monotonic()
        cost0 = llm.ledger.usd
        budget = replay.Budget(self._cap())
        if force:
            for st in STAGES:
                self.store.delete(inc.id, st)
            self.store.delete(inc.id, "evidence")
            self.store.delete(inc.id, "meta")
            apply.cleanup(inc.id)
            inc = self._status(inc, "open")
        ctx = {"t0": t0, "cost0": cost0, "budget": budget}
        for stage in STAGES:
            if self.store.has(inc.id, stage):
                self.echo(f"[{stage:<10}] skip (already done)")
                continue
            inc = self._incident(inc.id)
            if inc.status in ("escalated",) and stage != "resolution":
                self.echo(f"[{stage:<10}] skip (incident escalated)")
                continue
            if self.on_stage:
                self.on_stage(stage)
            events.emit(inc.id, "stage", stage=stage, status="start")
            try:
                with tracing.span(f"antibody.{stage}", kind="WORKFLOW" if stage == "diagnosis" else "CHAIN",
                                  **{"antibody.incident_id": inc.id, "antibody.detection": inc.detection}):
                    msg = getattr(self, f"stage_{stage}")(inc, ctx)
            except replay.CostCapExceeded as e:
                self._status(inc, "escalated")
                self.store.write(inc.id, "escalation", {"reason": f"cost cap reached: {e}", "at": now_iso()})
                self.echo(f"[{stage:<10}] STOP cost cap reached ({e})")
                break
            self.echo(f"[{stage:<10}] {msg}")
            events.emit(inc.id, "stage", stage=stage, status="done", text=msg)
        return self._incident(inc.id)

    def _cap(self) -> float:
        from .config import get_settings
        return get_settings().antibody_cost_cap_usd

    # ---------- stages ----------
    def stage_diagnosis(self, inc: Incident, ctx) -> str:
        self._status(inc, "diagnosing")
        diag, mock, evidence = diagnose.diagnose(inc)
        self._mock(inc.id, mock, "diagnosis")
        self.store.write(inc.id, "evidence", evidence)
        self.store.write(inc.id, "diagnosis", diag)
        who = f"commit {diag.commit_sha[:8]}" if diag.commit_sha else "no commit found"
        why = {"entire_checkpoint": " + Entire checkpoint reasoning",
               "commit_message": " + reasoning from commit message (no Entire checkpoint)"}.get(diag.reasoning_source or "", "")
        return f"{diag.fix_kind} on {diag.target_file} ({who}{why})"

    def stage_family(self, inc: Incident, ctx) -> str:
        diag = self.store.read(inc.id, "diagnosis", Diagnosis)
        evidence = self.store.read(inc.id, "evidence") or {}
        stub = PatientClient().is_stub
        # FAMILY_SIZE: smaller families for live drills on rate-limited LLMs (default 10).
        size = int(os.environ.get("FAMILY_SIZE", "10") or 10)
        scenarios = breed.breed(inc, diag, evidence, stub=stub, size=size)
        self.store.write(inc.id, "family", scenarios)
        for sc in scenarios:
            f = sc.faults[0] if sc.faults else None
            events.emit(inc.id, "scenario", id=sc.id, role=sc.role, domain=sc.domain,
                        fault=f"{f.tool} → {f.error.code}" if f else None)
        n_fix = sum(s.role == "must_fix" for s in scenarios)
        return f"{len(scenarios)} scenarios ({n_fix} must_fix, {len(scenarios) - n_fix} must_not_change)"

    def _scenarios(self, iid: str) -> list[Scenario]:
        return [Scenario.model_validate(s) for s in self.store.read(iid, "family")]

    def stage_baseline(self, inc: Incident, ctx) -> str:
        self._status(inc, "simulating")
        diag = self.store.read(inc.id, "diagnosis", Diagnosis)
        scenarios = self._scenarios(inc.id)
        result, mock = replay.run_family(inc.id, scenarios, "baseline", prompt_version=diag.prompt_version,
                                         bug_flags=diag.bug_flags or None, budget=ctx["budget"])
        self._mock(inc.id, mock, "baseline")
        self.store.write(inc.id, "baseline", result)
        note = "" if result.must_fix_passed < result.must_fix_total else " (WARNING: failure not reproduced)"
        return f"baseline {grade.line(result)}{note}"

    def evaluate(self, inc: Incident, diag: Diagnosis, scenarios: list[Scenario], candidate: str,
                 new_content: str, worktree: Path, budget) -> tuple[FamilyResult, bool]:
        if diag.fix_kind == "tool_wrapper_patch":
            stub = PatientClient().is_stub
            events.emit(inc.id, "cmd", cmd=f"cd {worktree.name}/detection && uv run detection serve",
                        out=f"starting the patient from the {candidate} branch to replay the family")
            with apply.patient_service(worktree, stub=stub) as url:
                return replay.run_family(
                    inc.id, scenarios, candidate, prompt_version=diag.prompt_version,
                    bug_flags=diag.bug_flags or None, budget=budget,
                    patient=PatientClient(url, force_http=True), scorer=ScorerClient(url, force_http=True),
                )
        return replay.run_family(inc.id, scenarios, candidate, prompt_override=new_content,
                                 bug_flags=diag.bug_flags or None, budget=budget)

    def stage_attempts(self, inc: Incident, ctx) -> str:
        diag = self.store.read(inc.id, "diagnosis", Diagnosis)
        scenarios = self._scenarios(inc.id)
        baseline = self.store.read(inc.id, "baseline", FamilyResult)
        if grade.accepts(baseline):
            self._status(inc, "escalated")
            self.store.write(inc.id, "attempts", [])
            return "baseline already passes the whole family: failure not reproduced, escalating"
        if not diag.target_file or not (REPO_ROOT / diag.target_file).exists():
            self._status(inc, "escalated")
            self.store.write(inc.id, "attempts", [])
            return f"no file to fix ({diag.target_file}); escalating"
        self._status(inc, "fixing")
        content = (REPO_ROOT / diag.target_file).read_text(encoding="utf-8")
        attempts: list[Attempt] = []
        previous: list[dict] = []
        last = baseline
        for n in range(1, MAX_ATTEMPTS + 1):
            events.emit(inc.id, "llm", purpose=f"write fix {n} for {diag.target_file}", status="start",
                        model=llm._model("strong") or None)
            cand, new_content, mock = fix.propose(diag, content, last, scenarios, n, previous,
                                                  change_diff=(self.store.read(inc.id, "evidence") or {}).get("change_diff"))
            self._mock(inc.id, mock, f"fix_{n}")
            events.emit(inc.id, "llm", purpose=f"write fix {n}", status="done")
            events.emit(inc.id, "code", file=diag.target_file, attempt=n, fix_id=cand.id,
                        description=cand.description, diff=cand.diff)
            if not cand.diff.strip():
                attempts.append(Attempt(fix=cand, error="empty diff"))
                previous.append({"description": cand.description, "diff": "", "failing": "no change produced"})
                self.store.write(inc.id, "attempts", attempts)
                continue
            wt = apply.create(inc.id, n, diag.target_file, new_content,
                              f"Antibody {cand.id} for {inc.id}\n\n{cand.description}")
            cand.branch = wt.branch
            try:
                result, rmock = self.evaluate(inc, diag, scenarios, cand.id, new_content, wt.path, ctx["budget"])
            except replay.CostCapExceeded:
                attempts.append(Attempt(fix=cand, error="cost cap reached"))
                self.store.write(inc.id, "attempts", attempts)
                raise
            except Exception as e:
                attempts.append(Attempt(fix=cand, error=str(e)))
                self.store.write(inc.id, "attempts", attempts)
                self.echo(f"[attempts  ] {cand.id} could not be evaluated: {e}")
                continue
            self._mock(inc.id, rmock, f"replay_{n}")
            ok = grade.accepts(result)
            events.emit(inc.id, "note", text=f"{cand.id}: {grade.line(result)} -> {'ACCEPTED' if ok else 'rejected'}",
                        tone="good" if ok else "bad")
            attempts.append(Attempt(fix=cand, result=result, accepted=ok))
            self.store.write(inc.id, "attempts", attempts)
            self.echo(f"[attempts  ] {cand.id}: {grade.line(result)} -> {'ACCEPTED' if ok else 'rejected'}")
            if ok:
                apply.cleanup(inc.id, keep_attempt=n)
                return f"accepted {cand.id} after {n} attempt(s)"
            previous.append({"description": cand.description, "diff": cand.diff,
                             "failing": [v.model_dump() for v in result.verdicts if not v.passed]})
            last = result
        self._status(inc, "escalated")
        apply.cleanup(inc.id)
        return f"no fix accepted after {MAX_ATTEMPTS} attempts; escalated"

    def stage_resolution(self, inc: Incident, ctx) -> str:
        inc = self._incident(inc.id)
        baseline = self.store.read(inc.id, "baseline", FamilyResult)
        attempts = [Attempt.model_validate(a) for a in (self.store.read(inc.id, "attempts") or [])]
        accepted = next((a for a in attempts if a.accepted), None)
        cost = (llm.ledger.usd - ctx["cost0"]) + ctx["budget"].spent
        duration = int((time.monotonic() - ctx["t0"]) * 1000)
        res = Resolution(
            incident_id=inc.id, accepted_fix_id=accepted.fix.id if accepted else None,
            before=baseline, after=accepted.result if accepted else None,
            attempts=[a.fix.id for a in attempts], cost_usd=round(cost, 6), duration_ms=duration,
        )
        note = ""
        if accepted:
            diag = self.store.read(inc.id, "diagnosis", Diagnosis)
            wt = apply.worktree_for(inc.id, accepted.fix.attempt)
            mock = self.store.is_mock(inc.id)
            out = ship.ship(inc, diag, self._scenarios(inc.id), accepted.fix, wt, baseline, accepted.result,
                            res.cost_usd, duration, mock, allow_mock_pr=self.ship_mock)
            res.pr_url = out["pr_url"]
            note = out["note"]
            self._status(inc, "awaiting_approval")
        self.store.write(inc.id, "resolution", res)
        if accepted:
            return f"{accepted.fix.id} ready for approval; PR: {res.pr_url or 'none'} {note}".rstrip()
        return "escalated with everything learned (see attempts.json)"


# ---------- approval ----------
APPROVAL_RE = re.compile(r"^approve fix (\d+)$")


class ApprovalError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def parse_approval(phrase: str) -> int | None:
    """'approve fix <n>' exactly, trimmed, case-insensitive. Anything else (yes/ok/do it) is None."""
    m = APPROVAL_RE.match((phrase or "").strip().lower())
    return int(m.group(1)) if m else None


def approve(store: StateStore, incident_id: str, fix_id: str, phrase: str, channel: str,
            merge: Callable[[str], None] | None = None) -> Resolution:
    n = parse_approval(phrase)
    if n is None:
        raise ApprovalError("Not an approval phrase")
    if fix_id != f"fix_{n}":
        raise ApprovalError(f"Phrase approves fix {n}, but the request is for {fix_id}")
    inc = store.read(incident_id, "incident", Incident)
    res = store.read(incident_id, "resolution", Resolution)
    if inc is None or res is None:
        raise ApprovalError("Unknown incident or nothing to approve", 404)
    if res.accepted_fix_id != fix_id:
        raise ApprovalError(f"{fix_id} is not the accepted fix ({res.accepted_fix_id})", 409)
    if inc.status != "awaiting_approval":
        raise ApprovalError(f"Incident is {inc.status}, not awaiting approval", 409)
    res.approval = Approval(phrase=phrase.strip(), channel=channel, at=now_iso())
    events.emit(incident_id, "note", text=f"Approved by {channel}: “{phrase.strip()}”", tone="good")
    if res.pr_url:
        events.emit(incident_id, "cmd", cmd=events.cmdline("gh", "pr", "merge", res.pr_url, "--squash"), out="")
        (merge or _gh_merge)(res.pr_url)
        res.merged = True
        events.emit(incident_id, "pr", action="merged", url=res.pr_url)
    elif _ship_target() == "local":
        _local_merge(store, incident_id, fix_id)
        res.merged = True
        events.emit(incident_id, "pr", action="merged", url=None)
    store.write(incident_id, "resolution", res)
    inc.status = "resolved"
    store.write(incident_id, "incident", inc)
    return res


def reject(store: StateStore, incident_id: str, fix_id: str, reason: str) -> Resolution:
    inc = store.read(incident_id, "incident", Incident)
    res = store.read(incident_id, "resolution", Resolution)
    if inc is None or res is None:
        raise ApprovalError("Unknown incident or nothing to reject", 404)
    res.rejection = {"fix_id": fix_id, "reason": reason, "at": now_iso()}
    store.write(incident_id, "resolution", res)
    inc.status = "escalated"
    store.write(incident_id, "incident", inc)
    return res


def _gh_merge(pr_url: str) -> None:
    git_tools.gh("pr", "merge", pr_url, "--squash")


def _ship_target() -> str:
    from .config import get_settings
    return get_settings().ship_target


def _local_merge(store: StateStore, incident_id: str, fix_id: str) -> None:
    """SHIP_TARGET=local: merge the accepted fix branch into the checkout's current branch (never pushed)."""
    attempts = [Attempt.model_validate(a) for a in (store.read(incident_id, "attempts") or [])]
    branch = next((a.fix.branch for a in attempts if a.fix.id == fix_id and a.fix.branch), None)
    if not branch:
        raise ApprovalError(f"No local branch recorded for {fix_id}", 409)
    events.emit(incident_id, "cmd", cmd=events.cmdline("git", "merge", "--no-ff", branch), out="Merge made by the 'ort' strategy.")
    git_tools.git("merge", "--no-ff", "-m", f"Merge Antibody {fix_id} for {incident_id}", branch)
