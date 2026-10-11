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

from app.bot import oncall
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
    "👋 Hi! I'm Antibody's on-call voice.\n\n"
    "When an AI agent fails silently and Antibody has a proven fix, I call you here "
    "with a voice note. Send /oncall in this chat to be the one I call.\n\n"
    "• Ask me anything: \"What's broken?\", \"Why did it break?\"\n"
    "• To merge a fix, say or type exactly: approve fix 1\n"
    "• To turn it down: reject fix 1 because ...\n\n"
    "I speak English, Hindi and Hinglish. Use /help for more."
)

HELP = (
    "Here's what I can do:\n\n"
    "• Text ➜ voice: type a question, get a spoken answer.\n"
    "• Voice ➜ voice: send a voice note, get a spoken answer.\n"
    "• Incidents: \"What's broken?\", \"Read me the brief\", \"What did the fix change?\"\n"
    "• Approve: say or type exactly \"approve fix 1\". Yes, ok or do it won't count.\n"
    "• Reject: \"reject fix 1 because it hides the error\"\n"
    "• Weather: \"What's the weather in Mumbai?\"\n\n"
    "Commands:\n"
    "/start – intro\n"
    "/oncall – call this chat when a fix needs approval\n"
    "/incidents – what needs a decision now\n"
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
async def _decision(services, chat_id: int, text: str, channel: str) -> str | None:
    """Approve/reject straight to Antibody, never through the LLM. None if not a decision."""
    if services.antibody is None or services.oncall is None:
        return None
    reply = await oncall.handle_command(services.antibody, services.oncall, chat_id, text, channel)
    if reply is not None:
        logger.info("Decision via {} in chat {}: {}", channel, chat_id, reply)
    return reply


async def oncall_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    services = _services(context)
    services.oncall.chat_id = update.effective_chat.id
    services.oncall.save()
    await update.message.reply_text(
        "📟 You're on call. When Antibody has a fix waiting, I'll call you here.")
    try:
        called = await oncall.check_once(context.bot, services)
    except Exception as exc:
        await update.message.reply_text(f"Couldn't reach Antibody yet: {exc}")
        return
    if not called:
        await update.message.reply_text("Nothing needs you right now.")


async def incidents_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    services = _services(context)
    try:
        items, mock = await services.antibody.incidents()
    except Exception as exc:
        await update.message.reply_text(f"Couldn't reach Antibody: {exc}")
        return
    if not items:
        await update.message.reply_text("No incidents.")
        return
    lines = [f"• {i['id']} – {i['status']} ({i.get('detection')})" for i in items[:8]]
    await update.message.reply_text(("Test data.\n" if mock else "") + "\n".join(lines))


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
        decision = await _decision(services, chat_id, text, "typed")
        if decision is not None:
            await update.message.reply_text(decision)
            return
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
        decision = await _decision(services, chat_id, transcript, "voice")
        if decision is not None:
            await update.message.reply_text(f"🎙 \"{transcript}\"\n{decision}")
            await _speak(services, update, decision, tts_language)
            return
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
