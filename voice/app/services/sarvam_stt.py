"""Sarvam AI Speech-to-Text.

POST multipart/form-data to ``{base}/speech-to-text`` with the
``api-subscription-key`` header. Current recommended model is ``saaras:v4``
with ``mode=transcribe`` (handles English, Hindi and Hinglish/code-mixed audio;
set ``SARVAM_STT_LANGUAGE=unknown`` to auto-detect).

Response schema: ``{"request_id", "transcript", "language_code", ...}``.
This REST endpoint is for clips under ~30s.

The handler never logs raw audio or full transcripts (see utils.logging).
"""

from __future__ import annotations

import httpx

from app.config import Settings, get_settings
from app.errors import AudioTooLargeError, EmptyTranscriptError, STTError
from app.utils.logging import logger, preview


async def transcribe_with_language(
    audio_bytes: bytes,
    filename: str,
    *,
    settings: Settings | None = None,
    client: httpx.AsyncClient | None = None,
) -> tuple[str, str | None]:
    """Transcribe ``audio_bytes``; return ``(transcript, detected_language_code)``."""
    settings = settings or get_settings()

    if not audio_bytes:
        raise STTError("No audio data to transcribe.")
    if len(audio_bytes) > settings.max_audio_bytes:
        raise AudioTooLargeError(
            f"Audio is {len(audio_bytes)} bytes, over the "
            f"{settings.max_audio_bytes}-byte limit."
        )

    data: dict[str, str] = {}
    if settings.sarvam_stt_model:
        data["model"] = settings.sarvam_stt_model
    if settings.sarvam_stt_mode:
        data["mode"] = settings.sarvam_stt_mode
    if settings.sarvam_stt_language:
        data["language_code"] = settings.sarvam_stt_language

    files = {"file": (filename, audio_bytes, "audio/wav")}
    headers = {"api-subscription-key": settings.sarvam_api_key}
    url = f"{settings.sarvam_base_url}/speech-to-text"

    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(timeout=settings.request_timeout_seconds)
    try:
        resp = await client.post(url, data=data, files=files, headers=headers)
    except httpx.HTTPError as exc:
        raise STTError(f"STT request failed: {exc}") from exc
    finally:
        if owns_client:
            await client.aclose()

    if resp.status_code != 200:
        body = resp.text[:300]
        logger.warning("Sarvam STT {} -> {}", resp.status_code, body)
        raise STTError(f"STT provider returned HTTP {resp.status_code}.")

    try:
        payload = resp.json()
    except ValueError as exc:
        raise STTError("STT provider returned a non-JSON response.") from exc

    transcript = (payload.get("transcript") or "").strip()
    language = payload.get("language_code")
    logger.info("STT ok: {} lang={}", preview(transcript, settings=settings), language)
    if not transcript:
        raise EmptyTranscriptError("The transcript was empty.")
    return transcript, language


async def transcribe_audio(
    audio_bytes: bytes,
    filename: str,
    *,
    settings: Settings | None = None,
    client: httpx.AsyncClient | None = None,
) -> str:
    """Convenience wrapper returning just the transcript string."""
    transcript, _ = await transcribe_with_language(
        audio_bytes, filename, settings=settings, client=client
    )
    return transcript
