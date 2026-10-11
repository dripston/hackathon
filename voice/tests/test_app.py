"""Tests for the FastAPI surface: /health and webhook secret validation.

Uses ``httpx.ASGITransport``, which does not run lifespan events, so the real
Telegram bot is never started here.
"""

from __future__ import annotations

import httpx
import pytest

import app.main as app_main
from app.config import Settings
from app.main import create_app


def _settings(**kw) -> Settings:
    base = dict(telegram_bot_token="t", groq_api_key="g", sarvam_api_key="s")
    base.update(kw)
    return Settings(**base)


async def test_health_endpoint():
    app = create_app(_settings())
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "service": "telegram-voice-bot"}


async def test_webhook_accepts_valid_secret(monkeypatch):
    received = {}

    async def fake_process(application, data):
        received["data"] = data

    monkeypatch.setattr(app_main, "process_webhook_update", fake_process)
    app = create_app(_settings(
        telegram_mode="webhook",
        telegram_webhook_url="https://example.test",
        telegram_webhook_secret="s3cr3t",
    ))
    app.state.application = object()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/telegram/webhook",
            json={"update_id": 1},
            headers={"X-Telegram-Bot-Api-Secret-Token": "s3cr3t"},
        )
    assert resp.status_code == 200
    assert received["data"] == {"update_id": 1}


async def test_webhook_rejects_bad_secret(monkeypatch):
    async def fake_process(application, data):  # pragma: no cover - must not run
        raise AssertionError("should not process on bad secret")

    monkeypatch.setattr(app_main, "process_webhook_update", fake_process)
    app = create_app(_settings(
        telegram_mode="webhook",
        telegram_webhook_url="https://example.test",
        telegram_webhook_secret="s3cr3t",
    ))
    app.state.application = object()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/telegram/webhook",
            json={"update_id": 2},
            headers={"X-Telegram-Bot-Api-Secret-Token": "wrong"},
        )
    assert resp.status_code == 403
