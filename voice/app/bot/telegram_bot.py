"""Telegram ``Application`` factory and webhook helper.

Handlers are registered here. The application lifecycle (initialize / start /
polling vs webhook / shutdown) is driven from ``app.main`` so a single process
and event loop serve both FastAPI ``/health`` and the bot.
"""

from __future__ import annotations

from telegram import Update
from telegram.ext import (
    Application,
    ApplicationBuilder,
    CommandHandler,
    MessageHandler,
    filters,
)

from app.bot import handlers
from app.bot.services import BotServices
from app.config import Settings, get_settings


def build_application(
    settings: Settings | None = None,
    services: BotServices | None = None,
) -> Application:
    settings = settings or get_settings()
    application = ApplicationBuilder().token(settings.telegram_bot_token).build()
    application.bot_data["services"] = services or BotServices.default(settings)

    application.add_handler(CommandHandler("start", handlers.start))
    application.add_handler(CommandHandler("help", handlers.help_command))
    application.add_handler(CommandHandler("reset", handlers.reset))
    application.add_handler(
        MessageHandler(filters.VOICE | filters.AUDIO, handlers.handle_voice)
    )
    application.add_handler(
        MessageHandler(filters.TEXT & ~filters.COMMAND, handlers.handle_text)
    )
    # Anything else (photos, documents, video, stickers) → graceful message.
    application.add_handler(
        MessageHandler(
            filters.PHOTO | filters.Document.ALL | filters.VIDEO
            | filters.Sticker.ALL | filters.VIDEO_NOTE,
            handlers.handle_unsupported,
        )
    )
    return application


async def process_webhook_update(application: Application, data: dict) -> None:
    """Feed a raw Telegram webhook payload into the application."""
    update = Update.de_json(data, application.bot)
    await application.process_update(update)
