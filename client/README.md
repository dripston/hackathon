# Antibody console

Next.js console for Detection (:5050) and the Antibody Operator API (:4000).

## Configuration

Live mode is the default. No client environment file is required for local use.
The browser uses `/api/antibody` and `/api/detection`; Next.js proxies these to
`http://127.0.0.1:8000/api/antibody` and `/api/detection` through the unified
server. Override server-side `SERVER_URL` when hosting the console elsewhere.
Starting `server/` launches the backend modules; see `../server/README.md`.
The frontend host must be able to reach those addresses.

Explicit `NEXT_PUBLIC_ANTIBODY_URL` / `NEXT_PUBLIC_DETECTION_URL` overrides are
still supported. Remove old overrides pointing at browser-local localhost when
using a tunnel. Restart Next.js after changing configuration.

`NEXT_PUBLIC_USE_MOCK=1` enables read-only captured backend samples with visible
MOCK labels. Unset it (or use 0) to connect to the backend. Existing local env
files with the old value 1 still opt into mock mode. Live requests never silently
fall back to samples.

Optional `NEXT_PUBLIC_NEATLOGS_TRACE_URL` is an HTTP(S) template containing
`{trace_id}`. Incident responses can supply their own template. Without one,
trace IDs have copy buttons rather than invented links.

## Data and actions

- Live ward: `/overview`, Detection `/runs`, `/incidents`, `/risks`.
- Incidents: detail, brief, actual attempts/diffs, family verdicts, resolution.
- Decisions: exact user-typed approval phrase or rejection with a reason. A
  successful response refreshes detail; conflict responses refresh it too.
- Gate: `/gate/latest`; 404 means no gate run yet.
- Trust: `/trust`, including seeded bugs, misses and clean-check denominators.
- Evidence: live `/evidence` plus the manually maintained judges' checklist.
- Welcome: actual trust metrics and an incident brief, replacing example
  percentages and the scripted live-call transcript.
- Post-merge status: `/aftercare`. Existing page polls refresh report data.

Polls run serially, pause in hidden tabs, and preserve last-good data with stale
indicators on failures. Jev groundedness remains advisory, separate from alarms.
The run schema has no HTTP status, so run rows say `Brief returned` or `No brief`.

## Commands

- `npm run dev` — starts the console and copies the judges' checklist.
- `npm run sync-samples` — refreshes checked-in mock samples from the backend.
- `npm test` — isolated API-adapter tests; no running backend or paid calls.
- `npm run lint` / `npm run build` — lint and production build.

## Verification status for this change

Five API-adapter tests passed before the user requested that testing stop.
Page edits made afterward have not been tested, built, or browser-verified.
No frontend or backend servers were launched. No approval, merge, replay,
external notification, or paid model call was performed.
