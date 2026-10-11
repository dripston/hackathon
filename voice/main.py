"""Process entry point: ``uv run python main.py``.

Validates configuration early (so misconfiguration fails fast with a friendly
message) and then hands off to uvicorn, which serves both ``/health`` and the
Telegram bot via the lifespan in :mod:`app.main`.
"""

from __future__ import annotations

import uvicorn

from app.config import get_settings
from app.utils.logging import configure_logging, logger


def main() -> None:
    settings = get_settings()
    configure_logging(settings)
    try:
        settings.validate_runtime()
    except RuntimeError as exc:
        logger.error("{}", exc)
        raise SystemExit(1) from exc

    logger.info(
        "Starting telegram-voice-bot (mode={}, host={}, port={})",
        settings.telegram_mode,
        settings.host,
        settings.port,
    )
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()
