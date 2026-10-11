# Frontend teammate: connect the console to the real backend

## For you (the human), not the coding agent

The backend is finished and running: Antibody on `:4000`, detection on `:5050`. Everything shown below is real data from the system, including two real incidents that were fixed, approved and merged (PRs #3 and #4). This prompt takes the console in PR #2 off its hand-written mocks and puts it on the live APIs. It's Phase 4 of `docs/prompts/frontend.md`, in full detail.

Before you start:
- **Start the backend**, or ask Rehaan to keep it running:
  - `cd detection && uv run detection serve` (`:5050`);
  - `cd antibody && uv run antibody serve` (`:4000`).
  - Check `http://localhost:4000/health` and `http://localhost:5050/health` both return `{"ok":true}`.
- **Remote viewers:** if you open the console through a tunnel or a deployed URL, see "Running it somewhere other than localhost" in the prompt. The browser can't reach `localhost:4000` from another machine.
- **Never paste API keys** into the console, the repo, screenshots or chat.

Paste everything below the line into your coding agent, from the repo root, on the `client` branch.

---

# Your task: connect the Antibody console (`client/`) to the real APIs

You're working on the **Antibody console**, the Next.js app in `client/`, for neatHack 2026. Submissions close Monday Oct 12, 11:55 PM IST. Read these first: `/AGENTS.md`, `/CONTRACT.md`, `client/AGENTS.md`, `docs/prompts/frontend.md` (what each page is for) and `antibody/README.md` (the Operator API).

The console was built against mocks. Both backends are now finished and return real data. Your job is to make every page work against the live APIs, correctly and robustly, without losing the mock mode.

## Folder rules (strict)
- **Where you may write:** only in `client/`, plus `evidence/` for JSON data files.
- **Never edit** `antibody/`, `detection/`, `voice/`, `server/` or any root file.
- **If the backend seems wrong** or is missing something, don't work around it by faking data. Write the issue in `client/BACKEND_REQUESTS.md` (endpoint, what you expected, what you got) and carry on.
- **Never commit secrets.** Keep `client/.env.example` with empty or placeholder values.

## Honesty rules (judges check these)
- **Never invent numbers, traces, links or statuses.** If an API returns nothing, show an empty state that says so ("No gate run yet", "No incidents"). Don't show sample data.
- **The MOCK badge:** any response with the header `x-antibody-mock: 1` must show a visible MOCK badge on that panel. `NEXT_PUBLIC_USE_MOCK=1` must show a global "MOCK DATA" banner.
- **Data labels:** keep the labels the API sends (`SIMULATED`, `LIVE`, `RECORDED`, `SEEDED`, `MOCK`) and show them as badges, never hidden.
- **Approval is never automatic.** The console may only send the phrase the human typed. Never pre-fill or auto-submit `approve fix N`.

## The two APIs

| Service | Env var in `client/` | Default | Notes |
|---|---|---|---|
| Detection API | `NEXT_PUBLIC_DETECTION_URL` | `http://localhost:5050` | the agent being monitored, plus its scoring and forecasts |
| Operator API (Antibody) | `NEXT_PUBLIC_ANTIBODY_URL` | `http://localhost:4000` | incidents, fixes, approvals, gate, trust |
| neatlogs trace links | `NEXT_PUBLIC_NEATLOGS_TRACE_URL` | empty | optional URL template with `{trace_id}` |

`client/lib/api.ts` already has a `request()` helper that returns `{ data, mock }` and throws `ApiError` with `body.error`. Keep that design. Every endpoint below gets one typed function in `lib/api.ts`, with a mock branch.

**Real response samples** for every endpoint, captured from the running system, are in `antibody/fixtures/api-samples/`. Treat them as the source of truth for the shapes:

| File | Endpoint |
|---|---|
| `health.json` | `GET :4000/health` |
| `overview.json` | `GET :4000/overview` |
| `incidents.json` | `GET :4000/incidents` |
| `incident_0.json`, `incident_1.json` | `GET :4000/incidents/{id}` (two real, resolved incidents) |
| `incident_0_brief.json`, `incident_1_brief.json` | `GET :4000/incidents/{id}/brief` |
| `approve_refused.json` | `POST :4000/incidents/{id}/approve` with a wrong phrase (HTTP 400) |
| `gate_latest.json` | `GET :4000/gate/latest` |
| `trust.json` | `GET :4000/trust` |
| `evidence.json` | `GET :4000/evidence` |
| `aftercare.json` | `GET :4000/aftercare` |
| `risks.json` | `GET :4000/risks` (passed through from detection) |
| `detection_runs.json` | `GET :5050/runs?limit=20` |
| `detection_risks.json`, `detection_health.json` | detection's own `/risks`, `/health` |

**Replace the hand-written mocks with these samples.** Add an npm script `sync-samples` that copies `../antibody/fixtures/api-samples/*.json` into `client/lib/mock/samples/`, the same pattern as `sync-evidence`. Then make the mock branch of each `lib/api.ts` function return the matching sample. Commit the copied files so the console builds without the backend. Delete mock data that no longer matches the real shapes, such as the old `fixes` array and the old trust shape.

## Endpoints

### Operator API (`NEXT_PUBLIC_ANTIBODY_URL`)

| Method + path | Returns | Errors |
|---|---|---|
| `GET /health` | `{ "ok": true }` | network error = backend down |
| `GET /overview` | top-strip numbers (see `Overview` type) | — |
| `GET /incidents` | `Incident[]`, **newest first** | — |
| `GET /incidents/{id}` | `IncidentDetail` (contract keys plus the extras below) | 404 `{ "error": "Unknown incident" }` |
| `GET /incidents/{id}/brief` | `{ "text": "3–5 sentences" }`, written to be read aloud | 404 |
| `POST /incidents/{id}/approve` | body `{ fix_id, phrase, channel: "typed" }` → the updated `Resolution` | see "Approval" |
| `POST /incidents/{id}/reject` | body `{ fix_id, reason }` → the updated `Resolution`; the incident becomes `escalated` | 404 |
| `GET /gate/latest` | `GateReport` | **404 `{ "error": "No gate report yet" }` until the first gate run; show an empty state, not an error** |
| `GET /trust` | `TrustApi` (see types) | — |
| `GET /evidence` | `EvidenceApi` (labelled proof items) | — |
| `GET /aftercare` | `Aftercare`, the job that runs after a merge | — |
| `GET /risks` | `RiskForecast[]`, newest first (passed through from detection) | — |

### Detection API (`NEXT_PUBLIC_DETECTION_URL`)

| Method + path | Returns |
|---|---|
| `GET /health` | `{ "ok": true }` |
| `GET /runs?limit=20` | `ScoredRun[]` (`{ run, score }`), **newest first**, real production runs only (never Antibody's replays) |
| `GET /risks` | same as the Operator API's `/risks`; prefer the Operator one so there's one origin |

Errors: Antibody returns `{ "error": "..." }`. FastAPI request-validation errors return 422 with `{ "detail": [ { "msg": ... } ] }`. Make `request()` turn a `detail` array into a readable message (join the `msg` fields) instead of `[object Object]`.

## Types: update `client/lib/types.ts`

The current types follow the contract, but the real API adds fields and makes some contract fields nullable. Make these changes. Keep snake_case, as the API sends it.

```ts
// --- nullability fixes (the API really sends null for these) ---
export interface Step {
  index: number;
  kind: "llm" | "tool";
  name: string;
  args: Record<string, unknown> | null;
  result: unknown;
  error: ToolError | null;
  latency_ms: number | null;
  cost_usd: number | null;
  synthetic: boolean;
}
export interface DecisionMaker { name: string; title: string | null; linkedin_url: string | null; source_step_index: number | null }
export interface ResearchBrief {
  domain: string;
  company_name: string | null;          // null when the company wasn't confirmed
  company_match_confirmed: boolean;
  headcount: number | null;
  hiring_signals: string[];
  decision_makers: DecisionMaker[];
  summary: string;
  no_decision_makers_reason: string | null;
}
// AgentRun: trace_id, output, total_cost_usd, started_at, ended_at can all be null.

// ToolError.code: keep the union but also accept any string ("LLM_ERROR" can appear on llm steps).

export interface Diagnosis {
  incident_id: string;
  commit_sha: string | null;
  checkpoint_id: string | null;
  checkpoint_url: string | null;        // https://entire.io/gh/OWNER/REPO/commit/<sha>; null if no Entire checkpoint
  reasoning_excerpt: string | null;     // WHY the change was made (Entire session, or the commit message)
  reasoning_source?: "entire_checkpoint" | "commit_message" | null;
  good_trace_ids: string[];
  explanation: string;                  // plain-English cause
  fix_kind: "prompt_patch" | "prompt_rollback" | "tool_wrapper_patch";
  target_file?: string | null;          // e.g. detection/detection/patient/agent.py
  prompt_version?: string | null;
  bug_flags?: Record<string, boolean>;
}

export interface Verdict {
  scenario_id: string;
  passed: boolean;
  failed_checks: string[];
  run_id: string;
  trace_id: string | null;
  synthetic_tool_calls: number;
  evidence?: string[];                  // one sentence per failed check: use it in the grid hover
}

export interface FamilyResult {
  incident_id: string;
  candidate: string;                    // "baseline" or "fix_1", "fix_2", ...
  must_fix_passed: number;
  must_fix_total: number;
  must_not_change_passed: number;
  must_not_change_total: number;
  verdicts: Verdict[];
  total_tool_calls?: number;
  synthetic_tool_calls?: number;        // > 0 means some tool calls had no recording: show a small warning
  cost_usd?: number;
  warnings?: string[];
}

export interface Resolution {
  incident_id: string;
  accepted_fix_id: string | null;       // null = no fix passed (escalated)
  before: FamilyResult;
  after: FamilyResult | null;
  attempts: string[];
  pr_url: string | null;
  cost_usd: number;
  duration_ms: number;
  approval: Approval | null;
  rejection?: { fix_id: string; reason: string; at: string } | null;
  merged?: boolean;
}

// --- extras on GET /incidents/{id} (replace the old `fixes?: FixAttempt[]`) ---
export interface FixCandidate {
  id: string;                           // "fix_1"
  incident_id: string;
  kind: string;
  description: string;                  // one paragraph: what the fix does
  diff: string;                         // unified diff
  attempt: number;
  branch: string | null;
}
export interface AttemptView {
  fix: FixCandidate;
  result: FamilyResult | null;          // null if the attempt couldn't be evaluated
  accepted: boolean;
  error: string | null;
  verdict: string;                      // "accepted" | "rejected: broke airtable.com" | "rejected: must_fix 5/7" | "error: ..." | "not run"
  broke: { scenario_id: string; domain: string | null; failed_checks: string[] }[];  // healthy cases it broke
  still_failing: string[];              // must_fix scenario ids still failing
}
export interface IntakeInfo {
  source: "neatlogs" | "detection_runs"; // which system opened the incident
  window_minutes: number;
  threshold: number;
  occurrences: number;
  at: string;
}
export interface IncidentDetail {
  incident: Incident;
  diagnosis: Diagnosis | null;          // null until diagnosis finishes
  families: FamilyResult[];             // [baseline, ...each attempt's result], in order; [] until baseline finishes
  resolution: Resolution | null;        // null until the pipeline finishes
  scenarios?: Scenario[];               // the variant family; [] until bred
  attempts?: AttemptView[];             // grows as attempts complete
  intake?: IntakeInfo | null;
  trace_url_template?: string | null;   // e.g. "https://.../trace/{trace_id}"; null = not configured
}

// --- gate ---
export interface GateFamily {
  incident_id: string;
  must_fix_passed: number;
  must_fix_total: number;
  reopens: boolean;                     // true = this branch brings that incident back (or breaks its healthy cases)
  must_not_change_passed?: number;
  must_not_change_total?: number;
  message?: string;                     // "re-opens inc_…: must_fix 3/7" | "ok inc_…: must_fix 7/7, must_not_change 3/3"
}
export interface GateReport {
  branch: string;
  verdict: "safe" | "blocked";
  families: GateFamily[];
  created_at: string;
  note?: string | null;                 // set when BLOCKED without a failing family, e.g. "the patient at … is not reachable, so nothing was verified"
}

// --- new endpoints ---
export interface Overview {
  runs_last_10_min: number;
  silent_failures_last_10_min: number;
  silent_failure_rate: number | null;   // null when there were no runs
  open_incidents: number;               // every status except resolved
  awaiting_approval: number;
  gate_verdict: "safe" | "blocked" | null; // null = no gate run yet
}
export interface Aftercare {
  state: "idle" | "pulling" | "gating" | "backtesting" | "done" | "failed";
  incident_id?: string;
  error?: string | null;
  updated_at?: string;
  pulled?: string;
  gate_verdict?: "safe" | "blocked";
  backtest_caught?: number;
  backtest_families?: number;
}
export interface SeededBug {
  bug: string;                          // plain description of the planted bug
  commit: string;
  check: string;                        // the tripwire it trips
  incident_id: string | null;
  caught_in_production: boolean;
  would_have_blocked: boolean;          // would the gate have stopped this commit before deploy
  note: string;                         // why, in plain words; shown for misses
}
export interface BacktestRow {
  incident_id: string;
  commit: string;
  caught: boolean;
  bad: string;                          // gate message on the causing commit
  false_alarm: boolean;
  parent: string;                       // gate message on the commit before it
  mock: boolean;
}
export interface TrustApi {
  status: "measured" | "not_measured_yet";
  label: string;                        // "SIMULATED (replay of recorded tool responses against seeded bugs)"
  seeded_label: string;                 // "SEEDED: planted for the demo, ..."
  created_at: string | null;
  seeded_bugs: SeededBug[];
  would_have_blocked: number;
  catch_rate: number | null;            // 0..1
  misses: SeededBug[];                  // list these plainly
  false_alarm_rate: number | null;      // 0..1
  false_alarm_checks: number;
  false_alarms: number;
  families: BacktestRow[];
}
export interface EvidenceApi {
  source: "antibody";
  created_at: string;
  // kind "incident": label, incident_id, detection, status, opened_by, trace_ids, commit, commit_url,
  //   checkpoint_url, reasoning, reasoning_source, explanation, before/after {must_fix, must_not_change},
  //   attempts [{id, accepted, description, error}], pr_url, approval, cost_usd, duration_ms, seeded_bug
  // kind "gate" (a GateReport + label), "backtest" (the backtest summary), "costs" (cost per incident)
  items: ({ kind: "incident" | "gate" | "backtest" | "costs"; label?: string } & Record<string, unknown>)[];
}
```

## Page-by-page wiring

### `/` (Live ward). Poll every 2 s.
- **Top strip:** use `GET /overview` instead of computing it on the client. Show:
  - `silent_failure_rate` as a percentage, or "—" when it's null;
  - `gate_verdict`: SAFE / BLOCKED / "no gate run yet".
- **Live feed:** `GET :5050/runs?limit=20`. Each row shows:
  - the domain: `run.input.domain`;
  - `run.prompt_version`;
  - "200 OK";
  - one dot per tripwire in `score.checks` whose id starts with `tw_`: red if `passed === false`.
- **`jev_grounded` is advisory:** render it apart from the tripwire dots, as a small 0–1 score chip. Never use it as an alarm; only `score.violations` counts as a failure.
- **Side panel:** the brief is `run.output`. Show `company_name` (it may be null), `summary`, `decision_makers` and `no_decision_makers_reason`. Next to it, show the evidence sentence of each failed check (`score.checks[].evidence`) and the steps list, with tool errors shown (`step.error.code`).
- **Trace link:** build it from `trace_url_template` (from any incident detail) or `NEXT_PUBLIC_NEATLOGS_TRACE_URL`, replacing `{trace_id}`. If neither is set, show the trace id in monospace with a copy button. Never invent a URL.
- **At risk card:** `GET /risks`. Show:
  - `evidence` (it's already a sentence);
  - `likelihood`;
  - `eta_minutes` (0 means "threshold already crossed", so say that, not "0 min");
  - `related_check`;
  - an outcome badge: `pending` → "watching", `happened` → "Predicted ✓", `did_not_happen` → "didn't happen".

  The list holds history. Group by `subject` and show the newest per subject, with older ones collapsed.

### `/incidents/[id]` (the incident). Poll every 2 s until the status is `resolved` or `escalated`, then every 10 s.
The status goes `open → diagnosing → simulating → fixing → awaiting_approval → resolved`, or ends at `escalated`. Each section appears when its data exists, so render an empty or skeleton state, never an error:
1. **Detected:**
   - `incident.detection`, `incident.first_seen`, and the number of `incident.trace_ids` (each a trace link);
   - from `intake`: "Opened by neatlogs" or "Opened from detection's run log" (`intake.source`), plus `occurrences` in `window_minutes`.
2. **Diagnosed** (when `diagnosis` isn't null):
   - the commit (`commit_sha`, first 8 characters, linking to `https://github.com/<repo>/commit/<sha>`; take the repo from `evidence` items' `commit_url`, or add `NEXT_PUBLIC_GITHUB_REPO`);
   - `explanation`;
   - **the quote card:** `reasoning_excerpt`, labelled "From the Entire checkpoint" when `reasoning_source === "entire_checkpoint"`, linking to `checkpoint_url`; otherwise "From the commit message", with no Entire link;
   - `fix_kind` and `target_file`.
3. **Family:** the `scenarios`, grouped by `role`. One line each: `domain`, plus the injected fault `faults[0].error.code` on `faults[0].tool` (or "no fault").
4. **Baseline:** the scenario grid from `families[0]` (`candidate === "baseline"`). Match each `verdicts[].scenario_id` to `scenarios[].id` to get the role and domain. Grid hover shows the domain, fault, `failed_checks`, `verdict.evidence` and the trace link.
5. **Attempts:** one row per `attempts[]` item:
   - `fix.id`, `fix.description`;
   - the collapsible `fix.diff`;
   - its grid, from `result` (when it isn't null);
   - `verdict`, shown as a badge: green if `accepted`. If the text starts with `rejected: broke`, list `broke[].domain`; if it starts with `error:`, show `error`.
   - **Grid animation:** flip from the baseline grid to the accepted attempt's grid.
6. **Shipped** (when `resolution` isn't null):
   - `pr_url` as a link;
   - `cost_usd` as dollars;
   - `duration_ms / 1000` as seconds;
   - before → after as "must_fix 5/7 → 7/7 · must_not_change 3/3 kept";
   - if `merged`, "Merged".
7. **Decision:**
   - **Approved** (`resolution.approval` set): "Approved: '<phrase>' via <channel> at <time>". `channel` is `voice` when approved on the Telegram call; show a microphone icon then.
   - **Rejected** (`resolution.rejection` set): show the reason.
   - **Escalated:** if `incident.status === "escalated"` and `accepted_fix_id === null`, show "No fix passed the whole family. Needs a human." plus the attempts with their verdicts.
8. **Brief:** `GET /incidents/{id}/brief` → `text`. That's what the voice bot reads to the engineer; show it as "What the on-call engineer heard".

### Approval box (on the incident page)
- **When to show it:** only when `incident.status === "awaiting_approval"` and `resolution.accepted_fix_id` is set. The fix number `N` comes from `accepted_fix_id` (`"fix_2"` → 2).
- **The input:** a placeholder (`Type: approve fix N`), the "Approve" button and a "Reject" button with a required reason field.
- **When the button enables:** only when the trimmed text matches `/^approve fix (\d+)$/i` **and** the number equals N. If it's "yes", "ok" or anything else, keep the button disabled and show "Not an approval phrase. Type: approve fix N".
- **Sending:** `POST /incidents/{id}/approve` with `{ fix_id: accepted_fix_id, phrase: <exactly what was typed, trimmed>, channel: "typed" }`. Never send a phrase the user didn't type.
- **Response handling:**

  | Response | What to show |
  |---|---|
  | 200 | the returned `Resolution`, `merged: true` and `pr_url`. Re-fetch the detail; the status becomes `resolved`. |
  | 400 | `error` ("Not an approval phrase" or "Phrase approves fix 1, but the request is for fix_2") |
  | 404 | unknown incident |
  | 409 | "fix_1 is not the accepted fix (fix_2)" or "Incident is resolved, not awaiting approval". This happens when someone already approved by voice; just re-fetch. |
  | 502 | "Approved, but merge failed: …". Show it in red; the approval is recorded but the PR isn't merged. |

- **The aftercare banner:** after a successful approval, Antibody pulls `main`, gates it against every saved family and refreshes the backtest. Poll `GET /aftercare` every 3 s and show a small progress banner: `pulling → gating → backtesting → done | failed`. When it's `done`, re-fetch `/gate/latest`, `/trust` and `/overview`. This takes several minutes; don't block the page on it.
- **Reject:** `POST /incidents/{id}/reject` with `{ fix_id, reason }`. The status becomes `escalated`, and nothing is merged.

### `/gate`
- **Data:** `GET /gate/latest`. A 404 means "No gate run yet"; show it as an empty state.
- **The verdict:** big, "SAFE TO SHIP" or "BLOCKED".
- **One row per family:** `incident_id`, `must_fix_passed/must_fix_total`, `must_not_change_passed/must_not_change_total` when present, and `message`.
- **`note`:** if it's set (BLOCKED with no failing family), show it prominently. It means the gate couldn't verify anything, for example because the agent service was down.
- **Header:** `branch` and `created_at`.

### `/trust`
- **Data:** switch from `evidence/trust.json` to `GET /trust` (live). Keep `evidence/trust.json` as the fallback when the API is unreachable, and label that "snapshot".
- **When `status === "not_measured_yet"`:** say "Not measured yet: the backtest runs after the first merge."
- **What to show:**
  - "Would have blocked **X of Y** planted bugs before deploy": `would_have_blocked` of `seeded_bugs.length`;
  - `catch_rate` as a percentage;
  - false alarms: `false_alarms` of `false_alarm_checks` clean commits (`false_alarm_rate`).
- **The table:** one row per `seeded_bugs` item: `bug`, `check`, "caught in production" ✓/✗, "gate would have blocked" ✓/✗, `note`.
- **Misses:** list them plainly. Today bug 1, "invented contacts", never fired, so it's a miss with an honest note.
- **Labels:** show `label` (SIMULATED) and `seeded_label` (SEEDED) as badges.
- **Adapter, if you keep the old component:** if the existing page component expects the old `TrustMeasured` shape, write `toTrustView(t: TrustApi)` in `lib/api.ts` rather than reshaping the backend:
  - `would_have_blocked`: `{ caught: t.would_have_blocked, total: t.seeded_bugs.length }`;
  - `planted_bugs.misses`: `t.misses.map(m => ({ bug: m.bug, why: m.note }))`;
  - `false_alarms`: `{ alarms: t.false_alarms, harmless_changes: t.false_alarm_checks }`;
  - `label`: `t.label.split(" ")[0]`;
  - `generated_at`: `t.created_at`.

### `/evidence`
- **Your checklist stays:** `evidence/index.json` is yours. It lists every required item for judges (cfo.ai plan, X posts and so on).
- **Live proof underneath:** add a "Live proof from Antibody" section from `GET /evidence`. For each `kind: "incident"` item:
  - its label badge, `incident_id`, `detection` and `opened_by`;
  - trace ids (links);
  - `commit_url`; `checkpoint_url` (Entire); `reasoning` with its source;
  - before → after; `pr_url`; `approval` (phrase, channel, time); `cost_usd`.
- **Other kinds:** show the `gate`, `backtest` and `costs` items as compact cards.

## Polling, errors and staleness
- **Shared hook:** use `usePoll` everywhere (it already keeps the last good data on error).
- **Stale data:** if a poll fails, show a small "stale since hh:mm:ss, retrying" indicator on that panel. Don't wipe the data.
- **Backend down:** a network error on `/health` means the backend is down. Show one global banner, "Antibody API unreachable at <url>", not an error on every card.
- **Don't hammer the server:** stop polling pages that aren't visible (`document.visibilityState`).
- **Times:** they're UTC ISO strings. Show local time, plus relative time ("3 min ago").

## Running it somewhere other than localhost
The browser calls the APIs directly. That works on your own machine (console on `:3000`, APIs on `:4000` and `:5050`). It breaks when someone opens the console from another machine, through a tunnel or a deployed URL, because their browser can't reach your `localhost`. Pick one:
1. **Proxy (recommended):** add rewrites in `next.config.ts`:
   - `/api/antibody/:path*` → `${ANTIBODY_URL}/:path*`;
   - `/api/detection/:path*` → `${DETECTION_URL}/:path*`.

   Then set `NEXT_PUBLIC_ANTIBODY_URL=/api/antibody` and `NEXT_PUBLIC_DETECTION_URL=/api/detection`. Only the console's URL has to be public; CORS no longer matters because it's same-origin. Read the target URLs from server-side env vars (not `NEXT_PUBLIC_`). Check that the `x-antibody-mock` header survives the proxy.
2. **Direct:** expose both APIs, put those URLs in the `NEXT_PUBLIC_*` vars, and ask Rehaan to add the console's origin to `CORS_ORIGINS` in `antibody/.env` and `detection/.env`.

**Security note:** a public Antibody URL exposes the approve endpoint. The exact-phrase rule is its only guard, and the phrase isn't secret. Keep tunnel URLs out of public posts, and close them after the demo.

## Env (`client/.env.example`)
```
NEXT_PUBLIC_USE_MOCK=0
NEXT_PUBLIC_DETECTION_URL=http://localhost:5050
NEXT_PUBLIC_ANTIBODY_URL=http://localhost:4000
NEXT_PUBLIC_NEATLOGS_TRACE_URL=
NEXT_PUBLIC_GITHUB_REPO=dripston/hackathon
# only with the proxy option:
ANTIBODY_URL=http://localhost:4000
DETECTION_URL=http://localhost:5050
```

## Done when (check each one against the live backend with `NEXT_PUBLIC_USE_MOCK=0`)
1. **Live ward:** shows real runs from `:5050`, the overview strip from `/overview`, and forecasts with outcome badges. `jev_grounded` shows as a score chip, not a red dot.
2. **Incident pages:** both real incidents (`inc_20261011_1102_tw_empty_after_error`, `inc_20261011_1137_tw_company_match_skipped`) render every section:
   - the Entire quote card on the first, linking to its checkpoint;
   - the grid going 5/7 → 7/7 on the first and 1/7 → 7/7 on the second;
   - the diff, PR links #3 and #4;
   - "Approved via voice" on the first and "typed" on the second;
   - the brief text.
3. **Approval box:** hidden on resolved incidents. On an `awaiting_approval` incident (ask Rehaan for one, or use the mock), "yes" keeps the button disabled, and `approve fix N` sends exactly what was typed.
4. **`/gate`:** shows SAFE with two families, each 7/7 and 3/3. A 404 shows "No gate run yet" (test it by pointing at a wrong URL).
5. **`/trust`:** shows "would have blocked 2 of 3", with the invented-contacts miss listed and its note; 0 false alarms out of 1.
6. **`/evidence`:** your checklist, plus live proof cards from `GET /evidence`.
7. **MOCK badges:** stopping detection (`:5050`) makes Antibody fall back to stub data, and the panels that use it show the MOCK badge. Stopping Antibody shows the global "unreachable" banner, and the last good data stays visible.
8. **Mock mode:** `NEXT_PUBLIC_USE_MOCK=1` renders every page from `lib/mock/samples/` with the MOCK DATA banner.
9. **Build and lint:** `npm run build` and `npm run lint` pass. There are no TypeScript `any` casts to hide shape mismatches.
10. **Screenshots:** of each page at 1920×1080 against the live backend, saved to `evidence/screenshots/`.

## How to work
- **First reply:** your plan in under 10 lines, then any question that would change it.
- **Order:** types → `lib/api.ts` plus samples → Live ward → Incident page → Gate → Trust → Evidence → polish.
- **Check each page live** before moving on. Run `curl -i http://localhost:4000/<path>` to see the real response and headers.
- **Gaps:** if a field you need isn't in the API, write it in `client/BACKEND_REQUESTS.md`. Don't fake it.
- **Commits:** small ones on the `client` branch, with clear messages. Never commit `.env`.
