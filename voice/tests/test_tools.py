"""Tests for the Groq tool schema and dispatcher."""

from __future__ import annotations

import pytest

from app.agent import tools


async def test_schema_requires_city():
    fns = {t["function"]["name"]: t["function"] for t in tools.TOOLS}
    assert set(fns) == {"get_weather", "list_incidents", "get_incident_brief", "get_incident_details"}
    fn = fns["get_weather"]
    assert fn["parameters"]["required"] == ["city"]


async def test_unknown_tool():
    result = await tools.execute_tool("launch_rocket", {"city": "Mars"})
    assert result["status"] == "error"


async def test_arguments_must_be_object():
    result = await tools.execute_tool("get_weather", ["not", "a", "dict"])
    assert result["status"] == "error"


async def test_missing_city():
    result = await tools.execute_tool("get_weather", {})
    assert result["status"] == "error"


async def test_city_too_long():
    result = await tools.execute_tool("get_weather", {"city": "x" * 200})
    assert result["status"] == "error"


async def test_date_must_be_string():
    result = await tools.execute_tool("get_weather", {"city": "Delhi", "date": 7})
    assert result["status"] == "error"


async def test_valid_call_delegates_to_weather(monkeypatch):
    captured = {}

    async def fake_get_weather(city, date=None):
        captured["city"] = city
        captured["date"] = date
        return {"status": "ok", "city": city}

    monkeypatch.setattr("app.services.weather.get_weather", fake_get_weather)
    result = await tools.execute_tool("get_weather", {"city": "  Pune  ", "date": "today"})
    assert result == {"status": "ok", "city": "Pune"}
    assert captured == {"city": "Pune", "date": "today"}


async def test_no_tool_can_approve():
    # Approvals must come from the engineer's own words, never from the model.
    assert not any("approve" in t["function"]["name"] or "reject" in t["function"]["name"]
                   for t in tools.TOOLS)
