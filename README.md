# Antibody

Antibody: catches the AI agent failures that don't crash.

## Folders

| Folder | Owner | What it is | Runs on |
|---|---|---|---|
| `detection/` | Detection teammate | The patient agent (Crustdata company research), tripwires, Jev checks, risk forecasts, traffic script | `http://localhost:5050` |
| `antibody/` | Rehaan | Antibody core: incidents, diagnosis, variant families, fixes, PRs, the gate, the Operator API | `http://localhost:4000` |
| `client/` | Frontend teammate | Next.js console | `http://localhost:3000` |
| `server/` | Voice teammate | Voice agent | its own port; calls the Operator API |
| `evidence/` | Frontend teammate | Proof for judges (links, screenshots, numbers) | — |

See [CONTRACT.md](CONTRACT.md) for the APIs and data shapes between the parts, and [AGENTS.md](AGENTS.md) for team rules.

## Run everything locally

```bash
cd detection && uv run detection serve      # :5050
cd antibody  && uv run antibody serve       # :4000
cd antibody  && uv run antibody watch       # polls neatlogs
cd client    && npm run dev                 # :3000
```

Built for neatHack 2026 with neatlogs, Entire and cfo.ai; the demo agent uses Crustdata.
