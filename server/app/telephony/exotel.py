"""Exotel Voicebot handshake and PCM framing, using Pipecat's codec adapter."""
import asyncio
import base64
import binascii
import json
from dataclasses import dataclass

from fastapi import WebSocket
from pipecat.frames.frames import InputTransportMessageFrame
from pipecat.serializers.exotel import ExotelFrameSerializer


@dataclass(frozen=True)
class ExotelSession:
    stream_sid: str
    call_sid: str
    sample_rate: int


async def read_start(websocket: WebSocket, timeout: float, account_sid: str = "") -> ExotelSession:
    async with asyncio.timeout(timeout):
        # Exotel sends connected, then start. Bound both time and event count.
        for _ in range(3):
            message = await websocket.receive_json()
            if not isinstance(message, dict):
                raise ValueError("Expected a JSON object")
            if message.get("event") == "connected":
                continue
            if message.get("event") != "start":
                raise ValueError("Expected Exotel start event")
            start = message.get("start", {})
            stream = start.get("stream_sid") or message.get("stream_sid")
            call = start.get("call_sid")
            if not isinstance(stream, str) or not stream or not isinstance(call, str) or not call:
                raise ValueError("Missing stream or call ID")
            if message.get("stream_sid", stream) != stream:
                raise ValueError("Stream ID mismatch")
            if account_sid and start.get("account_sid") != account_sid:
                raise ValueError("Account mismatch")
            media = start.get("media_format", {})
            rate = int(media.get("sample_rate", 8000))
            if rate not in (8000, 16000, 24000):
                raise ValueError("Unsupported sample rate")
            if media.get("encoding", "audio/x-raw") != "audio/x-raw":
                raise ValueError("Expected raw PCM")
            if int(media.get("bit_rate", 16)) != 16 or int(media.get("channels", 1)) != 1:
                raise ValueError("Expected 16-bit mono PCM")
            return ExotelSession(stream, call, rate)
    raise ValueError("Missing start event")


class VoicebotSerializer(ExotelFrameSerializer):
    def __init__(self, session: ExotelSession):
        super().__init__(
            session.stream_sid, session.call_sid,
            params=self.InputParams(exotel_sample_rate=session.sample_rate),
        )
        self.session = session

    async def deserialize(self, data):
        if len(data) > 150_000:
            raise ValueError("Oversized media message")
        message = json.loads(data)
        if not isinstance(message, dict):
            raise ValueError("Expected a JSON object")
        if message.get("stream_sid", self.session.stream_sid) != self.session.stream_sid:
            raise ValueError("Stream ID mismatch")
        event = message.get("event")
        if event == "stop":
            return InputTransportMessageFrame(message={"event": "stop"})
        if event == "media":
            try:
                raw = base64.b64decode(message["media"]["payload"], validate=True)
            except (KeyError, TypeError, binascii.Error) as exc:
                raise ValueError("Invalid PCM payload") from exc
            if not raw or len(raw) > 100_000 or len(raw) % 2:
                raise ValueError("Expected complete PCM16 samples")
        if event not in ("media", "dtmf", "mark"):
            raise ValueError("Unexpected Exotel event")
        return await super().deserialize(data)
