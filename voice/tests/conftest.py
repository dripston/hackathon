"""Shared pytest fixtures and lightweight fakes.

Everything here runs without network access or real credentials: HTTP services
are exercised through ``httpx.MockTransport`` and Telegram/Groq objects are
replaced with small duck-typed fakes.
"""

from __future__ import annotations

import io
import wave
from dataclasses import dataclass, field

import pytest

from app.config import Settings


def wav_bytes(nframes: int = 16, framerate: int = 22050) -> bytes:
    """Return a tiny but structurally valid mono 16-bit PCM WAV."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(framerate)
        w.writeframes(b"\x00\x00" * nframes)
    return buf.getvalue()


@pytest.fixture
def settings() -> Settings:
    """A fully-populated Settings object pointing at a fake Sarvam base URL."""
    return Settings(
        telegram_bot_token="test-token",
        groq_api_key="test-groq",
        sarvam_api_key="test-sarvam",
        sarvam_base_url="https://sarvam.test",
        max_audio_bytes=10 * 1024 * 1024,
        max_tts_chars=1500,
        request_timeout_seconds=5.0,
    )


# --- Telegram fakes -------------------------------------------------------


@dataclass
class FakeFile:
    payload: bytes = b"ogg-bytes"

    async def download_as_bytearray(self) -> bytearray:
        return bytearray(self.payload)


@dataclass
class FakeBot:
    file: FakeFile = field(default_factory=FakeFile)
    actions: list = field(default_factory=list)
    get_file_calls: list = field(default_factory=list)

    async def send_chat_action(self, chat_id, action):
        self.actions.append((chat_id, action))

    async def get_file(self, file_id):
        self.get_file_calls.append(file_id)
        return self.file


@dataclass
class FakeMessage:
    text: str | None = None
    voice: object | None = None
    audio: object | None = None
    replies_text: list = field(default_factory=list)
    replies_voice: list = field(default_factory=list)

    async def reply_text(self, text, *args, **kwargs):
        self.replies_text.append(text)

    async def reply_voice(self, voice, *args, **kwargs):
        self.replies_voice.append(voice)


@dataclass
class FakeChat:
    id: int = 42


@dataclass
class FakeUpdate:
    message: FakeMessage | None = None
    chat: FakeChat = field(default_factory=FakeChat)

    @property
    def effective_chat(self) -> FakeChat:
        return self.chat


@dataclass
class FakeApplication:
    bot_data: dict = field(default_factory=dict)


@dataclass
class FakeContext:
    application: FakeApplication
    bot: FakeBot = field(default_factory=FakeBot)


@dataclass
class FakeMedia:
    file_id: str = "file-123"
    duration: int | None = 3
    file_size: int | None = 1024
