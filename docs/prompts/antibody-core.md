Paste everything below the line into your coding agent, from the root of the repo.

---

# Your task: build Antibody core inside `antibody/`

You are helping me (Rehaan) build **Antibody core** for neatHack 2026 (Oct 10–12, 2026; submissions close Monday Oct 12, 11:55 PM IST). I own only this part. Teammates own other folders, so follow the folder rules strictly. Read `/AGENTS.md` and `/CONTRACT.md` at the repo root first; `/CONTRACT.md` is the team's single source of truth for ports, JSON shapes and APIs, and wins over anything below if they disagree.

## The product in one paragraph

Production AI agents rarely fail loudly. They return HTTP 200, answer politely and do the wrong thing. Our team's system watches an AI agent (the "patient": a company research agent built on the Crustdata API, owned by a teammate), catches these silent failures in its neatlogs traces, and Antibody core then responds: it diagnoses the cause using Entire checkpoints, turns the incident into a family of simulated variants, replays them on recorded tool responses, accepts a fix only if the whole family passes without breaking anything that worked, ships it as a pull request, and saves the family as a pre-deploy gate that predicts which past failures a new change would bring back. The frontend and a voice agent show and approve all of this through an HTTP API that Antibody core serves.

**Analogy:** a vaccine. One infection teaches the body the pattern so it's immune to the variants, not just to that one virus.

## Folder rules (most important)

- Work **only** inside `antibody/` (create it at the repo root).
- **Never** edit, move or delete anything in `client/` (frontend), `detection/` (detection teammate), `server/` (voice teammate), or root files. Ignore the `AGENTS.md` and `README.md` inside teammates' folders.
- If you need something from a teammate, don't build it in their folder. Build a stub inside `antibody/` and tell me what to ask them for. Never edit `/CONTRACT.md` yourself.

## Stack

- **Python 3.12, uv, FastAPI** (same tooling as `server/`, so the team has one Python setup). `pytest` for tests.
- LLM via AWS Bedrock (we have $25 of credits) or the Anthropic API, chosen by env var. Model IDs only from env vars.
- **Never set `temperature`, `top_p` or `top_k`** on Claude calls: Claude 4.7 and later return HTTP 400 on non-default values.
- No database. JSON files under `antibody/.state/` (gitignored).
- Trace Antibody's own work with the **neatlogs Python SDK** (`neatlogs.init(api_key=..., workflow_name="antibody")`, wrap the LLM client, `neatlogs.flush()` / `shutdown()` before exit). Verify the exact API at https://docs.neatlogs.com/sdk/python and the provider page you use (Anthropic or Bedrock).

## Hard rules

1. No secrets in git. `antibody/.env` is gitignored; commit only `antibody/.env.example` with empty values.
2. Never call external APIs in tests. Never put a paid call (LLM, Crustdata) in a loop without a hard cap.
3. Never fabricate results. Anything that came from a stub or mock must be labelled as such in outputs and API responses.
4. Small commits with messages that explain why. Entire is enabled on this repo; my session and reasoning are captured with each commit and that's part of our score. Don't push without asking me.
5. Don't guess third-party APIs (neatlogs MCP, Entire CLI, gh). Check `--help` or docs and a real response first.
6. Ask me before spending money, deleting files you didn't create, or force-pushing.

## Folder layout to create

```
antibody/
├── pyproject.toml            # uv project "antibody"
├── .env.example
├── .gitignore                # .env, .state/, __pycache__/, .venv/
├── README.md                 # how to run, for teammates
├── antibody/
│   ├── __init__.py
│   ├── models.py             # pydantic models (the data shapes below)
│   ├── config.py             # env loading
│   ├── state.py              # read/write .state/incidents/<id>/<stage>.json
│   ├── llm.py                # Bedrock/Anthropic client, "cheap" | "strong", traced
│   ├── tracing.py            # neatlogs init/shutdown
│   ├── patient_client.py     # calls the patient (HTTP) or the built-in stub
│   ├── scorer_client.py      # calls detection's scorer (HTTP) or the built-in stub
│   ├── stubs/                # stub patient + stub scorer + sample data
│   ├── intake.py             # poll neatlogs (MCP) → open incidents; webhook store
│   ├── diagnose.py           # failing vs good traces, git log, Entire checkpoint
│   ├── breed.py              # variant family
│   ├── replay.py             # run family through the patient in replay mode
│   ├── grade.py              # verdicts from the scorer
│   ├── fix.py                # fix candidate (diff) via strong model
│   ├── apply.py              # git worktree per attempt
│   ├── ship.py               # branch, commit, PR, immunity file
│   ├── gate.py               # replay all immunity families against a branch
│   ├── pipeline.py           # runs the stages in order with retry rule
│   ├── api.py                # FastAPI Operator API
│   └── cli.py                # watch | handle | gate | serve
├── fixtures/
│   ├── incidents/sample.json
│   └── immunity/             # saved families (committed)
└── tests/
```

## Data shapes (`models.py`, pydantic; must match `/CONTRACT.md` field for field)

```python
class ToolError(BaseModel):
    code: str            # "HTTP_429", "TIMEOUT", "EMPTY", "NO_CASSETTE"
    message: str

class Step(BaseModel):
    index: int
    kind: Literal["llm", "tool"]
    name: str
    args: Any | None = None
    result: Any | None = None
    error: ToolError | None = None
    latency_ms: float | None = None
    cost_usd: float | None = None

class AgentRun(BaseModel):                 # what the patient returns
    run_id: str
    trace_id: str | None
    input: dict                            # {"domain": "stripe.com"}
    prompt_version: str
    bug_flags: dict[str, bool] = {}
    steps: list[Step]
    output: dict | None                    # the research brief
    total_cost_usd: float | None = None
    simulated: bool = False

class CheckResult(BaseModel):
    id: str                                # "tw_invented_person", "jev_grounded"
    passed: bool
    evidence: str

class RunScore(BaseModel):                 # what the scorer returns
    run_id: str
    checks: list[CheckResult]
    violations: list[str]

class Incident(BaseModel):
    id: str
    detection: str                         # e.g. "tw_invented_person"
    trace_ids: list[str]
    workflow: str = "company-research"
    first_seen: str
    status: Literal["open","diagnosing","simulating","fixing","awaiting_approval","resolved","escalated"]

class Diagnosis(BaseModel):
    incident_id: str
    commit_sha: str | None
    checkpoint_id: str | None
    checkpoint_url: str | None             # https://entire.io/gh/OWNER/REPO/commit/FULL_SHA
    reasoning_excerpt: str | None          # why the change was made, from the Entire session
    good_trace_ids: list[str]
    explanation: str
    fix_kind: Literal["prompt_patch","prompt_rollback","tool_wrapper_patch"]

class Fault(BaseModel):
    tool: str
    at_call: int
    error: ToolError

class Scenario(BaseModel):
    id: str
    incident_id: str
    role: Literal["must_fix","must_not_change"]
    domain: str
    faults: list[Fault] = []
    cassette_set: str
    expected_checks: list[str]             # check ids that must pass

class Verdict(BaseModel):
    scenario_id: str
    passed: bool
    failed_checks: list[str]
    run_id: str
    trace_id: str | None
    synthetic_tool_calls: int = 0          # replay calls with no recording

class FamilyResult(BaseModel):
    incident_id: str
    candidate: str                         # "baseline" or fix id
    must_fix_passed: int
    must_fix_total: int
    must_not_change_passed: int
    must_not_change_total: int
    verdicts: list[Verdict]

class FixCandidate(BaseModel):
    id: str
    incident_id: str
    kind: str
    description: str
    diff: str
    attempt: int

class Resolution(BaseModel):
    incident_id: str
    accepted_fix_id: str | None
    before: FamilyResult
    after: FamilyResult | None
    attempts: list[str]
    pr_url: str | None
    cost_usd: float
    duration_ms: int
    approval: dict | None = None           # {"phrase","channel","at"}
```

## How Antibody talks to teammates (summary of `/CONTRACT.md`)

Everything crosses team boundaries over HTTP, so language doesn't matter. The detection teammate serves both the patient and the scorer from one service on `http://localhost:5050`, so `PATIENT_URL` and `SCORER_URL` both default to that.

**Patient (detection teammate provides), `PATIENT_URL`:**
`POST /run` with `{ domain, prompt_override?, prompt_version?, tool_mode: "replay", cassette_set, faults: Fault[], simulated: true }` → `AgentRun`. In replay mode it must never call Crustdata live; when there's no recording for a call it returns a fake empty result marked `synthetic: true` in the step.

**Scorer (detection teammate provides), `SCORER_URL`:**
`POST /score` with `AgentRun` → `RunScore` (tripwires + Jev checks). Also `GET /risks` → list of risk forecasts (what's trending toward breaking), which Antibody passes through to the frontend.

**Until those exist**, `patient_client.py` and `scorer_client.py` use the built-in stubs in `antibody/stubs/` (switch: `USE_STUBS=1`, or automatically when the detection service doesn't answer `GET /health`; log loudly which one is in use). The stubs must make the full loop work: a stub patient whose output depends on a prompt override (e.g. if the prompt contains the phrase "at least 3 decision makers" it invents contacts), and a stub scorer with a working `tw_invented_person` check (a contact counts as invented if it isn't in any people-search step result).

**Operator API (Antibody serves, frontend + voice call it), port `ANTIBODY_API_PORT` (default 4000):**

| Method + path | Returns / does |
|---|---|
| `GET /health` | `{ ok: true }` |
| `GET /incidents` | list of `Incident` |
| `GET /incidents/{id}` | incident + diagnosis + family results + resolution |
| `GET /incidents/{id}/brief` | `{ text }`: 3–5 plain sentences: what broke, why, proposed fix, family score |
| `POST /incidents/{id}/approve` | `{ fix_id, phrase, channel: "typed" \| "voice" }`; applies only if phrase is exactly `approve fix <n>` (trimmed, case-insensitive). "yes", "ok", "do it" → 400 `{ error: "Not an approval phrase" }`. Records phrase, channel, time |
| `POST /incidents/{id}/reject` | `{ fix_id, reason }` |
| `GET /gate/latest` | latest gate report |
| `GET /risks` | passthrough from scorer, or `[]` |
| `POST /webhooks/neatlogs` | store raw body in `.state/webhooks/`, trigger a poll |

Responses built from stubs include header `x-antibody-mock: 1`. CORS only for `http://localhost:3000` (and the frontend's deployed URL when I give it).

## Build it in phases. Stop after each phase, show me the result, and wait for "go".

### Phase 0: skeleton that runs end to end on stubs
Create the layout, models, state store, stubs, `pipeline.py` with every stage as a stub, `fixtures/incidents/sample.json` (detection `tw_invented_person`), and the CLI:
```
uv run antibody handle --file fixtures/incidents/sample.json
uv run antibody serve
```
`handle` runs the stages in order, writes one JSON file per stage under `.state/incidents/<id>/`, skips stages whose output exists unless `--force`, and prints one line per stage.
**Done when:** the loop completes on stubs, the API serves every endpoint, and pytest covers stage order, the acceptance rule and the approval phrase rule.

### Phase 1: intake from neatlogs
neatlogs exposes an MCP server at `https://ingest.neatlogs.com/mcp` (Streamable HTTP, header `Authorization: Bearer <NEATLOGS_API_KEY>`). Use the official Python MCP client. Tools to use (verify schemas at https://docs.neatlogs.com/integrations/mcp-tools): `list_detections`, `get_detection_trend`, `search_traces`, `get_trace_context`.
`uv run antibody watch` polls every 60 s; when a detection in our list has more than 3 occurrences in the last 10 minutes and no open incident exists for it, create one. Ignore traces marked simulated. The webhook route just stores the raw payload and triggers a poll (the payload format isn't documented, so polling is the reliable path).
Fallback if MCP is painful: the neatlogs CLI (`npm i -g neatlogs-cli@0.2.0`, Node 22/24, `neatlogs auth login --device`, `neatlogs traces list --limit 5`, `neatlogs traces get '<id>' --json`).
**Done when:** a real detection creates an incident file with real trace IDs.

### Phase 2: diagnosis (the Entire moment)
1. Fetch 3–5 failing and 3–5 healthy traces (`get_trace_context`), summarise them (prompt version, tool errors, output).
2. Find what changed: compare prompt versions and flags between failing and healthy runs; `git log` on the patient's prompt and tool files (ask me for the paths once my teammate pushes them; make them config).
3. Find why: `entire checkpoint list` and `entire checkpoint explain <sha>`; extract the request and reasoning (e.g. "Sales says briefs with fewer than 3 contacts are useless"). Build `checkpoint_url` as `https://entire.io/gh/OWNER/REPO/commit/FULL_SHA` (owner/repo from `GITHUB_REPO`).
4. The strong model writes the explanation and picks `fix_kind` from the evidence you give it. Keep its job narrow.
**Done when:** diagnosis names the commit and quotes the checkpoint reasoning for a real seeded bug.

### Phase 3: breed, replay, grade
- **Breed ~10 scenarios** per incident, deterministic with a seed: 6–7 `must_fix` (the failing domains, similar recorded domains, and the same domain with faults at different calls: 429 on call 1 vs call 2, timeout, empty) and 3–4 `must_not_change` (healthy domains that must stay correct).
- **Replay** each through `patient_client` in replay mode with `simulated: true`. Concurrency 3. Hard cost cap per incident (`ANTIBODY_COST_CAP_USD`, default 1.50); stop and report if exceeded. Count synthetic tool calls; if more than 20% of calls in a family are synthetic, say so in the result.
- **Grade** with `scorer_client`. No separate LLM judge: the check that caught the failure is the test that proves the fix.
**Done when:** a baseline `FamilyResult` prints, e.g. "must_fix 3/7, must_not_change 4/4".

### Phase 4: fix and retry
Give the strong model the diagnosis, the current prompt or tool file, the failing verdicts and the checkpoint reasoning. Ask for the smallest change that removes the failure while respecting the original intent (e.g. keep "aim for 3 contacts" but "never name anyone not in tool results; list fewer and say why"). Output a unified diff.
Apply each attempt in a git worktree on branch `antibody/<incident>/attempt-<n>`, rerun the family against it (pass the prompt override, or point the patient at the worktree).
**Acceptance rule:** all must_fix pass AND all must_not_change pass → accept. Otherwise feed the failing verdicts back and retry. Max 3 attempts, then status `escalated` with everything learned. Record every attempt; never fake a rejection.
**Done when:** a seeded bug gets an accepted fix with before/after numbers.

### Phase 5: ship and immunise
Commit the fix on the attempt branch (explain why; link the incident), push, open a PR with `gh pr create`: what broke, checkpoint link, before/after family scores, 2 before and 2 after trace links, cost and time. If Entire Trails is enabled on the repo, also create a Trail (`entire trail create`; check `--help`). Save the family to `antibody/fixtures/immunity/<incident>.json` on the same branch. Status → `awaiting_approval`. Approval through the API with the exact phrase merges via `gh pr merge --squash` (ask me before enabling auto-merge).
**Done when:** a real PR exists with the evidence in its body.

### Phase 6: the gate (prediction)
`uv run antibody gate --head <branch>`: replay every family in `fixtures/immunity/` against that branch and report which past incidents it would re-open ("re-opens inc_..._tw_invented_person: must_fix 4/7"). Exit code 1 on any regression. Replay only, no live Crustdata calls. Save the report for `GET /gate/latest`.
**Done when:** reintroducing a fixed bug on a branch makes the gate fail with a clear message.

### Phase 7: finish the API and evidence
`/incidents/{id}/brief` built from stored files (template, model only for the "why" sentence). Measure Antibody's own cost per incident from its neatlogs traces into `Resolution.cost_usd` (the team needs it for the cfo.ai business plan). Write `antibody/README.md`: how to run each command, env vars, and what's real vs stubbed.

## `.env.example`
```
NEATLOGS_API_KEY=
NEATLOGS_MCP_URL=https://ingest.neatlogs.com/mcp
LLM_PROVIDER=bedrock
AWS_REGION=us-east-1
ANTHROPIC_API_KEY=
MODEL_CHEAP=
MODEL_STRONG=
PATIENT_URL=http://localhost:5050
SCORER_URL=http://localhost:5050
USE_STUBS=1
GITHUB_REPO=
ANTIBODY_API_PORT=4000
ANTIBODY_STATE_DIR=.state
ANTIBODY_COST_CAP_USD=1.50
```

Start with Phase 0 now. Before writing code, reply with your plan for Phase 0 in under 10 lines and any question that would change the design.
