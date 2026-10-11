# Weather voice backend

FastAPI + Pipecat 1.12 + Sarvam streaming STT/TTS + Groq, with one
`get_weather` tool backed by Open-Meteo.

Run from `server/` with Python 3.13:

```sh
uv sync --frozen
uv run python main.py
```

Set values in the local `.env` using `.env.example` as a reference. Keep an
existing `.env`; do not overwrite it. Voice calls need `SARVAM_API_KEY` and
`LLM_API_KEY` (the existing `GROQ_API_KEY` name also works). `LLM_MODEL` selects
the Groq model. Weather HTTP requests work without AI credentials.

- `GET /health` reports service health and whether voice/auth credentials are configured.
- `POST /tools/get-weather` accepts `{"city":"Mumbai, Maharashtra, India"}`.
- `WS /ws/exotel?token=YOUR_TOKEN` accepts Exotel Voicebot audio.

Set `EXOTEL_WS_TOKEN` to a long random value before connecting calls. The socket
rejects missing/incorrect tokens and missing AI credentials. Optionally set
`EXOTEL_ACCOUNT_SID` to validate the account in the start event. Exotel REST API
credentials are not required for inbound calls.

Expose the running server through HTTPS/WSS, then configure the Exotel Voicebot
applet with `wss://YOUR_HOST/ws/exotel?token=YOUR_TOKEN`. Route the number to that
flow. `PUBLIC_WSS_URL` records the endpoint; setting it does not deploy the server
or update Exotel. Keep URL tokens out of proxy access logs. The local launcher
disables Uvicorn access logging.

The adapter validates the start event, uses mono PCM16 at 8/16/24 kHz, resamples
for Sarvam, and sends Exotel `clear` events on interruption. Each call gets its own
conversation and pipeline. Stop, disconnect, silence timeout, maximum duration,
and voice-provider errors cancel the session. The weather client is shared across
calls and closed on app shutdown.

Weather responses include Celsius, humidity, wind in km/h, condition, timestamp
with UTC offset, and source attribution. Ambiguous cities return candidates (409),
unknown cities return 404, provider failures return 502/503, and timeouts return
504. The voice tool uses the same service directly, avoiding an extra HTTP hop.

Logs include service timing, weather duration, and per-call response p50/p95.
Response timing measures the server's audio output, not confirmed playback on the
caller's handset. Real inbound calls are still needed to verify speech quality,
Hindi/English switching, barge-in, and actual telephone latency. Outbound calling
is outside this implementation.

Protocol/API references: [Exotel](https://developer.exotel.com/docs/agentstream/websocket-protocol),
[Pipecat](https://docs.pipecat.ai/api-reference/server/services/serializers/exotel),
[Sarvam](https://docs.sarvam.ai/api-reference/text-to-speech/convert),
[Open-Meteo](https://open-meteo.com/en/docs),
[geocoding](https://open-meteo.com/en/docs/geocoding-api).
Weather data is attributed to Open-Meteo; review its attribution and usage terms
before commercial deployment.
