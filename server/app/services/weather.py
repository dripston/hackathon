"""Shared asynchronous weather service used by HTTP and the single voice tool."""
import asyncio
from datetime import datetime, timedelta, timezone
from time import perf_counter

import httpx
from loguru import logger
from pydantic import BaseModel, ConfigDict, Field, field_validator


class WeatherRequest(BaseModel):
    city: str = Field(min_length=1, max_length=120)

    @field_validator("city", mode="before")
    @classmethod
    def normalize_city(cls, value):
        return " ".join(value.split()) if isinstance(value, str) else value


class WeatherResult(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    city: str
    country: str | None = None
    temperature_c: float
    relative_humidity_percent: float = Field(ge=0, le=100)
    wind_speed_kmh: float = Field(ge=0)
    condition: str
    observed_at: str
    source: str = "Open-Meteo"


class WeatherError(Exception):
    def __init__(self, code: str, message: str, status: int, candidates=None):
        super().__init__(message)
        self.status = status
        self.detail = {"code": code, "message": message}
        if candidates:
            self.detail["candidates"] = candidates


CONDITIONS = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Depositing rime fog", 51: "Light drizzle", 53: "Moderate drizzle",
    55: "Dense drizzle", 56: "Light freezing drizzle", 57: "Dense freezing drizzle",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain", 66: "Light freezing rain",
    67: "Heavy freezing rain", 71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
    77: "Snow grains", 80: "Slight rain showers", 81: "Moderate rain showers",
    82: "Violent rain showers", 85: "Slight snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail",
}


class WeatherService:
    def __init__(self, client: httpx.AsyncClient, timeout: float = 4):
        self.client = client
        self.timeout = timeout

    async def get_weather(self, city: str) -> dict:
        city = WeatherRequest(city=city).city
        started = perf_counter()
        try:
            # One deadline covers both provider requests, including pool wait.
            async with asyncio.timeout(self.timeout):
                return await self._lookup(city)
        except (TimeoutError, httpx.TimeoutException) as exc:
            raise WeatherError("provider_timeout", "Weather lookup timed out. Please try again.", 504) from exc
        except httpx.HTTPError as exc:
            raise WeatherError("provider_unavailable", "Weather service is temporarily unavailable.", 503) from exc
        except (KeyError, TypeError, ValueError, AttributeError) as exc:
            raise WeatherError("invalid_provider_response", "Weather data is unavailable. Please try again.", 502) from exc
        finally:
            logger.info("weather_tool duration_ms={:.1f}", (perf_counter() - started) * 1000)

    async def _lookup(self, city: str) -> dict:
        parts = [part.strip() for part in city.split(",")]
        if not all(parts):
            raise WeatherError("invalid_city", "Use City, State, Country without empty parts.", 422)
        aliases = {"दिल्ली": "Delhi", "नई दिल्ली": "New Delhi", "मुंबई": "Mumbai", "बेंगलुरु": "Bengaluru"}
        name = aliases.get(parts[0], parts[0])
        response = await self.client.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={"name": name, "count": 100, "language": "en", "format": "json"},
        )
        response.raise_for_status()
        locations = response.json().get("results", [])
        # Prefer exact names over fuzzy matches such as districts/suburbs, while
        # still requiring clarification for multiple cities with that name.
        exact = [loc for loc in locations if loc.get("name", "").casefold() == name.casefold()]
        if exact:
            locations = exact
        for qualifier in parts[1:]:
            locations = [loc for loc in locations if qualifier.casefold() in {
                str(loc.get(key, "")).casefold()
                for key in ("country", "country_code", "admin1", "admin2", "admin3", "admin4")
            }]
        locations = list({(loc["latitude"], loc["longitude"]): loc for loc in locations}.values())
        if not locations:
            raise WeatherError("city_not_found", "City not found. Please provide its state or country.", 404)
        if len(locations) > 1:
            candidates = [", ".join(filter(None, [loc["name"], loc.get("admin1"), loc.get("country")])) for loc in locations[:5]]
            raise WeatherError("ambiguous_city", "Which state or country do you mean?", 409, candidates)
        location = locations[0]
        response = await self.client.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": location["latitude"], "longitude": location["longitude"],
                "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code",
                "temperature_unit": "celsius", "wind_speed_unit": "kmh", "timezone": "auto",
            },
        )
        response.raise_for_status()
        payload = response.json()
        current = payload["current"]
        observed = datetime.fromisoformat(current["time"])
        if observed.tzinfo is None:
            observed = observed.replace(tzinfo=timezone(timedelta(seconds=payload["utc_offset_seconds"])))
        return WeatherResult(
            city=location["name"], country=location.get("country"),
            temperature_c=current["temperature_2m"],
            relative_humidity_percent=current["relative_humidity_2m"],
            wind_speed_kmh=current["wind_speed_10m"],
            condition=CONDITIONS.get(current["weather_code"], "Unknown conditions"),
            observed_at=observed.isoformat(),
        ).model_dump()
