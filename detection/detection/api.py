"""Detection API on :5050, exactly as /CONTRACT.md describes it."""

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

from .checks.score import recent, score_run
from .config import get_settings
from .forecast import forecasts
from .models import AgentRun, RunRequest
from .service import execute

app = FastAPI(title="Detection API")
app.add_middleware(CORSMiddleware, allow_origins=get_settings().cors_list, allow_methods=["*"],
                   allow_headers=["*"], expose_headers=["x-antibody-mock"])


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/run")
def run(req: RunRequest, response: Response) -> AgentRun:
    agent_run, _, mock = execute(req)
    if mock:
        response.headers["x-antibody-mock"] = "1"
    return agent_run


@app.post("/score")
def score(run: AgentRun):
    return score_run(run)


@app.get("/runs")
def runs(limit: int = 20):
    return recent(limit)


@app.get("/risks")
def risks():
    return forecasts()
