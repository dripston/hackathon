# AGENTS.md — team rules for every coding agent in this repo

Project: **Antibody**, neatHack 2026 (team airo). It catches the AI agent failures that don't crash: silent failures found in neatlogs traces, diagnosed with Entire checkpoints, immunised with simulated variant families, and gated before deploy.

Read this file and `/CONTRACT.md` before writing code. Then follow your own prompt in `docs/prompts/`.

## Folder ownership

| Folder | Owner | Prompt |
|---|---|---|
| `antibody/` | Rehaan | `docs/prompts/antibody-core.md` |
| `detection/` | Detection teammate | `docs/prompts/detection.md` |
| `client/` | Frontend teammate | `docs/prompts/frontend.md` (also read `client/AGENTS.md`) |
| `evidence/` | Frontend teammate | `docs/prompts/frontend.md` |
| `server/` | Voice teammate | not covered here; never edit it |

Work only in your own folder. Need something from another folder? Tell your human; don't change it yourself.

## Rules

1. **No secrets in git.** Every `.env` is ignored. Only `.env.example` files with empty values are committed. Never print keys in logs, traces or commit messages.
2. **Small commits that explain why.** Judges check that commits happened during the hackathon (Oct 10–12, 2026). Entire is enabled on this repo; your session and reasoning are saved with each commit.
3. **Never fake results.** Every number in the README, video or `evidence/` must come from a file or trace. Label data as LIVE, RECORDED, SIMULATED or SEEDED. The bugs in the patient are seeded; say so.
4. **Trace everything in neatlogs** (LLM calls, tool calls). Flush before a script exits.
5. **Budgets are tight.** Crustdata: 5,000 credits for the whole team; record once, replay after. AWS: $25 total; nothing that bills by the hour without asking.
6. **Claude 4.7+ returns HTTP 400 if `temperature`, `top_p` or `top_k` is set to a non-default value.** Don't set them.
7. **Don't guess third-party APIs** (neatlogs, Entire, Crustdata, jevals, cfo.ai). Check docs and a real response first.
8. **Ask your human** before spending money, deleting files you didn't create, force-pushing or publishing.
9. **Follow `/CONTRACT.md` exactly** for anything that crosses folders. If it needs to change, stop and tell your human.
