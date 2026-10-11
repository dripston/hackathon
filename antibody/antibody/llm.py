"""LLM access: Bedrock (Converse API), Anthropic, or Groq (OpenAI-compatible), chosen by LLM_PROVIDER.
Model IDs only from env.

Never sets temperature / top_p / top_k (Claude 4.7+ rejects non-default values).
If no provider is configured, `available()` is False and callers use their deterministic fallback,
labelled as mock.
"""

import logging
import threading
from dataclasses import dataclass

from .config import get_settings
from . import tracing

log = logging.getLogger("antibody.llm")


@dataclass
class LLMResult:
    text: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float


class Ledger:
    """Running cost for the current incident (thread-safe)."""

    def __init__(self):
        self._lock = threading.Lock()
        self.usd = 0.0
        self.calls = 0

    def add(self, usd: float) -> None:
        with self._lock:
            self.usd += usd
            self.calls += 1


ledger = Ledger()


def _model(tier: str) -> str:
    s = get_settings()
    return s.model_strong if tier == "strong" else (s.model_cheap or s.model_strong)


def available(tier: str = "strong") -> bool:
    s = get_settings()
    if s.llm_provider == "stub" or not _model(tier):
        return False
    if s.llm_provider == "anthropic":
        return bool(s.anthropic_api_key)
    if s.llm_provider == "groq":
        return bool(s.groq_api_key)
    return s.llm_provider == "bedrock" and _aws_credentials()


def _aws_credentials() -> bool:
    import os

    if os.environ.get("AWS_BEARER_TOKEN_BEDROCK"):
        return True
    try:
        import boto3

        return boto3.Session().get_credentials() is not None
    except Exception:
        return False


def _price(tier: str) -> tuple[float, float]:
    s = get_settings()
    if tier == "strong":
        return s.price_strong_in_per_mtok, s.price_strong_out_per_mtok
    return s.price_cheap_in_per_mtok, s.price_cheap_out_per_mtok


_bedrock = None
_anthropic = None
_groq = None


def _groq_client():
    global _groq
    if _groq is None:
        import openai

        s = get_settings()
        _groq = tracing.wrap(openai.OpenAI(api_key=s.groq_api_key, base_url=s.groq_base_url))
    return _groq


def _bedrock_client():
    global _bedrock
    if _bedrock is None:
        import boto3

        _bedrock = tracing.wrap(boto3.client("bedrock-runtime", region_name=get_settings().aws_region))
    return _bedrock


def _anthropic_client():
    global _anthropic
    if _anthropic is None:
        import anthropic

        _anthropic = tracing.wrap(anthropic.Anthropic(api_key=get_settings().anthropic_api_key))
    return _anthropic


def _with_retry(call, attempts: int = 4):
    """Retry rate-limited calls (HTTP 429), waiting as long as the provider asks (capped)."""
    import re
    import time

    for i in range(attempts):
        try:
            return call()
        except Exception as e:
            status = getattr(e, "status_code", None)
            if status != 429 or i == attempts - 1:
                raise
            msg = str(e)
            m = re.search(r"try again in ([\d.]+)s", msg)
            wait = min(float(m.group(1)) + 1 if m else 15.0 * (i + 1), 60.0)
            log.warning("llm rate-limited; retrying in %.0f s", wait)
            time.sleep(wait)


def complete(tier: str, system: str, user: str, max_tokens: int = 2000) -> LLMResult:
    """One call. Raises if no provider is configured; check `available()` first."""
    if not available(tier):
        raise RuntimeError("No LLM configured (set LLM_PROVIDER and MODEL_CHEAP/MODEL_STRONG)")
    s = get_settings()
    model = _model(tier)
    if s.llm_provider == "groq":
        # max_tokens covers the model's hidden reasoning too, so leave headroom. Groq's free tier
        # counts the requested max_tokens against an 8k tokens-per-minute limit, so keep it modest.
        resp = _with_retry(lambda: _groq_client().chat.completions.create(
            model=model, max_tokens=max_tokens + 1500,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        ))
        text = resp.choices[0].message.content or ""
        tin, tout = resp.usage.prompt_tokens, resp.usage.completion_tokens
    elif s.llm_provider == "anthropic":
        msg = _anthropic_client().messages.create(
            model=model, max_tokens=max_tokens, system=system,
            messages=[{"role": "user", "content": user}],
        )
        text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
        tin, tout = msg.usage.input_tokens, msg.usage.output_tokens
    else:
        resp = _bedrock_client().converse(
            modelId=model,
            system=[{"text": system}],
            messages=[{"role": "user", "content": [{"text": user}]}],
            inferenceConfig={"maxTokens": max_tokens},
        )
        text = "".join(c.get("text", "") for c in resp["output"]["message"]["content"])
        tin, tout = resp["usage"]["inputTokens"], resp["usage"]["outputTokens"]
    pin, pout = _price(tier)
    cost = (tin * pin + tout * pout) / 1_000_000
    ledger.add(cost)
    log.info("llm %s %s in=%d out=%d $%.4f", tier, model, tin, tout, cost)
    return LLMResult(text=text, model=model, input_tokens=tin, output_tokens=tout, cost_usd=cost)
