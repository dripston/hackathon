"""The 3-5 sentence incident brief for the console and the voice agent. Built from stored files;
the model is used only for the 'why' sentence (when one is configured)."""

import logging

from . import grade, llm
from .models import Attempt, Diagnosis, FamilyResult, Incident, Resolution
from .state import StateStore

log = logging.getLogger("antibody.brief")

PLAIN = {
    "tw_invented_person": "the research agent named people who never appeared in its data",
    "tw_empty_after_error": "the research agent reported no decision makers when its people search had actually failed",
    "tw_company_match_skipped": "the research agent used company data without confirming it was the right company",
    "tw_claimed_success_on_failure": "the research agent said its research was complete when a tool had failed",
    "jev_grounded_low": "the research agent's briefs stopped being grounded in its tool results",
}

WHY_SYSTEM = ("In one plain sentence (max 35 words), say why this failure happened, for an engineer hearing it "
              "on a phone call. Use only the evidence given. No preamble.")


def build(store: StateStore, incident_id: str) -> str:
    inc = store.read(incident_id, "incident", Incident)
    if inc is None:
        raise KeyError(incident_id)
    diag = store.read(incident_id, "diagnosis", Diagnosis)
    before = store.read(incident_id, "baseline", FamilyResult)
    res = store.read(incident_id, "resolution", Resolution)
    attempts = [Attempt.model_validate(a) for a in (store.read(incident_id, "attempts") or [])]

    s = [f"Since {inc.first_seen[:16].replace('T', ' ')} UTC, {PLAIN.get(inc.detection, inc.detection)}, "
         f"with no errors or crashes."]
    if diag:
        why = None
        if llm.available("cheap"):
            try:
                why = llm.complete("cheap", WHY_SYSTEM,
                                   f"Explanation: {diag.explanation}\nOriginal reasoning: {diag.reasoning_excerpt}",
                                   200).text.strip()
            except Exception as e:
                log.warning("brief LLM failed: %s", e)
        if not why:
            why = (f"It started with commit {diag.commit_sha[:7]}" if diag.commit_sha else "The cause is unconfirmed")
            if diag.reasoning_excerpt:
                why += f", made because \"{diag.reasoning_excerpt[:140].rstrip()}\""
            why += "."
        s.append(why)
    accepted = next((a for a in attempts if a.accepted), None)
    if accepted and before:
        s.append(f"Proposed fix {accepted.fix.attempt}: {accepted.fix.description.rstrip('.')}.")
        s.append(f"Across {before.must_fix_total + before.must_not_change_total} simulated variants it went from "
                 f"{before.must_fix_passed} of {before.must_fix_total} failures fixed to "
                 f"{accepted.result.must_fix_passed} of {accepted.result.must_fix_total}, "
                 f"with {accepted.result.must_not_change_passed} of {accepted.result.must_not_change_total} healthy cases unchanged.")
        if inc.status == "awaiting_approval":
            s.append(f"Say \"approve fix {accepted.fix.attempt}\" to merge it.")
    elif inc.status == "escalated":
        s.append(f"No fix passed the whole family after {len(attempts)} attempt(s), so it needs a human.")
    elif before:
        s.append(f"Baseline on the simulated family: {grade.line(before)}.")
    if res and res.approval:
        s.append(f"Approved by {res.approval.channel} at {res.approval.at}.")
    return " ".join(s[:5])
