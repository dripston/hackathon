"""In-memory, per-chat conversation history for the MVP.

Not persistent: history lives in process memory and is cleared on restart or
``/reset``. Audio is never stored — only text transcripts and assistant replies.
Each chat has its own ``asyncio.Lock`` so concurrent messages in the same chat
cannot interleave and corrupt the history.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict


class ConversationStore:
    def __init__(self, max_messages: int = 20) -> None:
        # max_messages counts user+assistant turns kept (excludes system prompt).
        self._max = max(2, max_messages)
        self._history: dict[int, list[dict]] = defaultdict(list)
        self._locks: dict[int, asyncio.Lock] = defaultdict(asyncio.Lock)

    def lock(self, chat_id: int) -> asyncio.Lock:
        """Return the per-chat lock; hold it while processing one message."""
        return self._locks[chat_id]

    def get(self, chat_id: int) -> list[dict]:
        """Return a copy of the chat's message history (safe to mutate)."""
        return list(self._history[chat_id])

    def add_user(self, chat_id: int, text: str) -> None:
        self._append(chat_id, {"role": "user", "content": text})

    def add_assistant(self, chat_id: int, text: str) -> None:
        self._append(chat_id, {"role": "assistant", "content": text})

    def _append(self, chat_id: int, message: dict) -> None:
        hist = self._history[chat_id]
        hist.append(message)
        self._trim(chat_id)

    def _trim(self, chat_id: int) -> None:
        hist = self._history[chat_id]
        if len(hist) > self._max:
            # Drop the oldest turns, keeping the most recent window.
            del hist[: len(hist) - self._max]

    def reset(self, chat_id: int) -> bool:
        """Clear history for a chat. Returns True if anything was cleared."""
        had = bool(self._history.get(chat_id))
        self._history[chat_id] = []
        return had
