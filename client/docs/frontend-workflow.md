# Frontend workflow and response map

Audience: first-time viewers and hackathon judges. Goal: understand the monitored
agent, the failure, the proposed repair, the evidence, and the human decision.
Keep existing APIs and backend modules unchanged. Do not run tests/builds/servers
for this change, per the user's instruction.

## Read model

| Source | Relevant response | User question |
| --- | --- | --- |
| Gateway /ready | ok, modules, watcher; 503 still includes report | Are backend services reachable? |
| Operator /system/info | agent, integrations, settings | What agent is protected and how? |
| Operator /overview | ten-minute counts, nullable rate, approvals, gate | What needs attention now? |
| Detection /runs | run + score; output may be null; violations are alarms | Did the agent give a supported answer? |
| Operator /incidents | id, detection, status, first_seen, trace_ids | Which issues need review? |
| Operator /incidents/:id | diagnosis, scenarios, families, attempts, resolution | What happened and what has been proved? |
| Operator /incidents/:id/brief | text | Explain this issue in ordinary language |
| Operator /incidents/:id/events | events, next cursor | What did the repair process execute? |
| Operator /incidents/:id/approve or reject | Resolution; 400/404/409/502 errors | Submit this human decision |
| Operator /aftercare | idle/pulling/gating/backtesting/done/failed, incident_id | Did post-merge verification finish? |
| Operator /gate/latest | safe/blocked, branch, family results, note; 404 absent | Did the saved regression checks pass? |
| Operator /trust | measured status, seeded bugs, catch rate, misses, clean checks | How strong is the evidence? |
| Operator /risks | per-tool trend forecasts and settled outcomes | Which tool may fail next? |
| Operator /evidence | labelled incident/gate/backtest/cost records | Can I inspect the proof? |
| Operator /drill/status,start,stop | sandbox state, incident_id, running | Run or follow an explicitly labelled demonstration |

Sources reviewed: gateway allowlist, Operator API implementation (including
system/info, drill and event endpoints), Detection API and scoring, client data
models, and checked-in API response samples. No live API calls were made.

## Interaction design

Primary routes: Overview, Issues, Agent activity, Release checks, Evidence.
Agent details, Integrations, Settings, Connect guide remain in a secondary group.
Existing Fixes route remains accessible; issue pages contain the primary decision.
Navigation is available on narrow screens. Remove fictional user/on-call identity.

Overview explains the product, shows authoritative ten-minute metrics, prioritises
approval/escalation, links to real incidents, and offers an optional demo section.
Incident pages default to a readable narrative: failure, cause, tests, decision.
Live logs/editor remain an explicit technical view. Historical incidents render
from persisted detail without needing an event stream.

## Integrity rules

- Missing/failed requests never become healthy or zero states.
- Status `resolved` does not imply `resolution.merged=true`.
- Approval is only shown for awaiting_approval + accepted_fix_id.
- An escalated issue needs a human; it is not successfully handled.
- Jev groundedness is advisory, separate from score.violations.
- No invented HTTP 200 statuses or decorative activity charts presented as data.
- Trust is measured only when status=measured, with denominators and misses.
- Readiness is HTTP/process availability. Integration `connected` often means
  credential/CLI presence, not a verified provider request.
- Mock provenance is visible. Drill data remains labelled as an isolated exercise.
- Keep recorded-data replay and real-time delivery distinct.

## Known boundary

The Next.js drill proxy still requires access to the separate sandbox URLs.
Those URLs default to localhost:4100 and :5150, so hosted demos need explicitly
reachable addresses. This redesign does not change backend routes or run a drill.
