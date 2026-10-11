"""Tests for the Sarvam STT client (mocked HTTP)."""

from __future__ import annotations

import httpx
import pytest

from app.errors import AudioTooLargeError, EmptyTranscriptError, STTError
from app.services import sarvam_stt


def _client(response: httpx.Response):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/speech-to-text")
        assert request.headers.get("api-subscription-key") == "test-sarvam"
        return response

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_transcribe_success(settings):
    resp = httpx.Response(200, json={"transcript": "hello world", "language_code": "en-IN"})
    async with _client(resp) as client:
        text, lang = await sarvam_stt.transcribe_with_language(
            b"audio", "voice.wav", settings=settings, client=client)
    assert text == "hello world"
    assert lang == "en-IN"


async def test_transcribe_audio_wrapper(settings):
    resp = httpx.Response(200, json={"transcript": "hi", "language_code": "hi-IN"})
    async with _client(resp) as client:
        text = await sarvam_stt.transcribe_audio(
            b"audio", "voice.wav", settings=settings, client=client)
    assert text == "hi"


async def test_empty_audio_raises(settings):
    with pytest.raises(STTError):
        await sarvam_stt.transcribe_with_language(b"", "voice.wav", settings=settings)


async def test_oversized_audio_raises(settings):
    settings.max_audio_bytes = 4
    with pytest.raises(AudioTooLargeError):
        await sarvam_stt.transcribe_with_language(
            b"too many bytes", "voice.wav", settings=settings)


async def test_http_error_raises(settings):
    async with _client(httpx.Response(500, text="boom")) as client:
        with pytest.raises(STTError):
            await sarvam_stt.transcribe_with_language(
                b"audio", "voice.wav", settings=settings, client=client)


async def test_empty_transcript_raises(settings):
    async with _client(httpx.Response(200, json={"transcript": "   "})) as client:
        with pytest.raises(EmptyTranscriptError):
            await sarvam_stt.transcribe_with_language(
                b"audio", "voice.wav", settings=settings, client=client)
