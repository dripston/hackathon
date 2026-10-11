"""Open-Meteo weather lookup used by the ``get_weather`` tool.

Free, key-less APIs:
  * geocoding: https://geocoding-api.open-meteo.com/v1/search
  * forecast:  https://api.open-meteo.com/v1/forecast

Returns small, structured dicts. Never fabricates values: on any failure it
returns ``{"status": "error", ...}`` so the LLM can apologise and move on.
"""

from __future__ import annotations

import re

import httpx

from app.config import Settings, get_settings
from app.utils.logging import logger

GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

# WMO weather interpretation codes -> short, speakable text.
WMO_CODES: dict[int, str] = {
    0: "clear sky", 1: "mainly clear", 2: "partly cloudy", 3: "overcast",
    45: "foggy", 48: "freezing fog", 51: "light drizzle", 53: "drizzle",
    55: "heavy drizzle", 56: "freezing drizzle", 57: "freezing drizzle",
    61: "light rain", 63: "rain", 65: "heavy rain", 66: "freezing rain",
    67: "freezing rain", 71: "light snow", 73: "snow", 75: "heavy snow",
    77: "snow grains", 80: "light rain showers", 81: "rain showers",
    82: "violent rain showers", 85: "snow showers", 86: "heavy snow showers",
    95: "thunderstorm", 96: "thunderstorm with hail", 99: "thunderstorm with hail",
}

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _condition(code: int | None) -> str:
    if code is None:
        return "unknown"
    return WMO_CODES.get(int(code), "unknown")


async def _geocode(city: str, client: httpx.AsyncClient) -> list[dict]:
    resp = await client.get(
        GEOCODE_URL,
        params={"name": city, "count": 5, "language": "en", "format": "json"},
    )
    resp.raise_for_status()
    return resp.json().get("results") or []


async def get_weather(
    city: str,
    date: str | None = None,
    *,
    settings: Settings | None = None,
    client: httpx.AsyncClient | None = None,
) -> dict:
    """Resolve ``city`` and return current conditions or a daily forecast.

    ``date`` accepts ``None``/``"today"``, ``"tomorrow"`` or ``YYYY-MM-DD``
    within the next 7 days.
    """
    settings = settings or get_settings()
    city = (city or "").strip()
    if not city:
        return {"status": "error", "message": "No city was provided."}

    norm_date = (date or "").strip().lower()
    if norm_date not in ("", "today", "tomorrow") and not _DATE_RE.match(norm_date):
        return {"status": "error", "city": city,
                "message": f"Could not understand the date '{date}'."}

    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(timeout=settings.request_timeout_seconds)
    try:
        try:
            matches = await _geocode(city, client)
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("Geocoding failed for {!r}: {}", city, exc)
            return {"status": "error", "city": city,
                    "message": "Weather lookup is temporarily unavailable."}

        if not matches:
            return {"status": "not_found", "city": city,
                    "message": f"Could not find a city named '{city}'."}

        top = matches[0]
        alternatives = [
            {"name": m.get("name"), "country": m.get("country"),
             "admin1": m.get("admin1")}
            for m in matches[1:4]
            if m.get("country") != top.get("country")
        ]

        try:
            forecast = await _fetch_forecast(top, client)
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("Forecast failed for {!r}: {}", city, exc)
            return {"status": "error", "city": city,
                    "message": "Weather provider did not respond in time."}

        result = _build_result(top, forecast, norm_date)
        if alternatives and result.get("status") == "ok":
            result["ambiguous"] = True
            result["alternatives"] = alternatives
        return result
    finally:
        if owns_client:
            await client.aclose()


async def _fetch_forecast(place: dict, client: httpx.AsyncClient) -> dict:
    resp = await client.get(
        FORECAST_URL,
        params={
            "latitude": place["latitude"],
            "longitude": place["longitude"],
            "current": "temperature_2m,relative_humidity_2m,"
                       "apparent_temperature,wind_speed_10m,weather_code",
            "daily": "weather_code,temperature_2m_max,temperature_2m_min,"
                     "precipitation_probability_max",
            "timezone": "auto",
            "forecast_days": 7,
            "wind_speed_unit": "kmh",
        },
    )
    resp.raise_for_status()
    return resp.json()


def _place_label(place: dict) -> dict:
    return {
        "city": place.get("name"),
        "country": place.get("country"),
        "region": place.get("admin1"),
    }


def _build_result(place: dict, forecast: dict, norm_date: str) -> dict:
    base = {"status": "ok", **_place_label(place)}
    daily = forecast.get("daily") or {}
    days: list[str] = daily.get("time") or []

    if norm_date in ("", "today"):
        cur = forecast.get("current") or {}
        base.update(
            when="current",
            observed_at=cur.get("time"),
            temperature_c=cur.get("temperature_2m"),
            feels_like_c=cur.get("apparent_temperature"),
            relative_humidity_percent=cur.get("relative_humidity_2m"),
            wind_speed_kmh=cur.get("wind_speed_10m"),
            condition=_condition(cur.get("weather_code")),
        )
        return base

    if norm_date == "tomorrow":
        idx = 1
    else:
        idx = days.index(norm_date) if norm_date in days else -1
    if idx < 0 or idx >= len(days):
        return {"status": "error", **_place_label(place),
                "message": "Forecast is only available for the next 7 days."}

    base.update(
        when="forecast",
        date=days[idx],
        temperature_max_c=_at(daily.get("temperature_2m_max"), idx),
        temperature_min_c=_at(daily.get("temperature_2m_min"), idx),
        precipitation_probability_percent=_at(
            daily.get("precipitation_probability_max"), idx),
        condition=_condition(_at(daily.get("weather_code"), idx)),
    )
    return base


def _at(seq: list | None, idx: int):
    if not seq or idx >= len(seq):
        return None
    return seq[idx]
