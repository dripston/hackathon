"""Loguru-based logging with secret-safe helpers.

By default we never log full transcripts or audio bytes. ``preview`` returns a
short, length-annotated snippet, and only when ``LOG_TRANSCRIPTS=true`` is set.
"""

from __future__ import annotations

import sys

from loguru import logger

from app.config import Settings, get_settings

_CONFIGURED = False


def configure_logging(settings: Settings | None = None) -> None:
    global _CONFIGURED
    settings = settings or get_settings()
    logger.remove()
    logger.add(
        sys.stderr,
        level=settings.log_level.upper(),
        backtrace=False,
        diagnose=False,  # never expand variables (may contain secrets) in tracebacks
        format=(
            "<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | "
            "<cyan>{name}</cyan> - <level>{message}</level>"
        ),
    )
    _CONFIGURED = True


def preview(text: str | None, limit: int = 40, settings: Settings | None = None) -> str:
    """Redact user content unless transcript logging is explicitly enabled."""
    settings = settings or get_settings()
    if text is None:
        return "<none>"
    length = len(text)
    if not settings.log_transcripts:
        return f"<redacted len={length}>"
    snippet = text[:limit].replace("\n", " ")
    suffix = "…" if length > limit else ""
    return f"{snippet!r}{suffix} (len={length})"


__all__ = ["logger", "configure_logging", "preview"]
