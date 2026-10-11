"""The built-in stubs served over HTTP with detection's API shape (all responses are MOCK).

Used to run a fix candidate's patient from a git worktree, the same way the real detection
service would be. Teammates can also point at it while detection is being built.
"""

from fastapi import FastAPI, Response
from pydantic import BaseModel

from .models import AgentRun, Fault
from .stubs import patient, scorer

app = FastAPI(title="Antibody stub patient (MOCK)")


class RunBody(BaseModel):
    domain: str
    prompt_version: str | None = None
    prompt_override: str | None = None
    tool_mode: str = "replay"
    cassette_set: str = "base"
    faults: list[Fault] = []
    simulated: bool = True
    bug_flags: dict[str, bool] = {}


@app.middleware("http")
async def mock_header(request, call_next):
    resp: Response = await call_next(request)
    resp.headers["x-antibody-mock"] = "1"
    return resp


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/run")
def run(body: RunBody) -> AgentRun:
    return patient.run(body.domain, prompt_version=body.prompt_version or "v1", prompt_override=body.prompt_override,
                       faults=body.faults, simulated=body.simulated, bug_flags=body.bug_flags,
                       cassette_set=body.cassette_set)


@app.post("/score")
def score(run: AgentRun):
    return scorer.score(run)


@app.get("/runs")
def runs(limit: int = 20):
    return []


@app.get("/risks")
def risks():
    return []
