Paste everything below the line into your coding agent, from the repo root.

---

# Your task: build the patient agent and the silent-failure detectors in `detection/`

You are helping me build the **detection** part of Antibody for neatHack 2026 (submissions close Monday Oct 12, 11:55 PM IST). Teammates own other folders. Read `/AGENTS.md` and `/CONTRACT.md` first and follow them exactly.

## What you're building, in plain words

Two things in one service:

1. **The patient:** a company research agent. Give it a website (e.g. `stripe.com`); it uses the **Crustdata** API to find the company, its leaders and its hiring, and an LLM writes a short brief. It's realistic enough that when it goes wrong, nothing looks wrong from the outside.
2. **The heart monitor:** checks that run on every patient run and catch silent failures: deterministic tripwires plus **Jev / jevals** decision-model scores. Results go onto the neatlogs trace so neatlogs detections and alerts fire. Plus a **risk forecast** that notices things getting worse (a tool getting flaky) before they break.

Teammate Rehaan's Antibody core calls this service to replay the patient in simulations and to grade the results, so the API in `/CONTRACT.md` must be exact.

## Folder rules

- Work **only** inside `detection/`. Never edit `client/`, `server/`, `antibody/` or root files.
- If you need something outside your folder, tell me instead of doing it.

## Stack

- **Python 3.12, uv, FastAPI** (same tooling as `server/`). `pytest` for tests. `httpx` for HTTP.
- LLM via AWS Bedrock or the Anthropic API, chosen by env var; model IDs only from env. Don't set `temperature`, `top_p` or `top_k`.
- **neatlogs Python SDK** for tracing: `neatlogs.init(api_key=..., workflow_name="company-research")`, wrap the LLM client (`neatlogs.wrap(...)`), flush/shutdown before exit. Verify against https://docs.neatlogs.com/sdk/python, the provider page (Anthropic or Bedrock) and https://docs.neatlogs.com/sdk/custom-attributes.
- No database. JSON/JSONL files under `detection/.state/` (gitignored); recordings under `detection/fixtures/` (committed).

## Folder layout

```
detection/
├── pyproject.toml          # uv project "detection", script entry "detection = detection.cli:main"
├── .env.example  .gitignore  README.md
├── detection/
│   ├── models.py           # pydantic models matching /CONTRACT.md exactly
│   ├── config.py  llm.py  tracing.py
│   ├── patient/
│   │   ├── agent.py        # run_research(domain, ...) -> AgentRun
│   │   ├── prompts/        # v1.md healthy, v2.md and v3.md seeded bugs
│   │   └── tools/
│   │       ├── crustdata.py   # company_enrich, people_search, jobs
│   │       └── provider.py    # live | record | replay, faults, synthetic fallback
│   ├── checks/
│   │   ├── tripwires.py    # the 4 tripwires
│   │   ├── jev.py          # Jev / jevals checks
│   │   └── score.py        # score_run(run) -> RunScore; neatlogs attributes; runs.jsonl
│   ├── forecast.py         # risk forecasts
│   ├── api.py              # FastAPI on :5050
│   └── cli.py              # serve | run | traffic | forecast | record
├── fixtures/
│   ├── domains.txt
│   ├── cassettes/<set>/<tool>/<args_hash>.json
│   └── bug-commits.json
└── tests/
```

## Build it in phases. Stop after each phase, show me the result, wait for "go".

### Phase 0: skeleton on fake data
Models matching `/CONTRACT.md`, the FastAPI app with every Detection API endpoint returning fake but correctly shaped data (header `x-antibody-mock: 1`), the CLI, `.env.example`, tests for the models.
**Done when:** `uv run detection serve` serves `/health`, `/run`, `/score`, `/runs`, `/risks` on port 5050, and Rehaan's Antibody can call them.

### Phase 1: Crustdata tools with record and replay
Crustdata signup: enter promo code `NEATLOGS-OCT2026` **before** signing up with email (not "Continue with Google"). Read https://docs.crustdata.com and confirm, against real responses, the endpoints, auth header and field names for: company enrichment by domain, people search at a company by seniority/title (docs mention `POST /screener/person/search`; verify), and job postings.

Every tool call goes through the provider:
- `live`: real call, no saving.
- `record`: real call, saved to `fixtures/cassettes/<set>/<tool>/<args_hash>.json` including errors (save real 429s if you hit them).
- `replay`: recordings only, never the network. Applies injected faults (e.g. return `HTTP_429` on the 2nd people search). If no recording matches, return an empty result with `synthetic: true` in the step.

`args_hash` = sha256 of the JSON args with sorted keys. Test that record-then-replay gives identical results.

**Credits:** record 20 domains first (mix of big, mid and small companies, plus two lookalike pairs, i.e. companies with near-identical names, which bug 3 needs). Measure credits per domain from the first 3; if the projection goes over 1,500 credits, stop and tell me.

### Phase 2: the patient (healthy version)
`run_research(domain, prompt_version="v1", prompt_override=None, provider=..., simulated=False) -> AgentRun`:
1. **Identify:** company enrichment; the LLM confirms the result matches the domain (`company_match_confirmed`).
2. **People:** people search for leaders (founder, CEO, CTO, VP/Head of Engineering, Sales).
3. **Hiring:** job postings → 2–4 hiring signals.
4. **Brief:** the LLM writes `ResearchBrief` JSON; each contact carries `source_step_index`. Validate with pydantic; on invalid JSON retry once, then fail loudly.

Record every step (kind, name, args, result, error, latency, cost, synthetic). The healthy prompt (`prompts/v1.md`) must say: only name people that appear in tool results; if a tool failed, say the data is unavailable, never "none exist"; always confirm the company first.

Wire `POST /run` to it. CLI: `uv run detection run stripe.com --mode replay --prompt v1`.

### Phase 3: tripwires and scoring
Four tripwires, each pure functions with a passing and a failing test:

| ID | Fails when |
|---|---|
| `tw_invented_person` | a contact isn't in any successful people-search result (normalised name match) |
| `tw_empty_after_error` | no decision makers (or "none exist") while a people-search step had an error |
| `tw_company_match_skipped` | `company_match_confirmed` is false or no identify step ran before enrichment |
| `tw_claimed_success_on_failure` | the summary says research completed while the last tool step failed |

`score_run(run) -> RunScore`. After each **real** (non-simulated) run: set the custom attributes from `/CONTRACT.md` on the trace and append `{run, score}` to `.state/runs.jsonl` (that's what `GET /runs` serves). Simulated runs get `antibody.simulated = true` and are never appended. Wire `POST /score`.

### Phase 4: seed three silent bugs (realistically)
Each bug must look like a reasonable change and must be made **by a coding-agent session with Entire enabled**, so the Entire checkpoint records the reasoning. That reasoning is what Antibody later finds. One commit per bug:

1. **Hidden tool errors** (flag `BUG_SWALLOW_TOOL_ERRORS=1`). The request to the coding agent: *"People search sometimes errors and the whole brief fails. Make it resilient: on error return an empty list so the brief still completes."* Result: 429s become "no decision makers found." Trips `tw_empty_after_error`.
2. **Invented contacts** (prompt `v2`). Request: *"Sales says briefs with fewer than 3 contacts are useless. Update the prompt so every brief includes at least 3 decision makers."* Result: the model invents people. Trips `tw_invented_person`.
3. **Skipped company check** (prompt `v3`). Request: *"Cut tokens and latency: drop the company-confirmation step; the domain lookup is reliable enough."* Result: lookalike domains get the wrong company. Trips `tw_company_match_skipped`.

Keep the healthy path reachable (flags and prompt versions). Write `fixtures/bug-commits.json`: `[{ "bug": "...", "commit": "<sha>", "check": "tw_..." }]`. These bugs are seeded; never present them as real incidents.

### Phase 5: neatlogs detections, alerts and traffic
In the neatlogs dashboard, create Condition detections on the attributes (e.g. `antibody.tw.tw_invented_person = 1` and `antibody.simulated = false`) with the names in `/CONTRACT.md`, and threshold alert rules (more than 3 in 10 minutes, critical; in-app plus the webhook URL Rehaan gives you). Docs: https://docs.neatlogs.com/docs/features/detections and https://docs.neatlogs.com/docs/features/alerts. Screenshot each detection, alert rule and a fired alert into `detection/evidence/` and send them to the frontend teammate (he owns `/evidence`).

`uv run detection traffic --rate 10 --prompt v2 --fault-rate 0.3 --decay` runs the patient over the recorded domains in replay mode to create "production" traffic. `--decay` slowly raises the fault rate (e.g. 2% → 5% → 9% → 15% over 30 minutes) for the prediction demo.

### Phase 6: Jev / jevals checks
jevals is open source (GitHub org `openlayer-ai`) and uses Jev-style decision models instead of an LLM judge. Built-in checks include Grounded, UsedToolResult and StayedInScope. Check the repo for install, licence and backends; Jev itself is a waitlisted hosted API (TypeSafe AI). If we don't have Jev access, use the backend jevals supports for a standard chat model and label those scores clearly.

Score `jev_grounded`, `jev_used_tool_result`, `jev_stayed_in_scope` per run as `CheckResult`s with `score`, write `antibody.jev.<check>` attributes, and add the `jev_grounded_low` detection (Grounded < 0.6). Don't repeat vendor performance claims as facts anywhere.

If Jev/jevals isn't working by Sunday evening, skip it and tell me. Tripwires alone are enough.

### Phase 7: risk forecast (prediction of what's about to break)
Every 10 minutes, from `.state/runs.jsonl`, compute per tool and per check: tool error rate, retry rate, near misses (Jev scores just above their threshold, runs that passed only after retries), latency p95, and unstable output (same domain, different answers across runs). Fit a straight line over the recent windows and estimate minutes until each signal crosses its threshold. Output `RiskForecast`s (`/CONTRACT.md`), `likely` when the fit is clean and close, `possible` otherwise. When a forecast's related check actually fires, set its `outcome` to `happened`; if the window passes without it, `did_not_happen`. Serve them at `GET /risks`. Unit-test the maths.

This is a straight-line estimate, not machine learning. Present it as "likely", never as certain.

## `.env.example`
```
NEATLOGS_API_KEY=
LLM_PROVIDER=bedrock
AWS_REGION=us-east-1
ANTHROPIC_API_KEY=
MODEL_CHEAP=
CRUSTDATA_API_KEY=
CRUSTDATA_BASE_URL=
CRUSTDATA_MODE=replay
JEV_API_KEY=
BUG_SWALLOW_TOOL_ERRORS=0
PATIENT_PROMPT_VERSION=v1
DETECTION_PORT=5050
```

## What to hand to teammates
- Rehaan: the service on `:5050` working with `/run` (replay) and `/score`; the paths of the prompt and tool files (he uses them for diagnosis); `fixtures/bug-commits.json`.
- Frontend: screenshots of detections and alerts; one trace link per bug where the answer looks healthy but a tripwire attribute is 1.

Start with Phase 0 now. Before writing code, reply with your plan in under 10 lines and any question that would change the design.
