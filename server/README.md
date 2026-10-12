# Antibody unified server

Start the backend from this directory:

```bash
cd /Users/shresthjindal/Desktop/hackathon/server
uv run uvicorn app.main:app --reload --port 8000
```

The server launches separate module processes using their existing uv projects:

| Process | Internal address | Gateway route |
| --- | --- | --- |
| Detection: patient, scoring, forecasts | 127.0.0.1:5050 | /api/detection/* |
| Antibody: incidents, diagnosis, fixes, gate, trust, evidence | 127.0.0.1:4000 | /api/antibody/* |
| Antibody incident watcher | Background worker | No HTTP endpoint |
| Voice: Telegram bot, STT/TTS, on-call handling | 127.0.0.1:8001 | /api/voice/* |

The existing implementations and their internal connections are unchanged.
The complete checkout (server, antibody, detection, voice) must be present;
server is an entry point, not a copied or independently packaged backend.
Jev Tracer is a separate CLI prototype, not an HTTP module; it is not launched.

## Terminal connection messages

After actual HTTP health checks succeed, Uvicorn's terminal prints:

```text
INFO: Detection module connected with server
INFO: Antibody module connected with server
INFO: Voice module connected with server
INFO: All backend modules successfully connected with server
```

Ordering depends on startup time. These lines are examples, not observed results.
Failed or disconnected modules log their actual state. The all-connected line
requires every module to be healthy and the managed watcher process to be alive.
Health checks verify module HTTP availability, not every external provider or
successful model execution. Child process output appears in the same terminal.

- `/` returns service information and current connection status (no root 404).
- `/health` is gateway liveness.
- `/ready` returns 200 only when the backend is ready; otherwise 503 with status.
- `/docs` provides the gateway API explorer.

Connections are checked every five seconds. Late-starting services can connect
without restarting the gateway. Failed child processes are reported, not silently
restarted. Ctrl+C or reload terminates child process groups launched by this server.
Already-running healthy module services are reused and are not stopped by it.
Run only one gateway worker and no separate `antibody watch` when autostart is on.

## Forwarded calls

Existing JSON bodies, query parameters, HTTP status codes and `x-antibody-mock`
headers are preserved. Mutations are not retried automatically.

- Antibody GET: health, overview, incidents, incident detail/brief, gate/latest,
  trust, evidence, aftercare, risks.
- Antibody POST: incident approve/reject, webhooks/neatlogs.
- Detection GET: health, runs, risks. POST: run, score.
- Voice GET: health. POST: telegram/webhook.
- `/telegram/webhook` also forwards to Voice, matching its registered webhook path.

Approval rules are enforced by the existing Antibody endpoint. There is no new
approval bypass. Requests exceeding the configured body limit return 413;
unavailable modules return 502 and timeouts return 504. Payloads and secrets are
not included in gateway request logs.

## Configuration

Use the one repository-root `.env` or process environment. The gateway loads root
variables and passes them to children, including the voice process. No secrets
need to be copied into server/.env. Dependencies install from each module's frozen
lockfile on first launch. Python 3.13, uv, network access for initial installs,
and FFmpeg for voice audio are prerequisites.

Gateway defaults (all overridable):

| Variable | Default |
| --- | --- |
| GATEWAY_ANTIBODY_URL | http://127.0.0.1:4000 |
| GATEWAY_DETECTION_URL | http://127.0.0.1:5050 |
| GATEWAY_VOICE_URL | http://127.0.0.1:8001 |
| GATEWAY_AUTOSTART | true |
| GATEWAY_WATCHER_ENABLED | true |
| GATEWAY_CHECK_INTERVAL | 5 seconds |
| GATEWAY_STARTUP_TIMEOUT | 120 seconds before reporting unavailable |
| GATEWAY_REQUEST_TIMEOUT | 120 seconds |
| GATEWAY_MAX_BODY_BYTES | 2000000 |
| GATEWAY_CORS_ORIGINS | http://localhost:3000,http://127.0.0.1:3000 |

Voice needs TELEGRAM_BOT_TOKEN, GROQ_API_KEY, SARVAM_API_KEY. Configure the other
modules' provider credentials and replay/live choices using their existing docs.
The watcher actively processes detected incidents and may call models or prepare
PRs under existing Antibody configuration. Set GATEWAY_WATCHER_ENABLED=false to
serve APIs without automatic incident processing.

For external service deployments, set GATEWAY_AUTOSTART=false and configure module
URLs. The watcher then belongs to the external deployment too. Autostart binds
modules to loopback; their ports must be distinct and cannot use gateway port 8000.

## Frontend and deployment

The Next.js proxy forwards all module traffic through this server. Its server-side
SERVER_URL defaults to http://127.0.0.1:8000. Remove old NEXT_PUBLIC_* API overrides
to use these relative same-origin routes; restart Next.js after env changes.

For deployment, run without --reload and with one worker behind an authenticated
TLS reverse proxy. The existing backend has no user authentication, so do not
expose its approval routes publicly without access control. Keep module ports
private. In webhook mode, set TELEGRAM_WEBHOOK_URL to the gateway public origin
and configure TELEGRAM_WEBHOOK_SECRET. Telegram checks the forwarded secret.

This change was not run or tested, per the user's instruction. No servers,
notifications, provider requests, or deployments were started during implementation.
