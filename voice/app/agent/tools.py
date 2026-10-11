"""Tool definitions and dispatch for Groq native function calling.

Exposes the ``get_weather`` tool schema and a safe ``execute_tool`` dispatcher
that validates the tool name and JSON arguments before calling the underlying
service.
"""

from __future__ import annotations

from app.services import weather
from app.utils.logging import logger

# OpenAI/Groq-style function schema.
TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": (
                "Get current weather or a near-term daily forecast for a city "
                "using live Open-Meteo data. Use for any weather question."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {
                        "type": "string",
                        "description": "City name, e.g. Bengaluru or Mumbai.",
                    },
                    "date": {
                        "type": "string",
                        "description": (
                            "Optional. 'today' (default), 'tomorrow', or an "
                            "ISO date YYYY-MM-DD within the next 7 days."
                        ),
                    },
                },
                "required": ["city"],
            },
        },
    }
]

_MAX_CITY_LEN = 120


async def execute_tool(name: str, arguments: dict) -> dict:
    """Validate and run a tool call. Returns a JSON-serialisable dict.

    Raises ``KeyError`` only for unknown tools; argument problems are returned
    as structured ``{"status": "error", ...}`` dicts so the model can recover.
    """
    if name != "get_weather":
        logger.warning("Unknown tool requested: {!r}", name)
        return {"status": "error", "message": f"Unknown tool '{name}'."}

    if not isinstance(arguments, dict):
        return {"status": "error", "message": "Tool arguments must be an object."}

    city = arguments.get("city")
    if not isinstance(city, str) or not city.strip():
        return {"status": "error", "message": "A non-empty 'city' is required."}
    if len(city) > _MAX_CITY_LEN:
        return {"status": "error", "message": "City name is too long."}

    date = arguments.get("date")
    if date is not None and not isinstance(date, str):
        return {"status": "error", "message": "'date' must be a string if provided."}

    logger.info("Tool get_weather(city={!r}, date={!r})", city, date)
    return await weather.get_weather(city.strip(), date)
