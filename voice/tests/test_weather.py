"""Tests for the Open-Meteo weather service (no network)."""

from __future__ import annotations

import httpx
import pytest

from app.services import weather

_DAILY_TIMES = [
    "2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04",
    "2026-01-05", "2026-01-06", "2026-01-07",
]


def _geocode_results():
    return {
        "results": [
            {"name": "Bengaluru", "country": "India", "admin1": "Karnataka",
             "latitude": 12.97, "longitude": 77.59},
        ]
    }


def _ambiguous_results():
    return {
        "results": [
            {"name": "Springfield", "country": "United States", "admin1": "Illinois",
             "latitude": 39.8, "longitude": -89.6},
            {"name": "Springfield", "country": "Canada", "admin1": "Ontario",
             "latitude": 44.0, "longitude": -80.0},
        ]
    }


def _forecast_body():
    return {
        "current": {
            "time": "2026-01-01T10:00",
            "temperature_2m": 24.5,
            "apparent_temperature": 25.0,
            "relative_humidity_2m": 60,
            "wind_speed_10m": 8.0,
            "weather_code": 2,
        },
        "daily": {
            "time": _DAILY_TIMES,
            "weather_code": [0, 61, 3, 2, 1, 80, 95],
            "temperature_2m_max": [30, 29, 31, 28, 27, 26, 25],
            "temperature_2m_min": [20, 19, 21, 18, 17, 16, 15],
            "precipitation_probability_max": [10, 80, 20, 5, 0, 50, 90],
        },
    }


def _client(geo_payload):
    def handler(request: httpx.Request) -> httpx.Response:
        if "geocoding-api" in request.url.host:
            return httpx.Response(200, json=geo_payload)
        if request.url.path.endswith("/forecast"):
            return httpx.Response(200, json=_forecast_body())
        return httpx.Response(404)

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_current_weather(settings):
    async with _client(_geocode_results()) as client:
        result = await weather.get_weather("Bengaluru", settings=settings, client=client)
    assert result["status"] == "ok"
    assert result["when"] == "current"
    assert result["city"] == "Bengaluru"
    assert result["temperature_c"] == 24.5
    assert result["condition"] == "partly cloudy"


async def test_tomorrow_forecast(settings):
    async with _client(_geocode_results()) as client:
        result = await weather.get_weather(
            "Bengaluru", "tomorrow", settings=settings, client=client)
    assert result["status"] == "ok"
    assert result["when"] == "forecast"
    assert result["date"] == _DAILY_TIMES[1]
    assert result["temperature_max_c"] == 29
    assert result["condition"] == "light rain"


async def test_explicit_date_forecast(settings):
    async with _client(_geocode_results()) as client:
        result = await weather.get_weather(
            "Bengaluru", _DAILY_TIMES[2], settings=settings, client=client)
    assert result["when"] == "forecast"
    assert result["date"] == _DAILY_TIMES[2]
    assert result["condition"] == "overcast"


async def test_not_found(settings):
    async with _client({"results": []}) as client:
        result = await weather.get_weather("Nowhereville", settings=settings, client=client)
    assert result["status"] == "not_found"


async def test_ambiguous_city_lists_alternatives(settings):
    async with _client(_ambiguous_results()) as client:
        result = await weather.get_weather("Springfield", settings=settings, client=client)
    assert result["status"] == "ok"
    assert result["ambiguous"] is True
    assert any(a["country"] == "Canada" for a in result["alternatives"])


async def test_empty_city_is_error(settings):
    result = await weather.get_weather("", settings=settings)
    assert result["status"] == "error"


async def test_bad_date_is_error(settings):
    result = await weather.get_weather("Bengaluru", "someday", settings=settings)
    assert result["status"] == "error"
    assert "someday" in result["message"]


async def test_out_of_range_date(settings):
    async with _client(_geocode_results()) as client:
        result = await weather.get_weather(
            "Bengaluru", "2026-12-31", settings=settings, client=client)
    assert result["status"] == "error"
