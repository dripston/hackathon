"""Dependency container for the Telegram handlers.

Bundling services here (rather than importing them directly in handlers) lets
tests inject mocks for STT/TTS/LLM/audio without any network or credentials.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Awaitable, Callable

from app.agent import llm
from app.config import Settings
from app.bot.oncall import OnCallState
from app.memory.conversation import ConversationStore
from app.services import audio, sarvam_stt, sarvam_tts
from app.services.antibody import AntibodyClient, antibody_for

# (audio_bytes, filename) -> (transcript, detected_language_code)
TranscribeFn = Callable[[bytes, str], Awaitable[tuple[str, str | None]]]
# (text, language) -> wav bytes
SynthesizeFn = Callable[[str, str], Awaitable[bytes]]
# (bytes) -> bytes
ConvertFn = Callable[[bytes], Awaitable[bytes]]
# (user_text, chat_id, history) -> reply text
GenerateFn = Callable[[str, int, ConversationStore], Awaitable[str]]


@dataclass
class BotServices:
    settings: Settings
    store: ConversationStore
    transcribe: TranscribeFn
    synthesize: SynthesizeFn
    to_wav: ConvertFn
    to_ogg: ConvertFn
    generate: GenerateFn
    # Antibody link (None in tests that don't need it: approvals are then never intercepted).
    antibody: AntibodyClient | None = None
    oncall: OnCallState | None = field(default=None)

    @classmethod
    def default(cls, settings: Settings) -> "BotServices":
        store = ConversationStore(max_messages=settings.history_max_messages)

        async def transcribe(data: bytes, filename: str):
            return await sarvam_stt.transcribe_with_language(
                data, filename, settings=settings)

        async def synthesize(text: str, language: str):
            return await sarvam_tts.synthesize_speech(
                text, language, settings=settings)

        async def generate(text: str, chat_id: int, history: ConversationStore):
            return await llm.generate_response(
                text, chat_id, history=history, settings=settings)

        return cls(
            settings=settings,
            store=store,
            transcribe=transcribe,
            synthesize=synthesize,
            to_wav=audio.to_wav_16k_mono,
            to_ogg=audio.to_ogg_opus,
            generate=generate,
            antibody=antibody_for(settings),
            oncall=OnCallState(settings),
        )
