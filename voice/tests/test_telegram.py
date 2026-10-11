"""Tests for the Telegram handlers (fakes for bot/update/services)."""

from __future__ import annotations

import pytest

from app.bot import handlers
from app.bot.services import BotServices
from app.errors import EmptyTranscriptError, LLMError, TTSError
from app.memory.conversation import ConversationStore
from tests.conftest import (
    FakeApplication,
    FakeBot,
    FakeContext,
    FakeFile,
    FakeMedia,
    FakeMessage,
    FakeUpdate,
)


def build_services(settings, **overrides) -> BotServices:
    async def _generate(text, chat_id, history):
        return "default reply"

    async def _synthesize(text, language):
        return b"wav"

    async def _to_ogg(wav):
        return b"ogg"

    async def _to_wav(data):
        return b"wav16k"

    async def _transcribe(data, filename):
        return ("transcript", "en-IN")

    return BotServices(
        settings=settings,
        store=overrides.get("store", ConversationStore()),
        transcribe=overrides.get("transcribe", _transcribe),
        synthesize=overrides.get("synthesize", _synthesize),
        to_wav=overrides.get("to_wav", _to_wav),
        to_ogg=overrides.get("to_ogg", _to_ogg),
        generate=overrides.get("generate", _generate),
    )


def make_context(services, bot=None) -> FakeContext:
    app = FakeApplication(bot_data={"services": services})
    return FakeContext(application=app, bot=bot or FakeBot())


# --- text --------------------------------------------------------------


async def test_handle_text_sends_one_voice(settings):
    captured = {}

    async def synth(text, language):
        captured["text"] = text
        captured["language"] = language
        return b"wav"

    services = build_services(settings, synthesize=synth)
    msg = FakeMessage(text="Hello there")
    await handlers.handle_text(FakeUpdate(message=msg), make_context(services))

    assert len(msg.replies_voice) == 1
    assert msg.replies_text == []
    assert captured["text"] == "default reply"
    assert captured["language"] == settings.sarvam_tts_language


async def test_handle_text_blank_is_ignored(settings):
    services = build_services(settings)
    msg = FakeMessage(text="   ")
    await handlers.handle_text(FakeUpdate(message=msg), make_context(services))
    assert msg.replies_voice == []
    assert msg.replies_text == []


async def test_handle_text_llm_failure_falls_back(settings):
    async def generate_fail(text, chat_id, history):
        raise LLMError("down")

    services = build_services(settings, generate=generate_fail)
    msg = FakeMessage(text="Hello")
    await handlers.handle_text(FakeUpdate(message=msg), make_context(services))
    assert msg.replies_voice == []
    assert msg.replies_text == [handlers._FALLBACK_TEXT]


async def test_handle_text_tts_failure_falls_back_to_text(settings):
    async def synth_fail(text, language):
        raise TTSError("tts down")

    services = build_services(settings, synthesize=synth_fail)
    msg = FakeMessage(text="Hello")
    await handlers.handle_text(FakeUpdate(message=msg), make_context(services))
    assert msg.replies_voice == []
    assert msg.replies_text == ["default reply"]


# --- voice -------------------------------------------------------------


async def test_handle_voice_happy_path(settings):
    captured = {}

    async def to_wav(data):
        captured["downloaded"] = data
        return b"wav16k"

    async def transcribe(data, filename):
        captured["stt_input"] = data
        return ("hola", "hi-IN")

    async def synth(text, language):
        captured["tts_language"] = language
        return b"wav"

    services = build_services(
        settings, to_wav=to_wav, transcribe=transcribe, synthesize=synth)
    bot = FakeBot(file=FakeFile(b"oggdata"))
    msg = FakeMessage(voice=FakeMedia(duration=4, file_size=2048))
    await handlers.handle_voice(FakeUpdate(message=msg), make_context(services, bot))

    assert len(msg.replies_voice) == 1
    assert msg.replies_text == []
    assert captured["downloaded"] == b"oggdata"
    assert captured["stt_input"] == b"wav16k"
    assert captured["tts_language"] == "hi-IN"  # detected language drives TTS
    assert bot.get_file_calls == ["file-123"]


async def test_handle_voice_too_long(settings):
    services = build_services(settings)
    bot = FakeBot()
    msg = FakeMessage(voice=FakeMedia(duration=9999, file_size=2048))
    await handlers.handle_voice(FakeUpdate(message=msg), make_context(services, bot))
    assert bot.get_file_calls == []
    assert msg.replies_voice == []
    assert len(msg.replies_text) == 1


async def test_handle_voice_too_large(settings):
    services = build_services(settings)
    bot = FakeBot()
    msg = FakeMessage(voice=FakeMedia(duration=4, file_size=settings.max_audio_bytes + 1))
    await handlers.handle_voice(FakeUpdate(message=msg), make_context(services, bot))
    assert bot.get_file_calls == []
    assert msg.replies_voice == []


async def test_handle_voice_stt_empty_falls_back(settings):
    async def transcribe_empty(data, filename):
        raise EmptyTranscriptError("silence")

    services = build_services(settings, transcribe=transcribe_empty)
    bot = FakeBot(file=FakeFile(b"oggdata"))
    msg = FakeMessage(voice=FakeMedia())
    await handlers.handle_voice(FakeUpdate(message=msg), make_context(services, bot))
    assert msg.replies_voice == []
    assert msg.replies_text == [handlers._STT_FALLBACK]


async def test_handle_voice_without_media_is_unsupported(settings):
    services = build_services(settings)
    msg = FakeMessage(voice=None, audio=None)
    await handlers.handle_voice(FakeUpdate(message=msg), make_context(services))
    assert msg.replies_voice == []
    assert len(msg.replies_text) == 1


# --- commands ----------------------------------------------------------


async def test_start_and_help(settings):
    services = build_services(settings)
    msg = FakeMessage()
    ctx = make_context(services)
    await handlers.start(FakeUpdate(message=msg), ctx)
    await handlers.help_command(FakeUpdate(message=msg), ctx)
    assert msg.replies_text[0] == handlers.WELCOME
    assert msg.replies_text[1] == handlers.HELP


async def test_reset_clears_history(settings):
    store = ConversationStore()
    store.add_user(42, "earlier message")
    services = build_services(settings, store=store)
    msg = FakeMessage()
    await handlers.reset(FakeUpdate(message=msg), make_context(services))
    assert store.get(42) == []
    assert len(msg.replies_text) == 1


async def test_handle_unsupported(settings):
    services = build_services(settings)
    msg = FakeMessage()
    await handlers.handle_unsupported(FakeUpdate(message=msg), make_context(services))
    assert len(msg.replies_text) == 1
