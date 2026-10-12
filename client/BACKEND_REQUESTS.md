# Integration notes

No backend contract changes were made or are needed for the wired console views.

- The Operator and Detection APIs were not running when integration began.
  Live/browser verification remains pending; the user requested no further tests
  or running servers. Captured fixtures are used only in explicit mock mode.
- AgentRun does not contain the original HTTP response status. The UI now shows
  whether a brief was returned instead of claiming every run returned 200 OK.
- The welcome voice section now reads incident briefs and recorded approvals.
  There is no browser-call/audio-stream endpoint in the current Operator API;
  voice interaction remains in the existing Telegram bot.
- The judges' checklist (cfo.ai plan, posts and other manually collected links)
  remains sourced from evidence/index.json. Live incident, gate, cost and
  backtest proof is sourced separately from GET /evidence.
