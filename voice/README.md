# Telegram AI Voice Assistant

A two-way, multilingual **Telegram voice bot**. Send it a text message or a
voice note and it replies with a **spoken voice note**. It understands English,
Hindi and Hinglish, remembers recent conversation context per chat, and can
answer live weather questions for any city

```
Telegram ⇄ FastAPI + python-telegram-bot
             │
   voice ─► FFmpeg (OGG→WAV) ─► Sarvam STT ─┐
                                            ▼
   text ───────────────────────────► Groq LLM (tool calling)
                                            │  └► get_weather ─► Open-Meteo
                                            ▼
            Sarvam TTS ─► FFmpeg (WAV→OGG) ─► voice note back to Telegram
```

## Features

- **Text ➜ voice** and **voice ➜ voice** in one bot.
- **Sarvam STT** (`saaras:v4`) with automatic language detection.
- **Groq LLM** (`llama-3.3-70b-versatile`) with native tool calling.
- **Live weather** via Open-Meteo (current conditions + 7-day forecast), with
  follow-up context ("what about tomorrow?").
- **Sarvam TTS** (`bulbul:v2`) that speaks back in the detected language.
- Per-chat conversation memory with `/reset`, plus `/start` and `/help`.
- Graceful fallbacks: a text reply is sent only if speech synthesis fails.

## Antibody on-call

This bot is Antibody's voice. When Antibody has a fix that passed its whole family of
variants, it needs a human to say yes, and this bot calls that human.

1. Start Antibody's Operator API (`cd antibody && uv run antibody serve`, port 4000) and set
   `ANTIBODY_URL` if it isn't on `http://localhost:4000`.
2. In the Telegram chat that should be called, send `/oncall`. The chat id is saved in
   `.state/oncall.json` (or set `ONCALL_CHAT_ID`).
3. Every `ONCALL_POLL_SECONDS` the bot checks `GET /incidents`. For each incident that is
   `awaiting_approval` (or `escalated`, i.e. no fix passed) and hasn't been announced, it sends a
   text plus a voice note: the brief from `GET /incidents/{id}/brief`, then "To merge it, say:
   approve fix N". If Antibody marks the data as mock (`x-antibody-mock`), the call says so.
4. Reply by voice or text:
   - `approve fix 1` -> `POST /incidents/{id}/approve` with `channel: "voice"` (or `"typed"`).
     Antibody merges the pull request.
   - `reject fix 1 because ...` -> `POST /incidents/{id}/reject`.
   - Anything else ("why did it break?", "what did the fix change?") goes to the LLM, which can
     only read: `list_incidents`, `get_incident_brief`, `get_incident_details`.

Approvals never go through the model. The handler matches the engineer's own transcript before
the LLM sees it. Only speech-to-text noise is cleaned up: capitals, edge punctuation, "one" -> 1,
"fix number 1". "Yes", "ok, do it" or "please approve fix 1" are not approvals, and Antibody
re-checks the exact phrase anyway.

`/incidents` lists what needs a decision now.

## Prerequisites

- **Python 3.13** and [**uv**](https://docs.astral.sh/uv/).
- **FFmpeg** on your `PATH`:
  - macOS: `brew install ffmpeg`
  - Debian/Ubuntu: `sudo apt-get install -y ffmpeg`
  - Windows: `choco install ffmpeg`
- API credentials:
  - **Telegram bot token** from [@BotFather](https://t.me/BotFather).
  - **Groq API key** from the Groq console.
  - **Sarvam API key** from the Sarvam dashboard.

## Setup

```bash
cd voice
cp .env.example .env     # then fill in the three secrets
uv sync                  # creates .venv and installs dependencies
```

Required variables in `.env`:

| Variable | Purpose |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Bot token from BotFather |
| `GROQ_API_KEY` | Groq LLM access |
| `SARVAM_API_KEY` | Sarvam STT + TTS access |

See `.env.example` for the full list (models, limits, language defaults).
Secrets live only in `.env`, which is git-ignored.

## Run locally (long polling)

Long polling needs no public URL — ideal for development:

```bash
uv run python main.py
```

This starts a single process that serves `GET /health` **and** the Telegram
bot. Keep `TELEGRAM_MODE=polling` (the default). Open Telegram, find your bot,
and send it a text message or a voice note.

Health check:

```bash
curl http://localhost:8000/health
# {"status":"ok","service":"telegram-voice-bot"}
```

### Create the bot in BotFather

1. Message [@BotFather](https://t.me/BotFather) → `/newbot`, pick a name and
   username.
2. Copy the token into `TELEGRAM_BOT_TOKEN`.
3. (Optional) `/setcommands` with:
   ```
   start - Intro and how to use me
   help - What I can do
   reset - Clear our conversation history
   ```

## Manual end-to-end check

1. `uv run python main.py`
2. In Telegram: send `What's the weather in Bengaluru today?` → expect a voice
   note reply with live conditions.
3. Follow up with a **voice note** saying "What about tomorrow?" → expect a
   spoken forecast for Bengaluru (context retained).
4. Send `/reset` → history cleared; the next "tomorrow?" won't have a city.

Audio is never written to disk — conversions stream through FFmpeg pipes.

## Webhook mode (optional)

Besides polling, the bot can receive updates via webhook. Set:

- `TELEGRAM_MODE=webhook`
- `TELEGRAM_WEBHOOK_URL=https://<your-public-host>`
- `TELEGRAM_WEBHOOK_SECRET=<a long random string>`

On startup the app registers the webhook at
`<TELEGRAM_WEBHOOK_URL>/telegram/webhook` and rejects any request whose
`X-Telegram-Bot-Api-Secret-Token` header doesn't match the secret. This needs a
publicly reachable HTTPS URL; for local development, polling is simpler.

## Testing

```bash
uv run pytest
```

All tests run offline — HTTP services use `httpx.MockTransport`, and the Groq
and Telegram clients are replaced with fakes, so **no credentials or network
are required**. Audio round-trip tests are skipped automatically when FFmpeg is
not installed.

## Project structure

```
voice/
├── main.py                 # entrypoint: uv run python main.py
├── app/
│   ├── main.py             # FastAPI app + Telegram lifecycle (polling/webhook)
│   ├── config.py           # pydantic-settings configuration
│   ├── errors.py           # typed exceptions
│   ├── agent/              # Groq LLM, system prompt, tool schema + dispatch
│   ├── bot/                # handlers, Application factory, service container
│   ├── memory/             # per-chat conversation store
│   ├── services/           # Sarvam STT/TTS, Open-Meteo weather, FFmpeg audio
│   └── utils/              # secret-safe logging
└── tests/                  # offline unit tests (mocks + fakes)
```

## Troubleshooting

- **`ffmpeg not found on PATH`** — install FFmpeg (see Prerequisites).
- **`Missing required configuration`** — fill `TELEGRAM_BOT_TOKEN`,
  `GROQ_API_KEY`, `SARVAM_API_KEY` in `.env`.
- **Bot replies with text, not voice** — TTS failed; check `SARVAM_API_KEY`
  and the logs. The text fallback keeps the bot usable.
- **`Conflict: terminated by other getUpdates`** — another instance is polling
  the same token. Run only one, or switch to webhook mode.
- **No reply to a voice note** — it may exceed `MAX_VOICE_DURATION_SECONDS` or
  `MAX_AUDIO_BYTES`; the bot tells you when that happens.

## Security notes

- Secrets come only from the environment / `.env` (never committed).
- Webhook requests are rejected unless the secret-token header matches.
- Logs never include audio bytes or full transcripts unless
  `LOG_TRANSCRIPTS=true` is explicitly set.
- FFmpeg is invoked without a shell (no command injection) and streams via
  pipes (no temp files).
