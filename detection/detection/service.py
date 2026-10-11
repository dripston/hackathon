"""One patient run end to end: run inside a neatlogs root span, score it, set the shared attributes,
and store real runs. Used by both the API and the CLI."""

from .checks.score import attributes, record, score_run
from .models import AgentRun, RunRequest, RunScore
from .patient.agent import run_research
from .patient.tools.provider import Provider
from . import tracing

# Cassette sets made of fictional data are fake: responses built from them carry x-antibody-mock: 1.
FAKE_SETS = {"seeded"}


def execute(req: RunRequest) -> tuple[AgentRun, RunScore, bool]:
    """Returns (run, score, is_mock)."""
    provider = Provider(req.tool_mode, req.cassette_set, req.faults)
    with tracing.run_span() as (span, trace_id):
        run = run_research(req.domain, req.prompt_version, req.prompt_override, provider,
                           simulated=req.simulated, bug_flags=req.bug_flags)
        run.trace_id = trace_id
        score = score_run(run)
        tracing.set_attributes(span, attributes(run, score))
    record(run, score)
    mock = req.cassette_set in FAKE_SETS or (req.tool_mode == "replay" and all(
        s.synthetic for s in run.steps if s.kind == "tool") and any(s.kind == "tool" for s in run.steps))
    return run, score, mock
