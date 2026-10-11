# Antibody: neatHack 2026 build log

Build-log skill: https://neatlogs.com/hackathon/skill

## Project

Antibody catches the AI agent failures that don't crash. It finds silent failures in neatlogs traces, diagnoses them with Entire checkpoints, tests fixes against simulated families of variant failures, and gates future changes before deploy.

## Team

- Frontend: frontend teammate
- Antibody core: Rehaan
- Detection: detection teammate
- Voice: voice teammate

## Stack

neatlogs, Entire, cfo.ai, Crustdata, DeepSeek (`deepseek-flash`, Antibody and the patient agent), Groq (`gpt-oss-20b`, voice agent), Sarvam (speech), Telegram, Python/FastAPI, Next.js

## Build log

- 2026-10-11: repo prepared for parallel work; contract and prompts added
- 2026-10-11: Antibody core loop (diagnose -> breed a family -> replay -> fix -> prove -> PR -> gate) working end to end on stubs, then against the real detection service
- 2026-10-11: detection service built on the teammate's Jev Tracer: the patient agent, four tripwires, the :5050 API, risk forecast. Three bugs seeded in real commits made by a coding agent under Entire (bug 2 stayed latent: the agent kept its grounding rule)
- 2026-10-11: recorded real Crustdata responses for 20 domains (26.7 credits). The patient's company check caught real lookalikes: hubspot.com -> "Cacheflow (Acquired by HubSpot)", notion.so -> a different "NOTION", neon.tech -> a Brazilian "Neon"
- 2026-10-11: Groq's free tier ran out of daily tokens mid-run; Antibody and the patient moved to DeepSeek
- 2026-10-11: first fully real incident, `inc_20261011_1102_tw_empty_after_error`: 9 production runs on real Crustdata data during a people-search outage. The first pass blamed the unchanged prompt, could not reproduce the failure and escalated instead of shipping. Diagnosis fixed (a flag on in every failing run is the suspect); the rerun blamed commit `32de239`, quoted its Entire checkpoint, and DeepSeek's one-line fix took the family from must_fix 5/7 to 7/7 with must_not_change 3/3 kept. 186 s, $0.03. PR #3
- 2026-10-11: voice agent linked: the Telegram bot calls the on-call engineer with the brief and merges only on the spoken or typed phrase "approve fix N" (the model can't approve)

## Demo

TBD

## Known limitations

- neatlogs detections (`tw_*`) still need creating in the dashboard; until then intake reads detection's `/runs` instead of neatlogs alerts.
- The repo isn't onboarded to Entire yet (`entire repo mirror add`), so no Entire Trail is created for fix PRs; checkpoints work locally.
- Seeded bug 2 (invented contacts) is latent: the model never invented anyone in our runs.
- Replays are on recorded Crustdata responses; outages are injected faults, labelled as such.

## Submission checklist

- [ ] Public repo with commits dated Oct 10–12
- [ ] neatlogs traces
- [ ] Entire checkpoint link and ID
- [ ] cfo.ai plan
- [ ] Before/after numbers
- [ ] A failure-and-recovery run
- [ ] #neatHack posts
- [ ] Video ≤ 3 minutes
