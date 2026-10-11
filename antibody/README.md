# Antibody core

Owner: Rehaan. Built from `docs/prompts/antibody-core.md`. Serves the Operator API on `:4000`; shapes follow `/CONTRACT.md`.

Antibody watches neatlogs for silent failures in the patient agent. When one keeps firing, Antibody:

1. **opens an incident** for it;
2. **diagnoses** it: the commit behind it, plus *why* that change was made, from Entire;
3. **breeds** about 10 variant scenarios (`must_fix` and `must_not_change`);
4. **replays** them on recorded tool responses and grades them with detection's checks;
5. **asks the model for the smallest fix**, retrying up to 3 times. A fix is accepted only when the whole family passes;
6. **opens a PR** with before/after evidence, which merges only on the exact phrase `approve fix <n>`;
7. **saves the family** as a pre-deploy gate.

## Run it

```bash
cd antibody
uv sync
cp .env.example .env            # then fill it in (see below)

uv run antibody serve                                     # Operator API on :4000
uv run antibody watch                                     # poll neatlogs every 60 s, handle new incidents
uv run antibody handle --file fixtures/incidents/sample.json   # run one incident end to end
uv run antibody gate --head <branch>                      # exit 1 if the branch re-opens a past incident
uv run antibody backtest [--clean <sha> ...]              # catch rate and false-alarm rate of the gate
uv run antibody costs                                     # cost per incident (for the cfo.ai plan)
uv run antibody approve <incident> --fix fix_1 --phrase "approve fix 1"
uv run pytest                                             # never calls external APIs
```

`handle` writes one JSON file per stage to `.state/incidents/<id>/` (`diagnosis`, `family`, `baseline`, `attempts`, `resolution`). It skips stages that are already done unless you pass `--force`.

## Operator API (for the console and the voice agent)

| Method + path | What it does |
|---|---|
| `GET /health` | `{ "ok": true }` |
| `GET /incidents` | `[Incident]`, newest first |
| `GET /incidents/{id}` | `{ incident, diagnosis, families: [FamilyResult], resolution }` |
| `GET /incidents/{id}/brief` | `{ "text": "3–5 plain sentences" }`, written to be read aloud |
| `POST /incidents/{id}/approve` | `{ fix_id, phrase, channel: "typed" \| "voice" }`. Only `approve fix <n>` (trimmed, case-insensitive) is accepted. Anything else, such as "yes", gets 400 `{ "error": "Not an approval phrase" }`. The phrase must name the accepted fix. On success the PR is merged with `gh pr merge --squash`. |
| `POST /incidents/{id}/reject` | `{ fix_id, reason }`, and the incident becomes `escalated` |
| `GET /gate/latest` | the latest `GateReport` (404 until a gate has run) |
| `GET /risks` | passed straight through from detection's `/risks`; `[]` when detection isn't up |
| `POST /webhooks/neatlogs` | stores the raw body in `.state/webhooks/` and triggers a poll |

Any response built from stub data carries `x-antibody-mock: 1`. CORS allows `CORS_ORIGINS`, which defaults to `http://localhost:3000`.

## Environment (`antibody/.env`)

| Var | Notes |
|---|---|
| `NEATLOGS_API_KEY` | Used for intake (MCP), tracing (`workflow=antibody`) and diagnosis traces |
| `LLM_PROVIDER` | `groq` (what we use: the hackathon AWS account doesn't allow Bedrock), `anthropic`, `bedrock`, or `stub` |
| `GROQ_API_KEY` | Groq key; Groq's API is OpenAI-compatible and traced by `neatlogs.wrap` |
| `AWS_REGION`, `AWS_BEARER_TOKEN_BEDROCK` | Bedrock API key; standard AWS credentials also work. `.env` is exported to the process so boto3 can see it. |
| `MODEL_CHEAP`, `MODEL_STRONG` | model IDs, e.g. `openai/gpt-oss-20b` on Groq. Never hard-coded. |
| `PRICE_*_PER_MTOK` | USD per million tokens, used for the cost cap and the ledger cost. gpt-oss-20b on Groq: 0.075 in, 0.30 out |
| `PATIENT_URL`, `SCORER_URL` | detection's service; default `http://localhost:5050` |
| `USE_STUBS` | `1` = use the built-in stubs. With `0`, Antibody still falls back to the stubs, loudly, if detection's `/health` doesn't answer. |
| `GITHUB_REPO` | `owner/repo`; defaults to the `origin` remote |
| `ANTIBODY_COST_CAP_USD` | hard cap per incident (default 1.50). Stops and reports when reached. |
| `PATIENT_PROMPT_DIR`, `PATIENT_TOOL_FILES` | where the patient's prompts and tool code live in `detection/` |

No LLM is called when none is configured. Diagnosis then uses a template explanation, and fixes use deterministic rules for the three seeded bug shapes. Both are labelled as mock.

## What's real and what's stubbed

| Part | Status |
|---|---|
| Pipeline, state, breeding, replay, grading, acceptance rule, retries, cost cap | real |
| Approval phrase rule, reject, brief, Operator API | real |
| Worktree per attempt; code fixes replayed against a patient served *from the worktree* | real (tested on stubs) |
| PR with evidence (`gh pr create`) and immunity file | real. Tested once with a MOCK PR (#1), which was then closed. Stub runs don't push unless you pass `--ship-mock`. |
| Gate and backtest | real (replay only, never live Crustdata) |
| Intake from neatlogs MCP | written against the documented tools; needs `NEATLOGS_API_KEY` to verify live |
| Entire checkpoint reasoning | real once commits carry an `Entire-Checkpoint` trailer. Until then the commit message is quoted, and labelled as such. |
| Entire Trail on ship | needs `entire login` |
| Patient and scorer | **stubbed** (`antibody/stubs/`, fictional companies) until detection's service on `:5050` is up |
| LLM explanation and fixes | real (Groq, gpt-oss-20b). Diagnosis gets the actual prompt/code diff; fixes are find/replace edits. |

## What Antibody needs from detection (`/CONTRACT.md` is the source of truth)

- `POST /run` in `replay` mode with `prompt_override`, `faults`, `cassette_set` and `simulated: true`, as in the contract.
- `GET /runs` rows should include `trace_id`, `started_at` and `bug_flags`. Diagnosis uses them to separate failing runs from healthy ones.
- Code fixes are replayed against a copy of detection running from a git worktree. That needs `detection.cli:main` to run `serve` and to honour `DETECTION_PORT`.
- **Open question for the team (contract change):** bug 1 is a flag (`BUG_SWALLOW_TOOL_ERRORS`). To replay its baseline, Antibody sends an optional `bug_flags` object in `POST /run`. The contract doesn't list that field yet.
