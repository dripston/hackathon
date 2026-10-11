"""Tests for the in-memory conversation store (history, trimming, locking)."""

from __future__ import annotations

import asyncio

import pytest

from app.memory.conversation import ConversationStore


def test_add_and_get_returns_copy():
    store = ConversationStore(max_messages=10)
    store.add_user(1, "hi")
    store.add_assistant(1, "hello")
    history = store.get(1)
    assert history == [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"},
    ]
    history.append({"role": "user", "content": "mutated"})
    assert len(store.get(1)) == 2  # external mutation does not leak back


def test_history_is_per_chat():
    store = ConversationStore()
    store.add_user(1, "chat one")
    store.add_user(2, "chat two")
    assert store.get(1) == [{"role": "user", "content": "chat one"}]
    assert store.get(2) == [{"role": "user", "content": "chat two"}]


def test_trimming_keeps_recent_window():
    store = ConversationStore(max_messages=4)
    for i in range(6):
        store.add_user(1, f"msg {i}")
    history = store.get(1)
    assert len(history) == 4
    assert history[0]["content"] == "msg 2"
    assert history[-1]["content"] == "msg 5"


def test_reset_reports_whether_cleared():
    store = ConversationStore()
    assert store.reset(1) is False
    store.add_user(1, "hi")
    assert store.reset(1) is True
    assert store.get(1) == []


def test_lock_is_stable_per_chat():
    store = ConversationStore()
    assert store.lock(1) is store.lock(1)
    assert store.lock(1) is not store.lock(2)
    assert isinstance(store.lock(1), asyncio.Lock)


async def test_lock_serialises_access():
    store = ConversationStore()
    order: list[str] = []

    async def worker(tag: str):
        async with store.lock(1):
            order.append(f"{tag}-start")
            await asyncio.sleep(0.01)
            order.append(f"{tag}-end")

    await asyncio.gather(worker("a"), worker("b"))
    # Whichever ran first must fully finish before the other starts.
    assert order in (
        ["a-start", "a-end", "b-start", "b-end"],
        ["b-start", "b-end", "a-start", "a-end"],
    )
