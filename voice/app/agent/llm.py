"""Groq LLM reasoning with native tool calling.

``generate_response`` builds the message list (system prompt + bounded chat
history + new user turn), runs a bounded tool-calling loop against Groq, and
returns the final spoken-style text. Only the user turn and final assistant
reply are written back to history; intermediate tool traffic is ephemeral.
"""

from __future__ import annotations

import asyncio
import json

import groq
from groq import AsyncGroq

from app.agent.prompt import SYSTEM_PROMPT
from app.agent.tools import TOOLS, execute_tool
from app.config import Settings, get_settings
from app.errors import LLMError
from app.memory.conversation import ConversationStore
from app.utils.logging import logger, preview

_RETRYABLE = (
    getattr(groq, "RateLimitError", ()),
    getattr(groq, "InternalServerError", ()),
    getattr(groq, "APIConnectionError", ()),
    getattr(groq, "APITimeoutError", ()),
)
_MAX_RETRIES = 2


def _build_client(settings: Settings) -> AsyncGroq:
    return AsyncGroq(
        api_key=settings.groq_api_key,
        timeout=settings.request_timeout_seconds,
        max_retries=0,
    )


async def _create(client: AsyncGroq, settings: Settings, messages: list[dict]):
    last: Exception | None = None
    for attempt in range(_MAX_RETRIES + 1):
        try:
            return await client.chat.completions.create(
                model=settings.groq_model,
                messages=messages,
                tools=TOOLS,
                tool_choice="auto",
                max_tokens=512,
            )
        except _RETRYABLE as exc:  # transient: back off and retry
            last = exc
            if attempt < _MAX_RETRIES:
                await asyncio.sleep(0.5 * (attempt + 1))
        except groq.APIError as exc:  # non-retryable provider error
            raise LLMError(f"Groq API error: {exc}") from exc
    raise LLMError(f"Groq unavailable after retries: {last}")


def _assistant_dict(message) -> dict:
    out: dict = {"role": "assistant", "content": message.content}
    if message.tool_calls:
        out["tool_calls"] = [
            {"id": tc.id, "type": "function",
             "function": {"name": tc.function.name,
                          "arguments": tc.function.arguments}}
            for tc in message.tool_calls
        ]
    return out


async def _run_tool_call(tc) -> dict:
    name = tc.function.name
    try:
        args = json.loads(tc.function.arguments or "{}")
    except json.JSONDecodeError:
        result = {"status": "error", "message": "Invalid tool arguments."}
    else:
        result = await execute_tool(name, args)
    return {"role": "tool", "tool_call_id": tc.id,
            "name": name, "content": json.dumps(result)}


async def generate_response(
    user_text: str,
    chat_id: int,
    *,
    history: ConversationStore,
    settings: Settings | None = None,
    client: AsyncGroq | None = None,
) -> str:
    """Return the assistant's spoken-style reply to ``user_text``."""
    settings = settings or get_settings()
    owns_client = client is None
    if owns_client:
        client = _build_client(settings)

    messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(history.get(chat_id))
    messages.append({"role": "user", "content": user_text})

    try:
        for _ in range(settings.llm_max_tool_iterations):
            resp = await _create(client, settings, messages)
            message = resp.choices[0].message
            if not message.tool_calls:
                reply = (message.content or "").strip()
                if not reply:
                    raise LLMError("Empty response from the model.")
                history.add_user(chat_id, user_text)
                history.add_assistant(chat_id, reply)
                logger.info("LLM reply: {}", preview(reply, settings=settings))
                return reply
            messages.append(_assistant_dict(message))
            for tc in message.tool_calls:
                messages.append(await _run_tool_call(tc))
        raise LLMError("Tool-calling loop did not converge.")
    finally:
        if owns_client:
            await client.close()
