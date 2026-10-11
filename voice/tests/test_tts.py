"""Tests for the Sarvam TTS client (mocked HTTP), including chunking + fallback."""

from __future__ import annotations

import base64
import io
import json
import wave

import httpx
import pytest

from app.errors import TTSError
from app.services import sarvam_tts
from tests.conftest import wav_bytes


def _audio_response(blob: bytes) -> httpx.Response:
    return httpx.Response(200, json={"audios": [base64.b64encode(blob).decode()]})


async def test_single_chunk_returns_blob(settings):
    blob = wav_bytes()

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/text-to-speech")
        return _audio_response(blob)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        out = await sarvam_tts.synthesize_speech(
            "Short sentence.", "en-IN", settings=settings, client=client)
    assert out == blob


async def test_language_code_fallback(settings):
    """A 400 on ``language_code`` should trigger a retry with ``target_language_code``."""
    blob = wav_bytes()
    seen_fields: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if "target_language_code" in body:
            seen_fields.append("target_language_code")
            return _audio_response(blob)
        seen_fields.append("language_code")
        return httpx.Response(400, text="unknown field language_code")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        out = await sarvam_tts.synthesize_speech(
            "Hello.", "en-IN", settings=settings, client=client)
    assert out == blob
    assert seen_fields == ["language_code", "target_language_code"]


async def test_multi_chunk_concatenated(settings):
    settings.max_tts_chars = 20
    blob = wav_bytes(nframes=10)
    posts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal posts
        posts += 1
        return _audio_response(blob)

    text = "First sentence here. Second sentence here. Third one too."
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        out = await sarvam_tts.synthesize_speech(
            text, "en-IN", settings=settings, client=client)

    assert posts >= 2  # the text was split across multiple requests
    with wave.open(io.BytesIO(out), "rb") as reader:
        assert reader.getnframes() == 10 * posts  # frames concatenated in order


async def test_empty_text_raises(settings):
    with pytest.raises(TTSError):
        await sarvam_tts.synthesize_speech("   ", "en-IN", settings=settings)


async def test_no_audio_in_response_raises(settings):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"audios": []})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(TTSError):
            await sarvam_tts.synthesize_speech(
                "Hello.", "en-IN", settings=settings, client=client)
