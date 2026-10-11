"""Telegram command and message handlers.

One voice note is sent per successfully processed message. A per-chat lock
serialises processing so concurrent messages can't corrupt conversation
history. Chat actions (typing / recording) are refreshed while long operations
run. Exceptions are never swallowed silently — they are logged and turned into
a user-friendly fallback.
"""

from __future__ import annotations

import asyncio
import contextlib
import io

from telegram import InputFile, Update
from telegram.constants import ChatAction
from telegram.error import TelegramError
from telegram.ext import ContextTypes

from app.bot.services import BotServices
from app.errors import (
    AudioConversionError,
    AudioTooLargeError,
    EmptyTranscriptError,
    STTError,
    VoiceAgentError,
)
from app.utils.logging import logger

_FALLBACK_TEXT = "Sorry, I ran into a problem. Please try again in a moment."
_STT_FALLBACK = (
    "Sorry, I couldn't understand that voice note. Could you record it again?"
)
_ACTION_REFRESH_SECONDS = 4.0

# TTS-capable languages (Sarvam) — lets us speak back in the user's language.
_TTS_LANGS = {
    "bn-IN", "en-IN", "gu-IN", "hi-IN", "kn-IN", "ml-IN",
    "mr-IN", "od-IN", "pa-IN", "ta-IN", "te-IN",
}

WELCOME = (
    "👋 Hi! I'm your voice assistant.\n\n"
    "• Send me a *text message* and I'll reply with a voice note.\n"
    "• Send me a *voice note* and I'll listen, think, and reply with a voice note.\n\n"
    "I speak English, Hindi and Hinglish, and I can check the live weather for any "
    "city. Try: \"What's the weather in Bengaluru today?\"\n\n"
    "Use /help for more, or /reset to start a fresh conversation."
)

HELP = (
    "Here's what I can do:\n\n"
    "• Text ➜ voice: type a question, get a spoken answer.\n"
    "• Voice ➜ voice: send a voice note, get a spoken answer.\n"
    "• Weather: \"What's the weather in Mumbai?\" then \"What about tomorrow?\"\n"
    "• Chit-chat: \"Tell me a joke.\"\n\n"
    "Commands:\n"
    "/start – intro\n"
    "/help – this message\n"
    "/reset – clear our conversation history\n\n"
    "Note: I remember recent context per chat, but memory resets if the bot "
    "restarts."
)


def _services(context: ContextTypes.DEFAULT_TYPE) -> BotServices:
    return context.application.bot_data["services"]


@contextlib.asynccontextmanager
async def keep_action(bot, chat_id: int, action: str):
    """Keep a chat action (typing/recording) alive during a long operation."""

    async def _loop() -> None:
        with contextlib.suppress(Exception):
            while True:
                await bot.send_chat_action(chat_id=chat_id, action=action)
                await asyncio.sleep(_ACTION_REFRESH_SECONDS)

    task = asyncio.create_task(_loop())
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


def _pick_tts_language(detected: str | None, settings) -> str:
    if detected and detected in _TTS_LANGS:
        return detected
    return settings.sarvam_tts_language


async def _send_voice(update: Update, ogg_bytes: bytes) -> None:
    await update.message.reply_voice(
        voice=InputFile(io.BytesIO(ogg_bytes), filename="reply.ogg")
    )


async def _speak(services, update: Update, reply_text: str, tts_language: str) -> None:
    """Synthesize and send exactly one voice note; fall back to text on failure."""
    try:
        wav = await services.synthesize(reply_text, tts_language)
        ogg = await services.to_ogg(wav)
    except VoiceAgentError as exc:
        logger.warning("TTS/audio failed; sending text fallback: {}", exc)
        await update.message.reply_text(reply_text)
        return
    await _send_voice(update, ogg)
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(WELCOME)


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(HELP)


async def reset(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    services = _services(context)
    services.store.reset(update.effective_chat.id)
    await update.message.reply_text("🧹 Conversation history cleared. Starting fresh!")


async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    services = _services(context)
    chat_id = update.effective_chat.id
    text = (update.message.text or "").strip()
    if not text:
        return
    async with services.store.lock(chat_id):
        try:
            async with keep_action(context.bot, chat_id, ChatAction.RECORD_VOICE):
                reply = await services.generate(text, chat_id, services.store)
        except VoiceAgentError as exc:
            logger.error("LLM failed (text): {}", exc)
            await update.message.reply_text(_FALLBACK_TEXT)
            return
    await _speak(services, update, reply, services.settings.sarvam_tts_language)
async def handle_voice(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    services = _services(context)
    settings = services.settings
    chat_id = update.effective_chat.id
    media = update.message.voice or update.message.audio
    if media is None:
        await handle_unsupported(update, context)
        return

    duration = getattr(media, "duration", None)
    if duration and duration > settings.max_voice_duration_seconds:
        await update.message.reply_text(
            f"That audio is too long — please keep it under "
            f"{settings.max_voice_duration_seconds} seconds."
        )
        return
    file_size = getattr(media, "file_size", None)
    if file_size and file_size > settings.max_audio_bytes:
        await update.message.reply_text("That audio file is too large for me to process.")
        return

    try:
        tg_file = await context.bot.get_file(media.file_id)
        data = bytes(await tg_file.download_as_bytearray())
    except TelegramError as exc:
        logger.error("Telegram download failed: {}", exc)
        await update.message.reply_text(
            "I couldn't download that voice note. Please try sending it again."
        )
        return
    async with services.store.lock(chat_id):
        try:
            async with keep_action(context.bot, chat_id, ChatAction.TYPING):
                wav = await services.to_wav(data)
                transcript, detected = await services.transcribe(wav, "voice.wav")
        except (EmptyTranscriptError, STTError, AudioTooLargeError,
                AudioConversionError) as exc:
            logger.warning("Could not transcribe voice note: {}", exc)
            await update.message.reply_text(_STT_FALLBACK)
            return

        tts_language = _pick_tts_language(detected, settings)
        try:
            async with keep_action(context.bot, chat_id, ChatAction.RECORD_VOICE):
                reply = await services.generate(transcript, chat_id, services.store)
        except VoiceAgentError as exc:
            logger.error("LLM failed (voice): {}", exc)
            await update.message.reply_text(_FALLBACK_TEXT)
            return
    await _speak(services, update, reply, tts_language)


async def handle_unsupported(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.message is None:
        return
    await update.message.reply_text(
        "I can only handle text messages and voice notes right now. "
        "Send me a voice note or type your question!"
    )
