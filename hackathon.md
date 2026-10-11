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
- 2026-10-11: `tw_*` detections created in neatlogs through its MCP (`antibody neatlogs-setup`). Scores reach neatlogs on an `antibody.score` span, because the SDK drops custom attributes set after a span starts. Second real incident, `inc_20261011_1137_tw_company_match_skipped`, opened **from the neatlogs detection**: blamed prompt v3 (`4b732f0`), rolled the Identify step back in, must_fix 1/7 -> 7/7, must_not_change 0/3 -> 3/3. PR #4; the gate on its branch says SAFE
- 2026-10-11: Jev (`jevals` Grounded on TypeSafe `jev-latest`) scores every run's brief against its tool results, about 0.8 s a run; advisory, never a violation
- 2026-10-11: Operator API made console-ready: incident detail with scenarios and attempt verdicts, `/overview`, `/trust`, `/evidence`, a post-merge job (pull, gate main, backtest), and real response samples in `antibody/fixtures/api-samples/`
- 2026-10-11: first real on-call loop: the Telegram bot called Rehaan about the incident, he said "approve fix 1" (voice) and PR #3 merged; the bot then called about the second, and a typed "approve fix 1" merged PR #4. Fixed what it showed: a double call (two checks racing) and a post-merge job that skipped the second merge
- 2026-10-11: after the merges, Antibody pulled main and gated it: SAFE, both families pass (must_fix 7/7, must_not_change 3/3). Backtest (SIMULATED replay on real recordings): the gate blocks both causing commits (bug 1 re-opens at must_fix 3/7, bug 3 at 1/7), 0 false alarms on the clean parent, so the planted-bug catch rate is 2/3. The miss is bug 2, which never fired, so there was nothing to learn from
- 2026-10-11: risk forecast on real traffic with people-search errors creeping up: "errors rose from 0% to 11% over the last 20 minutes (r2 0.88)", likely to cross 15% in about 6 minutes. With the bug-1 fix already merged, the related silent failure no longer happened: the brief now says the search failed
- 2026-10-11: two infrastructure bugs found and fixed while proving it: a worktree service blocked on an unread stderr pipe, and HTTPS calls from server threads hung in Windows' certificate-chain check (truststore); TLS now verifies with certifi
- 2026-10-11: voice agent linked: the Telegram bot calls the on-call engineer with the brief and merges only on the spoken or typed phrase "approve fix N" (the model can't approve)

## Demo

Run everything (four terminals):

```bash
cd detection && uv run detection serve                 # :5050 patient + scorer + /runs + /risks
cd antibody  && uv run antibody serve                  # :4000 Operator API
cd antibody  && uv run antibody watch                  # opens incidents from neatlogs detections
cd voice     && uv run python main.py                  # Telegram on-call bot (send /oncall once)
cd client    && npm run dev                            # :3000 console
```

Make production traffic (replayed from real Crustdata recordings; outages are injected and labelled):

```bash
cd detection
BUG_SWALLOW_TOOL_ERRORS=1 uv run detection traffic --fault-rate 1.0 --count 6   # people-search outage -> tw_empty_after_error
uv run detection traffic --prompt v3 --count 5                                 # prompt v3 -> tw_company_match_skipped
BUG_SWALLOW_TOOL_ERRORS=1 uv run detection traffic --decay --rate 6            # errors creeping up -> risk forecast
```

The flow for the video:
1. The Live ward: every run says 200 OK, yet the check dots turn red.
2. The neatlogs detection fires, and an incident opens.
3. The diagnosis names the commit and quotes its Entire checkpoint ("People search sometimes errors... Make it resilient...").
4. The family replays: must_fix 5/7, then 7/7 after a one-line fix, with 3/3 healthy cases unchanged.
5. The bot calls the on-call engineer on Telegram with the brief.
6. The engineer says "approve fix 1". The PR merges, and the gate on main turns SAFE.

`uv run antibody demo --file .state/incidents/<id>/incident.json` replays an incident with narration, for the terminal shots.

## Known limitations

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
