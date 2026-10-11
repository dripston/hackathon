"""Tests for the Groq tool-calling loop with a fake AsyncGroq client."""

from __future__ import annotations

from dataclasses import dataclass, field

import pytest

from app.agent import llm
from app.errors import LLMError
from app.memory.conversation import ConversationStore


@dataclass
class FakeFunction:
    name: str
    arguments: str


@dataclass
class FakeToolCall:
    id: str
    function: FakeFunction
    type: str = "function"


@dataclass
class FakeMsg:
    content: str | None = None
    tool_calls: list | None = None


@dataclass
class FakeChoice:
    message: FakeMsg


@dataclass
class FakeResp:
    choices: list


class FakeCompletions:
    def __init__(self, steps):
        self.steps = list(steps)
        self.calls: list = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        step = self.steps.pop(0)
        if isinstance(step, Exception):
            raise step
        return step


class FakeClient:
    def __init__(self, steps):
        self.chat = type("Chat", (), {"completions": FakeCompletions(steps)})()
        self.closed = False

    async def close(self):
        self.closed = True


def _msg(content=None, tool_calls=None):
    return FakeResp([FakeChoice(FakeMsg(content=content, tool_calls=tool_calls))])


async def test_simple_reply_updates_history(settings):
    client = FakeClient([_msg(content="Hi there.")])
    history = ConversationStore()
    reply = await llm.generate_response(
        "hello", 1, history=history, settings=settings, client=client)
    assert reply == "Hi there."
    assert history.get(1) == [
        {"role": "user", "content": "hello"},
        {"role": "assistant", "content": "Hi there."},
    ]


async def test_tool_call_then_final(settings, monkeypatch):
    called = {}

    async def fake_execute(name, args):
        called["name"] = name
        called["args"] = args
        return {"status": "ok", "temperature_c": 24}

    monkeypatch.setattr(llm, "execute_tool", fake_execute)

    tool_call = FakeToolCall("c1", FakeFunction("get_weather", '{"city": "Delhi"}'))
    client = FakeClient([
        _msg(tool_calls=[tool_call]),
        _msg(content="It's 24 degrees in Delhi."),
    ])
    history = ConversationStore()
    reply = await llm.generate_response(
        "weather in Delhi?", 7, history=history, settings=settings, client=client)

    assert reply == "It's 24 degrees in Delhi."
    assert called == {"name": "get_weather", "args": {"city": "Delhi"}}
    # Only the user turn and final reply are persisted (tool traffic is ephemeral).
    assert history.get(7) == [
        {"role": "user", "content": "weather in Delhi?"},
        {"role": "assistant", "content": "It's 24 degrees in Delhi."},
    ]
    # The follow-up request carried a tool-result message back to the model.
    second_call_messages = client.chat.completions.calls[1]["messages"]
    assert any(m.get("role") == "tool" for m in second_call_messages)


async def test_invalid_tool_arguments_recover(settings, monkeypatch):
    async def fake_execute(name, args):  # pragma: no cover - must not be called
        raise AssertionError("execute_tool should not run on invalid JSON")

    monkeypatch.setattr(llm, "execute_tool", fake_execute)
    bad_call = FakeToolCall("c1", FakeFunction("get_weather", "not-json"))
    client = FakeClient([
        _msg(tool_calls=[bad_call]),
        _msg(content="Sorry, could you repeat the city?"),
    ])
    reply = await llm.generate_response(
        "weather?", 1, history=ConversationStore(), settings=settings, client=client)
    assert reply == "Sorry, could you repeat the city?"


async def test_empty_response_raises(settings):
    client = FakeClient([_msg(content="   ")])
    with pytest.raises(LLMError):
        await llm.generate_response(
            "hello", 1, history=ConversationStore(), settings=settings, client=client)


async def test_loop_not_converging_raises(settings, monkeypatch):
    settings.llm_max_tool_iterations = 2

    async def fake_execute(name, args):
        return {"status": "ok"}

    monkeypatch.setattr(llm, "execute_tool", fake_execute)
    tool_call = FakeToolCall("c1", FakeFunction("get_weather", '{"city": "Delhi"}'))
    client = FakeClient([
        _msg(tool_calls=[tool_call]),
        _msg(tool_calls=[tool_call]),
    ])
    with pytest.raises(LLMError):
        await llm.generate_response(
            "loop", 1, history=ConversationStore(), settings=settings, client=client)


async def test_transient_error_is_retried(settings, monkeypatch):
    class Transient(Exception):
        pass

    async def no_sleep(_seconds):
        return None

    monkeypatch.setattr(llm, "_RETRYABLE", (Transient,))
    monkeypatch.setattr(llm.asyncio, "sleep", no_sleep)

    client = FakeClient([Transient("rate limited"), _msg(content="Recovered.")])
    reply = await llm.generate_response(
        "hello", 1, history=ConversationStore(), settings=settings, client=client)
    assert reply == "Recovered."
