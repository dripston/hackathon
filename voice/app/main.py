"""FastAPI application: ``/health`` plus the Telegram bot lifecycle.

A single process and event loop serve both the HTTP health endpoint and the
Telegram bot. The bot is initialised in the FastAPI *lifespan*:

* ``TELEGRAM_MODE=polling`` (default) → long polling, ideal for local dev.
* ``TELEGRAM_MODE=webhook``          → Telegram pushes updates to
  ``POST /telegram/webhook``, validated against the secret token.

Only one update source is ever active, so there's no risk of running multiple
polling instances against the same bot token.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException, Request, Response
from telegram import Update

from app.bot import oncall
from app.bot.telegram_bot import build_application, process_webhook_update
from app.config import Settings, get_settings
from app.utils.logging import configure_logging, logger

WEBHOOK_PATH = "/telegram/webhook"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        configure_logging(settings)
        settings.validate_runtime()

        application = build_application(settings)
        app.state.application = application

        await application.initialize()
        await application.start()

        if settings.is_webhook:
            url = settings.telegram_webhook_url.rstrip("/") + WEBHOOK_PATH
            await application.bot.set_webhook(
                url=url,
                secret_token=settings.telegram_webhook_secret or None,
                allowed_updates=Update.ALL_TYPES,
                drop_pending_updates=True,
            )
            logger.info("Telegram webhook registered at {}", url)
        else:
            await application.updater.start_polling(drop_pending_updates=True)
            logger.info("Telegram long polling started")

        services = application.bot_data["services"]
        watcher = asyncio.create_task(oncall.watch(application.bot, services))
        logger.info("On-call watcher polling {} every {}s", settings.antibody_url,
                    settings.oncall_poll_seconds)

        try:
            yield
        finally:
            watcher.cancel()
            if not settings.is_webhook and application.updater.running:
                await application.updater.stop()
            await application.stop()
            await application.shutdown()
            logger.info("Telegram application stopped")

    app = FastAPI(title="telegram-voice-bot", lifespan=lifespan)

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok", "service": "telegram-voice-bot"}

    @app.post(WEBHOOK_PATH)
    async def telegram_webhook(
        request: Request,
        x_telegram_bot_api_secret_token: str | None = Header(default=None),
    ) -> Response:
        secret = settings.telegram_webhook_secret
        if secret and x_telegram_bot_api_secret_token != secret:
            raise HTTPException(status_code=403, detail="Invalid secret token")
        data = await request.json()
        await process_webhook_update(request.app.state.application, data)
        return Response(status_code=200)

    return app


app = create_app()
