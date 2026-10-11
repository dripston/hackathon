"""Typed exceptions shared across services so handlers can respond precisely."""

from __future__ import annotations


class VoiceAgentError(Exception):
    """Base class for all recoverable voice-agent errors."""


class AudioTooLargeError(VoiceAgentError):
    """Incoming audio exceeds the configured size/duration limit."""


class AudioConversionError(VoiceAgentError):
    """FFmpeg failed to convert audio."""


class STTError(VoiceAgentError):
    """Speech-to-text failed (network, provider error, timeout)."""


class EmptyTranscriptError(STTError):
    """STT succeeded but produced no usable text (silence / noise)."""


class TTSError(VoiceAgentError):
    """Text-to-speech failed (network, provider error, timeout)."""


class LLMError(VoiceAgentError):
    """The LLM call failed after retries."""
