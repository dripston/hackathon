"""Tests for the FFmpeg audio conversion helpers."""

from __future__ import annotations

import shutil

import pytest

from app.errors import AudioConversionError
from app.services import audio
from tests.conftest import wav_bytes

_HAS_FFMPEG = shutil.which("ffmpeg") is not None


async def test_empty_input_wav_raises():
    with pytest.raises(AudioConversionError):
        await audio.to_wav_16k_mono(b"")


async def test_empty_input_ogg_raises():
    with pytest.raises(AudioConversionError):
        await audio.to_ogg_opus(b"")


async def test_missing_ffmpeg_binary(monkeypatch):
    monkeypatch.setattr(audio, "FFMPEG", "ffmpeg-does-not-exist-xyz")
    with pytest.raises(AudioConversionError):
        await audio.to_wav_16k_mono(wav_bytes())


async def test_invalid_audio_bytes_fail(monkeypatch):
    if not _HAS_FFMPEG:
        pytest.skip("ffmpeg not installed")
    with pytest.raises(AudioConversionError):
        await audio.to_wav_16k_mono(b"this is not audio at all")


@pytest.mark.skipif(not _HAS_FFMPEG, reason="ffmpeg not installed")
async def test_wav_roundtrip_produces_wav():
    out = await audio.to_wav_16k_mono(wav_bytes(nframes=4000))
    assert out[:4] == b"RIFF"
    assert len(out) > 0
