"""Async FFmpeg audio conversion (no shell interpolation).

Incoming: Telegram OGG/Opus voice notes -> 16 kHz mono WAV for Sarvam STT.
Outgoing: Sarvam WAV -> OGG/Opus voice note for Telegram ``sendVoice``.

All conversions stream bytes through FFmpeg's stdin/stdout pipes, so there are
no temp files to leak. ``ffmpeg`` must be on PATH.
"""

from __future__ import annotations

import asyncio

from app.errors import AudioConversionError
from app.utils.logging import logger

FFMPEG = "ffmpeg"
_DEFAULT_TIMEOUT = 60.0


async def _run_ffmpeg(input_bytes: bytes, args: list[str], timeout: float) -> bytes:
    """Run ``ffmpeg -i pipe:0 <args> pipe:1`` and return stdout bytes."""
    cmd = [FFMPEG, "-hide_banner", "-loglevel", "error", "-nostdin",
           "-i", "pipe:0", *args, "pipe:1"]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError as exc:  # ffmpeg not installed
        raise AudioConversionError(
            "ffmpeg not found on PATH. Install it (see README)."
        ) from exc

    try:
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(input=input_bytes), timeout=timeout
        )
    except asyncio.TimeoutError as exc:
        proc.kill()
        await proc.wait()
        raise AudioConversionError("ffmpeg timed out.") from exc

    if proc.returncode != 0:
        tail = (stderr or b"").decode("utf-8", "replace")[-300:]
        raise AudioConversionError(f"ffmpeg failed (code {proc.returncode}): {tail}")
    if not stdout:
        raise AudioConversionError("ffmpeg produced no output.")
    return stdout


async def to_wav_16k_mono(audio_bytes: bytes, timeout: float = _DEFAULT_TIMEOUT) -> bytes:
    """Decode any input (incl. Telegram OGG/Opus) to 16 kHz mono PCM WAV."""
    if not audio_bytes:
        raise AudioConversionError("No audio to convert.")
    out = await _run_ffmpeg(
        audio_bytes,
        ["-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", "-f", "wav"],
        timeout,
    )
    logger.debug("Converted {} bytes -> {} bytes WAV", len(audio_bytes), len(out))
    return out


async def to_ogg_opus(wav_bytes: bytes, timeout: float = _DEFAULT_TIMEOUT) -> bytes:
    """Encode WAV to OGG/Opus suitable for a Telegram voice note."""
    if not wav_bytes:
        raise AudioConversionError("No audio to convert.")
    out = await _run_ffmpeg(
        wav_bytes,
        ["-c:a", "libopus", "-b:a", "32k", "-ar", "48000", "-ac", "1",
         "-application", "voip", "-f", "ogg"],
        timeout,
    )
    logger.debug("Converted {} bytes WAV -> {} bytes OGG/Opus", len(wav_bytes), len(out))
    return out
