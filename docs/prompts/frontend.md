# Frontend teammate

## For you (the human), not the coding agent

Besides the console, you also own the things judges look at:
- **`evidence/`**: collect trace links, screenshots, Entire checkpoint links and numbers from Rehaan and the detection teammate into `evidence/index.json` (the console's Evidence page reads it).
- **cfo.ai business plan**: sign up at https://cfo.ai/neathacks (card needed; cancel immediately in Settings → Billing). Model pricing, costs, revenue and runway using Antibody's measured cost per incident (Rehaan gives you the number). Save the plan in `evidence/`.
- **X posts with #neatHack** while building (at least 5, each with a screenshot).
- **The demo video** (≤ 3 minutes), recorded mostly from this console, and the submission post on X when the window opens Monday 7 PM IST.

Paste everything below the line into your coding agent, from the repo root.

---

# Your task: build the Antibody console in `client/`

You are helping me build the **frontend** of Antibody for neatHack 2026 (submissions close Monday Oct 12, 11:55 PM IST). Read `/AGENTS.md`, `/CONTRACT.md` and `client/AGENTS.md` first. `client/` is an existing Next.js app with shadcn/ui (`components.json`, `components/ui/`); follow its conventions and its AGENTS.md notes about the Next.js version.

## Folder rules
- Work only in `client/` (and `evidence/` for JSON data files). Never edit `server/`, `antibody/`, `detection/` or root files.

## What the console must do

Antibody catches AI agent failures that don't crash: the agent answers "200 OK" with a polished result that is quietly wrong. The console's job is to make an invisible failure visible in three seconds, then show the cure. Almost the whole demo video is filmed on this screen, so readability at 1080p matters more than features.

**Analogy:** a hospital monitor. Nobody reads the patient file in an emergency; one glance at the screen says healthy, sick, being treated, recovered.

## Data sources (exact shapes in `/CONTRACT.md`)

- **Detection API** (`NEXT_PUBLIC_DETECTION_URL`, default `http://localhost:5050`): `GET /runs?limit=20`, `GET /risks`.
- **Operator API** (`NEXT_PUBLIC_ANTIBODY_URL`, default `http://localhost:4000`): `GET /incidents`, `GET /incidents/{id}`, `GET /incidents/{id}/brief`, `POST /incidents/{id}/approve`, `POST /incidents/{id}/reject`, `GET /gate/latest`.
- **Files** in `evidence/`: `trust.json`, `index.json` (served via `client/public/` copies or read at build; pick the simplest).

**Mock first.** Build everything against mock JSON in `client/lib/mock/` that matches `/CONTRACT.md` exactly, switched by `NEXT_PUBLIC_USE_MOCK=1`. One module `client/lib/api.ts` with one typed function per endpoint (`snake_case` from the API is fine; map inside if you prefer camelCase). If a real response carries header `x-antibody-mock: 1`, show a small "MOCK" badge. Poll live pages every 2 seconds; no websockets.

Write realistic mocks: 20 recent runs (4–5 with failed tripwires, all with healthy-looking briefs), two incidents (one resolved: baseline must_fix 3/7 → accepted 7/7, must_not_change 4/4 both times, with one rejected attempt in between that broke a neighbour; one open), a diagnosis quoting the checkpoint reasoning ("Sales says briefs with fewer than 3 contacts are useless. Update the prompt so every brief includes at least 3 decision makers."), three risk forecasts (one `pending` with `eta_minutes: 20`, one `happened`, one `possible`), a gate report, a trust report.

## Pages

### `/` — Live ward (opening shot)
- Top strip of big numbers: runs in last 10 min, silent-failure rate, open incidents, gate status.
- **Live feed:** last 20 runs: domain, prompt version, a deliberately boring "200 OK", and a row of check dots (green passed, red failed). The point: everything says 200, yet red dots appear.
- Click a row → side panel: the brief exactly as a user would see it (looks perfect) next to the failed check's evidence sentence ("'Priya Sharma, VP Sales' appears in no tool result") and a link to the neatlogs trace.
- **At risk card:** forecasts from `/risks`: "crustdata.people_search errors 2% → 9%, likely to break in ~20 min". When one's outcome becomes `happened`, show "Predicted ✓".

### `/incidents/[id]` — The incident (main scene)
A vertical timeline that fills in as stages complete:
1. **Detected:** check name, count, first seen, links to failing traces.
2. **Diagnosed:** the commit and a large quote card with the Entire checkpoint reasoning, linking to the checkpoint URL. This is the Entire moment in the video; give it room.
3. **Family:** how many must_fix and must_not_change scenarios, one line each (domain, injected fault).
4. **Baseline:** the **scenario grid**.
5. **Attempts:** one row per fix attempt: collapsible syntax-highlighted diff, its grid, and the verdict (accepted, or rejected with the neighbour it broke).
6. **Shipped:** PR link, cost, time, approval status.
7. **Approval box:** text input; the "Approve" button stays disabled until the text is exactly `approve fix <n>`. Typing "yes" shows "Not an approval phrase." Show the API's response.

**The scenario grid is the signature visual:** one square per scenario, must_fix on top and must_not_change below, red or green, score in large type ("3/7 → 7/7 · 4/4 unchanged"). Animate baseline → accepted attempt by flipping squares one by one over about 1.5 seconds. Hover a square → domain, fault, failed checks, trace link.

### `/gate` — Prediction before deploy
Big verdict at top: "SAFE TO SHIP" or "BLOCKED: brings back 1 past incident". One row per immunity family with pass/fail and "would re-open inc_…".

### `/trust` — Why believe us
From `evidence/trust.json`: would-have-blocked count on the seeded bugs, planted-bug catch rate with the misses listed, false-alarm rate on harmless changes. Show misses plainly; label SIMULATED vs LIVE.

### `/evidence` — For judges
Table from `evidence/index.json`: each required evidence item (neatlogs traces, detections, Entire checkpoints, cfo.ai plan, X posts, trust report) with links.

## Design

- This is a monitoring console: dark, dense, high contrast. Monospace for IDs, traces and diffs. Exactly two signal colours: one for healthy, one for infected; everything else neutral.
- Avoid the default template look. If your agent has a frontend-design skill or guidance, use it.
- Minimum 16px body text, key numbers 32px+; check every page at 1920×1080.
- Use existing shadcn components where they fit; don't add a second component library.

## Build in phases. Stop after each phase, show screenshots, wait for "go".

1. **Phase 0:** `lib/api.ts`, mocks, env switch, layout and navigation, design tokens.
2. **Phase 1:** Live ward with the side panel and At risk card (mocks).
3. **Phase 2:** Incident page with timeline, scenario grid animation and approval box (mocks).
4. **Phase 3:** Gate, Trust, Evidence pages (mocks).
5. **Phase 4:** Switch to the real APIs one endpoint at a time as teammates ship them; keep mocks as fallback.
6. **Phase 5:** Recording polish: run through the demo flow at 1080p and fix anything hard to read.

If time runs short, cut in this order: Evidence page → Trust page → Gate page. Never cut the Live ward or the Incident page.

`.env.example` additions (in `client/`): `NEXT_PUBLIC_USE_MOCK=1`, `NEXT_PUBLIC_DETECTION_URL=http://localhost:5050`, `NEXT_PUBLIC_ANTIBODY_URL=http://localhost:4000`.

Start with Phase 0. Before writing code, reply with your plan in under 10 lines and any question that would change the design.
