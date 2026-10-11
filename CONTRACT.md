# CONTRACT.md — how the four parts talk to each other

This is the one file every teammate's coding agent must follow. It defines who runs what, on which port, and the exact JSON each part sends and receives. If something here has to change, the person who needs the change tells the others first; nobody edits this file alone.

**Analogy:** four people building one house in four rooms. This file is the plumbing and wiring plan. As long as every pipe ends where this plan says, the rooms connect on Monday without anyone tearing down a wall.

## Who owns what

| Folder | Owner | What it is | Runs on |
|---|---|---|---|
| `detection/` | Detection teammate | The patient agent (Crustdata company research), tripwires, Jev checks, risk forecasts, traffic script | `http://localhost:5050` |
| `antibody/` | Rehaan | Antibody core: incidents, diagnosis, variant families, fixes, PRs, the gate, the Operator API | `http://localhost:4000` |
| `client/` | Frontend teammate | Next.js console | `http://localhost:3000` |
| `server/` | Voice teammate | Voice agent | its own port; calls the Operator API |
| `evidence/` | Frontend teammate | Proof for judges (links, screenshots, numbers) | — |

Nobody edits another person's folder. Shared root files (`CONTRACT.md`, `AGENTS.md`, `README.md`, `hackathon.md`, `.gitignore`) change only after telling the team.

## JSON conventions

- `snake_case` keys everywhere (Python services). The frontend maps to camelCase only inside its own code if it wants to.
- Times are ISO 8601 strings in UTC.
- Any response built from fake or stub data carries the HTTP header `x-antibody-mock: 1`, and the frontend shows a small "MOCK" badge when it sees it.

## Data shapes

```jsonc
// ToolError
{ "code": "HTTP_429", "message": "rate limited" }   // codes: HTTP_429, HTTP_500, TIMEOUT, EMPTY, NO_CASSETTE

// Step: one LLM or tool call inside a patient run
{ "index": 2, "kind": "tool", "name": "crustdata.people_search",
  "args": {...}, "result": [...], "error": null,
  "latency_ms": 840, "cost_usd": 0.0, "synthetic": false }   // synthetic=true: replay had no recording

// AgentRun: what the patient returns
{ "run_id": "run_...", "trace_id": "neatlogs trace id or null",
  "input": { "domain": "stripe.com" },
  "prompt_version": "v1", "bug_flags": { "swallow_tool_errors": false },
  "steps": [Step],
  "output": ResearchBrief | null,
  "total_cost_usd": 0.004, "simulated": false,
  "started_at": "...", "ended_at": "..." }

// ResearchBrief: the patient's answer
{ "domain": "stripe.com", "company_name": "Stripe", "company_match_confirmed": true,
  "headcount": 8000, "hiring_signals": ["..."],
  "decision_makers": [ { "name": "...", "title": "...", "linkedin_url": "...", "source_step_index": 2 } ],
  "summary": "...", "no_decision_makers_reason": null }

// CheckResult: one tripwire or Jev check
{ "id": "tw_invented_person", "passed": false,
  "evidence": "'Priya Sharma, VP Sales' appears in no people-search result", "score": null }
  // Jev checks use ids like "jev_grounded" and fill "score" (0..1)

// RunScore: what the scorer returns
{ "run_id": "run_...", "checks": [CheckResult], "violations": ["tw_invented_person"] }

// RiskForecast: something trending toward breaking
{ "id": "risk_...", "signal": "tool_error_rate",   // tool_error_rate | retry_rate | near_miss | latency_p95 | unstable_output | model_retirement
  "subject": "crustdata.people_search",
  "current": 0.09, "threshold": 0.15, "trend_per_hour": 0.06,
  "eta_minutes": 20, "likelihood": "likely",      // likely | possible
  "related_check": "tw_empty_after_error",
  "evidence": "People search errors rose from 2% to 9% in the last hour",
  "created_at": "...", "outcome": "pending" }      // pending | happened | did_not_happen

// Incident (Antibody)
{ "id": "inc_20261011_1420_tw_invented_person", "detection": "tw_invented_person",
  "trace_ids": ["..."], "workflow": "company-research", "first_seen": "...",
  "status": "open" }   // open | diagnosing | simulating | fixing | awaiting_approval | resolved | escalated

// Diagnosis (Antibody)
{ "incident_id": "...", "commit_sha": "...", "checkpoint_id": "...",
  "checkpoint_url": "https://entire.io/gh/OWNER/REPO/commit/FULL_SHA",
  "reasoning_excerpt": "Sales says briefs with fewer than 3 contacts are useless...",
  "good_trace_ids": ["..."], "explanation": "...", "fix_kind": "prompt_patch" }

// Scenario, Verdict, FamilyResult (Antibody)
{ "id": "sc_...", "incident_id": "...", "role": "must_fix", "domain": "...",
  "faults": [ { "tool": "crustdata.people_search", "at_call": 1, "error": ToolError } ],
  "cassette_set": "base", "expected_checks": ["tw_invented_person"] }
{ "scenario_id": "...", "passed": true, "failed_checks": [], "run_id": "...", "trace_id": "...", "synthetic_tool_calls": 0 }
{ "incident_id": "...", "candidate": "baseline",
  "must_fix_passed": 3, "must_fix_total": 7, "must_not_change_passed": 4, "must_not_change_total": 4,
  "verdicts": [Verdict] }

// Resolution (Antibody)
{ "incident_id": "...", "accepted_fix_id": "fix_2", "before": FamilyResult, "after": FamilyResult,
  "attempts": ["fix_1", "fix_2"], "pr_url": "https://github.com/...", "cost_usd": 0.42, "duration_ms": 184000,
  "approval": { "phrase": "approve fix 2", "channel": "typed", "at": "..." } }

// GateReport (Antibody)
{ "branch": "feature/x", "verdict": "blocked",   // safe | blocked
  "families": [ { "incident_id": "...", "must_fix_passed": 4, "must_fix_total": 7, "reopens": true } ],
  "created_at": "..." }
```

## Detection API (`detection/`, port 5050)

| Method + path | Body → Response |
|---|---|
| `GET /health` | → `{ "ok": true }` |
| `POST /run` | `{ domain, prompt_version?, prompt_override?, tool_mode: "live" \| "record" \| "replay", cassette_set, faults: [Fault], simulated: bool }` → `AgentRun`. In `replay` mode it never calls Crustdata; a call with no recording returns an empty result with `synthetic: true` |
| `POST /score` | `AgentRun` → `RunScore` (tripwires + Jev) |
| `GET /runs?limit=20` | recent real (non-simulated) runs with their scores: `[{ run: AgentRun, score: RunScore }]` |
| `GET /risks` | `[RiskForecast]` |

## Operator API (`antibody/`, port 4000) — used by the console and the voice agent

| Method + path | Body → Response |
|---|---|
| `GET /health` | → `{ "ok": true }` |
| `GET /incidents` | → `[Incident]` |
| `GET /incidents/{id}` | → `{ incident, diagnosis, families: [FamilyResult], resolution }` |
| `GET /incidents/{id}/brief` | → `{ "text": "3–5 plain sentences: what broke, why, proposed fix, family score" }` |
| `POST /incidents/{id}/approve` | `{ fix_id, phrase, channel: "typed" \| "voice" }`. Works only if `phrase` is exactly `approve fix <n>` (trimmed, case-insensitive). "yes", "ok", "do it" → 400 `{ "error": "Not an approval phrase" }` |
| `POST /incidents/{id}/reject` | `{ fix_id, reason }` |
| `GET /gate/latest` | → `GateReport` |
| `GET /risks` | → passthrough of detection's `/risks` |
| `POST /webhooks/neatlogs` | raw neatlogs alert body; stored, triggers a poll |

CORS: both APIs allow `http://localhost:3000` and the console's deployed URL.

## neatlogs naming (shared so detections, traces and the console agree)

- Workflow names: `company-research` (patient), `antibody` (Antibody's own work).
- Custom attributes on each patient trace: `antibody.run_id`, `antibody.prompt_version`, `antibody.bug_flags`, `antibody.simulated` (true for Antibody's simulations), `antibody.violations` (count), `antibody.tw.<check_id>` (1 = failed), `antibody.jev.<check>` (score 0..1).
- Detections: `tw_invented_person`, `tw_empty_after_error`, `tw_company_match_skipped`, `tw_claimed_success_on_failure`, `jev_grounded_low`. All exclude `antibody.simulated = true`.

## Run everything locally

```bash
cd detection && uv run detection serve      # :5050
cd antibody  && uv run antibody serve       # :4000
cd antibody  && uv run antibody watch       # polls neatlogs
cd client    && npm run dev                 # :3000
```
