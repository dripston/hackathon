# Antibody core

Owner: Rehaan. Built from `docs/prompts/antibody-core.md`. Serves the Operator API on `:4000`; shapes follow `/CONTRACT.md`.

Antibody watches neatlogs for silent failures in the patient agent. When one keeps firing, Antibody:

1. **opens an incident** for it (a neatlogs detection fired more than 3 times in 10 minutes);
2. **diagnoses** it: the commit behind it, plus *why* that change was made, from its Entire checkpoint;
3. **breeds** about 10 variant scenarios (`must_fix` and `must_not_change`);
4. **replays** them on recorded Crustdata responses and grades them with detection's checks;
5. **asks the model for the smallest fix**, retrying up to 3 times. A fix is accepted only when the whole family passes;
6. **opens a PR** with before/after evidence, which merges only on the exact phrase `approve fix <n>` (typed in the console, or spoken to the voice agent);
7. **saves the family** as a pre-deploy gate. After a merge it pulls `main`, gates it and refreshes the backtest.

## Real results (2026-10-11, real Crustdata recordings, DeepSeek)

| Incident | Caught by | Cause found | Fix | Family before → after | PR |
|---|---|---|---|---|---|
| `inc_20261011_1102_tw_empty_after_error` | detection run log (before the neatlogs detections existed) | `32de239`, with its Entire request quoted | one line: report "unavailable", not "ok" | must_fix 5/7 → 7/7, must_not_change 3/3 kept | #3 |
| `inc_20261011_1137_tw_company_match_skipped` | **neatlogs detection** | `4b732f0` (prompt v3 dropped the company check) | prompt rollback that restores the Identify step | must_fix 1/7 → 7/7, must_not_change 0/3 → 3/3 | #4 |

The first pass of the first incident blamed the unchanged prompt, couldn't reproduce the failure, and **escalated instead of shipping**. The diagnosis was fixed (a flag on in every failing run is the suspect), and the rerun is above. Cost is about $0.03 and 3 minutes per incident.

## Run it

```bash
cd antibody
uv sync
cp .env.example .env            # then fill it in (see below)

uv run antibody serve                 # Operator API on :4000 (needs detection on :5050)
uv run antibody watch                 # poll neatlogs every 60 s, handle new incidents
uv run antibody watch --once          # one poll, handle what it opens
uv run antibody demo --file .state/incidents/<id>/incident.json   # narrated rerun, for the video
uv run antibody neatlogs-setup        # create the tw_* detections in neatlogs (idempotent)
uv run antibody gate --head <branch>  # exit 1 if the branch re-opens a past incident
uv run antibody backtest [--clean <sha> ...]   # catch rate and false-alarm rate of the gate
uv run antibody costs                 # cost per incident (for the cfo.ai plan)
uv run antibody approve <incident> --fix fix_1 --phrase "approve fix 1"
uv run pytest                         # never calls external APIs
uv run python scripts/smoke_api.py    # hit every endpoint as the console would; refresh fixtures/api-samples/
```

`handle` writes one JSON file per stage to `.state/incidents/<id>/` (`intake`, `diagnosis`, `family`, `baseline`, `attempts`, `resolution`). It skips stages that are already done unless you pass `--force`.

## Operator API (for the console and the voice agent)

Real responses from the running system are in [`fixtures/api-samples/`](fixtures/api-samples/): use them as the console's mocks. Endpoints marked *extra* aren't in `/CONTRACT.md`. They only add keys or endpoints, and change nothing in the contract shapes.

| Method + path | What it returns | Sample |
|---|---|---|
| `GET /health` | `{ "ok": true }` | `health.json` |
| `GET /overview` *extra* | the Live ward's top strip: `runs_last_10_min`, `silent_failures_last_10_min`, `silent_failure_rate`, `open_incidents`, `awaiting_approval`, `gate_verdict` | `overview.json` |
| `GET /incidents` | `[Incident]`, newest first. `status` is one of `open, diagnosing, simulating, fixing, awaiting_approval, resolved, escalated` | `incidents.json` |
| `GET /incidents/{id}` | `{ incident, diagnosis, families, resolution }` from the contract, **plus** `scenarios` (each: role, domain, injected `faults`), `attempts` (each: `fix` with its unified `diff`, `result` FamilyResult with per-scenario verdicts, `accepted`, and a one-line `verdict` such as `accepted` or `rejected: broke airtable.com`, `broke`, `still_failing`), `intake` (source and trace count), `trace_url_template` | `incident_0.json`, `incident_1.json` |
| `GET /incidents/{id}/brief` | `{ "text": "3–5 plain sentences" }`, written to be read aloud | `incident_0_brief.json` |
| `POST /incidents/{id}/approve` | `{ fix_id, phrase, channel: "typed" \| "voice" }`. Only `approve fix <n>` (trimmed, case-insensitive) is accepted, and it must name the accepted fix. Anything else gets 400 `{ "error": "Not an approval phrase" }` (`approve_refused.json`). On success: the PR is squash-merged, the incident becomes `resolved`, and the post-merge job starts. | |
| `POST /incidents/{id}/reject` | `{ fix_id, reason }`; the incident becomes `escalated`, and nothing merges | |
| `GET /gate/latest` | latest `GateReport`: `verdict` (`safe` \| `blocked`), one row per immunity family with `reopens` and `message` (e.g. `re-opens inc_…: must_fix 3/7`). 404 until a gate has run | `gate_latest.json` |
| `GET /trust` *extra* | for the Trust page: each seeded bug with `would_have_blocked` and a note, `catch_rate`, `misses` (listed, not hidden), `false_alarm_rate`, `label` (SIMULATED). `status: not_measured_yet` until a backtest has run (it runs automatically after a merge) | `trust.json` |
| `GET /aftercare` *extra* | progress of the post-merge job: `state` = `pulling`, `gating`, `backtesting`, `done` or `failed` | `aftercare.json` |
| `GET /risks` | passed through from detection's `/risks` (`[RiskForecast]`) | `risks.json` |
| `POST /webhooks/neatlogs` | stores the raw body and triggers a poll | |

Detection's own API on `:5050` serves the Live ward's feed: `GET /runs?limit=20` returns `[{ run: AgentRun, score: RunScore }]`. Each `run.output` is the brief exactly as a user would see it, and `score.checks` holds the four tripwires plus `jev_grounded`, an advisory 0..1 score from Jev (`detection_runs.json`).

- **Mock header:** any response built from stub or seeded data carries `x-antibody-mock: 1`, and `Access-Control-Expose-Headers` lets the browser read it.
- **CORS:** allows `CORS_ORIGINS`, default `http://localhost:3000`. Every endpoint, including the preflight for `POST`, is checked by `scripts/smoke_api.py`.
- **Polling:** poll every 2 seconds. While Antibody works, the incident's `status` moves through `diagnosing → simulating → fixing → awaiting_approval`, and the stage keys appear in `GET /incidents/{id}` as they complete.
- **Trace links:** set `NEATLOGS_TRACE_URL` to a dashboard URL containing `{trace_id}` (copy one from the neatlogs UI). `trace_url_template` then carries it to the console. neatlogs doesn't document the URL format, so it isn't hard-coded.

## Environment (`antibody/.env`)

| Var | Notes |
|---|---|
| `LLM_PROVIDER` | `deepseek` (what we run), `groq`, `anthropic`, `bedrock`, or `stub`. Groq's free tier ran out of daily tokens mid-run, and the hackathon AWS account doesn't allow Bedrock. |
| `DEEPSEEK_API_KEY`, `GROQ_API_KEY` | both are OpenAI-compatible, so one client is traced by `neatlogs.wrap` |
| `MODEL_CHEAP`, `MODEL_STRONG` | model IDs, e.g. `deepseek-flash`. Never hard-coded. |
| `PRICE_*_PER_MTOK` | USD per million tokens, for the cost cap and the ledger. `deepseek-flash` peak: 0.30 in, 1.20 out |
| `NEATLOGS_API_KEY`, `NEATLOGS_MCP_URL` | intake (detection trend), diagnosis traces, `neatlogs-setup`, tracing (`workflow=antibody`) |
| `NEATLOGS_TRACE_URL` | optional dashboard URL template with `{trace_id}` |
| `PATIENT_URL`, `SCORER_URL` | detection's service; default `http://localhost:5050` |
| `USE_STUBS` | `1` = built-in stubs. With `0`, Antibody still falls back to the stubs, loudly, if detection's `/health` doesn't answer. |
| `CASSETTE_SET` | `base` (real Crustdata recordings) or `seeded` (fictional companies, labelled MOCK) |
| `GITHUB_REPO` | `owner/repo`; defaults to the `origin` remote |
| `ANTIBODY_COST_CAP_USD` | hard cap per incident (default 1.50). Stops and reports when reached. |

No LLM is called when none is configured. Diagnosis then uses a template explanation, and fixes use deterministic rules for the seeded bug shapes. Both are labelled as mock. With an LLM, the model is retried once before the rule-based fallback, so a hand-written answer never leaks into a real run.

## How intake reads neatlogs

- **The score span:** detection puts each run's scores on a child span named `antibody.score`, whose input is compact JSON (`"antibody.tw.tw_empty_after_error":1`, `"antibody.simulated":false`, …). The neatlogs SDK only exports `neatlogs.*` attributes, and attributes set after a span starts don't arrive, so this span is how scores reach neatlogs.
- **The detections:** `antibody neatlogs-setup` creates one conditional detection per tripwire, matching `span_name = antibody.score`, input containing `"antibody.tw.<id>":1`, and `"antibody.simulated":false`.
- **Intake:** reads each detection's trend from neatlogs (hourly buckets; nothing finer is available). When one fired more than 3 times, it takes the exact failing traces in the last 10 minutes from detection's run log. Until the detections exist, it falls back to the run log alone and says so.

## What's real and what isn't

| Part | Status |
|---|---|
| Pipeline, breeding, replay, grading, acceptance rule, retries, cost cap, approval rule | real |
| Patient and scorer | real: detection's service, replaying **real Crustdata recordings** (20 domains). Outages are injected faults, labelled as such. |
| Diagnosis with Entire checkpoint reasoning | real: quotes the request from the agent session that made the commit |
| LLM explanation and fixes | real (DeepSeek `deepseek-flash`) |
| PRs and squash merge on approval | real (#3, #4) |
| Gate and backtest | real, replay only. Verified: PR #4's branch is SAFE |
| neatlogs detections and intake | real (`inc_…_1137` was opened from a neatlogs detection) |
| Entire Trail on ship | not created: the repo isn't onboarded to Entire (`entire repo mirror add`) |
| Seeded bug 2 (invented contacts) | latent: the model never invented anyone, so there's no incident and no family. `/trust` lists it as a miss. |

## Contract notes for the team

- **`bug_flags` in `POST /run`:** bug 1 is a flag (`BUG_SWALLOW_TOOL_ERRORS`). To replay its baseline, Antibody sends an optional `bug_flags` object in `POST /run`. Detection accepts it, but the contract doesn't list it yet.
- **Extra keys and endpoints:** `GET /incidents/{id}` has extra keys, and `/overview`, `/trust` and `/aftercare` are extra endpoints. All are additive.
