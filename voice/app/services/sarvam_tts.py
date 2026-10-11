"""Sarvam AI Text-to-Speech.

POST JSON to ``{base}/text-to-speech`` with the ``api-subscription-key`` header.
Returns ``{"request_id", "audios": [base64 WAV, ...]}``.

Long text is split into provider-safe chunks (``MAX_TTS_CHARS``) on sentence
boundaries and the resulting WAV clips are concatenated in order into one WAV.
The caller (audio.py) then encodes that WAV to OGG/Opus for Telegram.

Language field: current Sarvam docs use ``language_code``; some accounts/older
deployments expect ``target_language_code``. We send ``language_code`` and, on a
schema (4xx) rejection, retry once with the legacy name.
"""

from __future__ import annotations

import base64
import io
import re
import wave

import httpx

from app.config import Settings, get_settings
from app.errors import TTSError
from app.utils.logging import logger

_SENTENCE_RE = re.compile(r"[^.!?।\n]+[.!?।\n]?", re.UNICODE)


def _chunk_text(text: str, limit: int) -> list[str]:
    text = text.strip()
    if len(text) <= limit:
        return [text] if text else []
    chunks: list[str] = []
    current = ""
    for piece in _SENTENCE_RE.findall(text):
        if len(piece) > limit:  # a single very long sentence: hard-split
            if current:
                chunks.append(current.strip())
                current = ""
            for i in range(0, len(piece), limit):
                chunks.append(piece[i : i + limit].strip())
            continue
        if len(current) + len(piece) > limit:
            chunks.append(current.strip())
            current = piece
        else:
            current += piece
    if current.strip():
        chunks.append(current.strip())
    return [c for c in chunks if c]


async def _synthesize_chunk(
    text: str, language: str, settings: Settings, client: httpx.AsyncClient
) -> list[str]:
    url = f"{settings.sarvam_base_url}/text-to-speech"
    headers = {"api-subscription-key": settings.sarvam_api_key}
    body: dict = {"text": text, "speech_sample_rate": 22050}
    if settings.sarvam_tts_model:
        body["model"] = settings.sarvam_tts_model
    if settings.sarvam_tts_speaker:
        body["speaker"] = settings.sarvam_tts_speaker

    for lang_field in ("language_code", "target_language_code"):
        payload = {**body, lang_field: language}
        try:
            resp = await client.post(url, json=payload, headers=headers)
        except httpx.HTTPError as exc:
            raise TTSError(f"TTS request failed: {exc}") from exc
        if resp.status_code in (400, 422) and lang_field == "language_code":
            logger.warning("TTS 4xx with language_code; retrying target_language_code")
            continue
        if resp.status_code != 200:
            logger.warning("Sarvam TTS {} -> {}", resp.status_code, resp.text[:300])
            raise TTSError(f"TTS provider returned HTTP {resp.status_code}.")
        try:
            audios = resp.json().get("audios") or []
        except ValueError as exc:
            raise TTSError("TTS provider returned a non-JSON response.") from exc
        if not audios:
            raise TTSError("TTS provider returned no audio.")
        return audios
    raise TTSError("TTS provider rejected the request.")


def _concat_wav(wav_blobs: list[bytes]) -> bytes:
    if len(wav_blobs) == 1:
        return wav_blobs[0]
    out = io.BytesIO()
    writer: wave.Wave_write | None = None
    try:
        for blob in wav_blobs:
            with wave.open(io.BytesIO(blob), "rb") as reader:
                if writer is None:
                    writer = wave.open(out, "wb")
                    writer.setnchannels(reader.getnchannels())
                    writer.setsampwidth(reader.getsampwidth())
                    writer.setframerate(reader.getframerate())
                writer.writeframes(reader.readframes(reader.getnframes()))
    finally:
        if writer is not None:
            writer.close()
    return out.getvalue()


async def synthesize_speech(
    text: str,
    language: str = "en-IN",
    *,
    settings: Settings | None = None,
    client: httpx.AsyncClient | None = None,
) -> bytes:
    """Synthesize ``text`` to a single WAV byte string."""
    settings = settings or get_settings()
    language = language or settings.sarvam_tts_language
    chunks = _chunk_text(text, settings.max_tts_chars)
    if not chunks:
        raise TTSError("Nothing to synthesize (empty text).")

    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(timeout=settings.request_timeout_seconds)
    try:
        wav_blobs: list[bytes] = []
        for chunk in chunks:  # sequential keeps order and respects rate limits
            for b64 in await _synthesize_chunk(chunk, language, settings, client):
                wav_blobs.append(base64.b64decode(b64))
    finally:
        if owns_client:
            await client.aclose()

    logger.info("TTS ok: {} chunk(s), {} wav clip(s)", len(chunks), len(wav_blobs))
    return _concat_wav(wav_blobs)
