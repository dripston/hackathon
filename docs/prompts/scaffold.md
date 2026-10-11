Run this once, before anyone starts. First unzip the team kit into the repo root (it adds `AGENTS.md`, `CONTRACT.md` and `docs/prompts/`). Then paste everything below the line into your coding agent from the repo root.

---

# Your task: prepare the repo so three teammates can start in parallel

This repo is our neatHack 2026 entry, **Antibody**. It already has `client/` (a Next.js app, owned by the frontend teammate) and `server/` (a Python voice agent, owned by the voice teammate). Your job is a quick, safe setup of the shared parts only. Do not build any features. This should take under 20 minutes.

Read `/AGENTS.md` and `/CONTRACT.md` first.

## Rules
- **Do not modify the contents of `client/` or `server/`.** Don't move, rename, reformat or delete anything inside them.
- Don't create code inside `antibody/` or `detection/` beyond the placeholder files listed below; their owners' coding agents build those.
- Don't push. Show me the result and wait.

## Steps

1. **Secrets check (do this first).** Run `git ls-files | grep -iE '(^|/)\.env($|\.)' | grep -v '\.env\.example$'`. If any real `.env` file is tracked (for example `server/.env`), stop and tell me the exact files. If I say yes, run `git rm --cached <file>` for each (this keeps the file on disk, only untracks it) and commit with the message "Stop tracking .env files; keys must be rotated". Remind me that every key in those files must be rotated, because removing a file doesn't remove it from git history and the repo will be public.

2. **Root `.gitignore`.** Create it if missing, or append only what's missing:
   ```
   .env
   .env.*
   !.env.example
   **/.state/
   **/__pycache__/
   **/.venv/
   node_modules/
   .next/
   .DS_Store
   ```
   Don't edit `client/.gitignore` or `server/.gitignore`.

3. **Root `CLAUDE.md`** containing: "Read AGENTS.md and CONTRACT.md first. Then follow your prompt in docs/prompts/. Never edit folders you don't own."

4. **Placeholder folders for the two new parts:**
   - `antibody/README.md`: "Antibody core. Owner: Rehaan. Built from docs/prompts/antibody-core.md. Serves the Operator API on :4000 (see /CONTRACT.md)."
   - `detection/README.md`: "Patient agent, silent-failure checks, Jev scores and risk forecasts. Owner: detection teammate. Built from docs/prompts/detection.md. Serves on :5050 (see /CONTRACT.md)."
   - `evidence/README.md`: "Proof for judges. Owner: frontend teammate."
   - `evidence/index.json`: `{ "items": [] }`
   - `evidence/trust.json`: `{ "status": "not_measured_yet" }`

5. **Root `README.md`.** If one exists, don't overwrite it; add a short section at the top. Otherwise create one with:
   - Name and one-liner: "Antibody: catches the AI agent failures that don't crash."
   - A table of folders, owners and ports, copied from `/CONTRACT.md`.
   - How to run everything locally (the "Run everything locally" block from `/CONTRACT.md`).
   - A line: "Built for neatHack 2026 with neatlogs, Entire and cfo.ai; the demo agent uses Crustdata."

6. **Root `hackathon.md`** (build log for judges; the neatHack build-log skill is at https://neatlogs.com/hackathon/skill). Sections: Project, Team (frontend, Antibody core: Rehaan, detection, voice), Stack (neatlogs, Entire, cfo.ai, Crustdata, AWS Bedrock, Python/FastAPI, Next.js), Build log (first dated entry: "2026-10-11: repo prepared for parallel work; contract and prompts added"), Demo (TBD), Known limitations (TBD), Submission checklist (public repo with commits dated Oct 10–12; neatlogs traces; Entire checkpoint link and ID; cfo.ai plan; before/after numbers; a failure-and-recovery run; #neatHack posts; video ≤ 3 minutes).

7. **Check nothing in `client/` or `server/` changed:** `git status --porcelain client server` must show nothing (apart from an untracked `.env` from step 1).

8. **Commit** in one or two commits with messages that explain why (e.g. "Add team contract and per-person prompts so three people can build in parallel"). Then show me `git status`, `git log --oneline -5` and the folder tree at depth 2 (excluding node_modules and .venv), and wait.
