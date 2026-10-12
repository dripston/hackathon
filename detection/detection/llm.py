"""The patient's LLM: Groq (OpenAI-compatible), traced by neatlogs.wrap. Model IDs only from env.
Never sets temperature / top_p / top_k."""

import json
import os
import re
import time
from dataclasses import dataclass

from .config import get_settings
from . import tracing


@dataclass
class LLMResult:
    text: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    latency_ms: float


_client = None


def available() -> bool:
    s = get_settings()
    return bool(s.llm_key_and_url[0] and s.model_cheap)


def _get_client():
    global _client
    if _client is None:
        import openai

        s = get_settings()
        key, url = s.llm_key_and_url
        _client = tracing.wrap(openai.OpenAI(api_key=key, base_url=url, timeout=120.0,
                                                   # rate-limited providers (Groq's free tier: 8k tokens/min) need room to wait
                                                   max_retries=int(os.environ.get("LLM_MAX_RETRIES", "2"))))
    return _client


def complete(system: str, user: str, max_tokens: int = 1200) -> LLMResult:
    if not available():
        raise RuntimeError("LLM not configured: set LLM_PROVIDER, its API key and MODEL_CHEAP in the repo's .env")
    s = get_settings()
    t0 = time.monotonic()
    for attempt in range(4):
        try:
            resp = _get_client().chat.completions.create(
                model=s.model_cheap, max_tokens=max_tokens + 1500,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            )
            break
        except Exception as e:  # rate limits on Groq's free tier: wait as asked, then retry
            if getattr(e, "status_code", None) != 429 or attempt == 3:
                raise
            m = re.search(r"try again in ([\d.]+)s", str(e))
            time.sleep(min(float(m.group(1)) + 1 if m else 10.0 * (attempt + 1), 60.0))
    tin, tout = resp.usage.prompt_tokens, resp.usage.completion_tokens
    return LLMResult(
        text=resp.choices[0].message.content or "", input_tokens=tin, output_tokens=tout,
        cost_usd=(tin * s.price_in_per_mtok + tout * s.price_out_per_mtok) / 1_000_000,
        latency_ms=(time.monotonic() - t0) * 1000,
    )


def parse_json(text: str) -> dict:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ValueError("no JSON object in model reply")
    return json.loads(m.group(0), strict=False)
