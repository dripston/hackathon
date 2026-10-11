"""Tool definitions and dispatch for Groq native function calling.

Exposes ``get_weather`` and three read-only Antibody tools (incidents, brief,
details) plus a safe ``execute_tool`` dispatcher that validates the tool name and
JSON arguments before calling the underlying service. There is deliberately no
approve tool: approvals go from the engineer's own words to Antibody, never
through the model (see ``app.bot.oncall``).
"""

from __future__ import annotations

from app.services import weather
from app.services.antibody import AntibodyClient, AntibodyError
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
    },
    {
        "type": "function",
        "function": {
            "name": "list_incidents",
            "description": (
                "List Antibody's incidents (silent AI agent failures it caught), newest "
                "first, with status. Use when asked what's broken or what needs approval."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_incident_brief",
            "description": (
                "The 3-5 sentence brief for an incident: what broke, why, the proposed "
                "fix and how it scored. Omit incident_id for the newest incident."
            ),
            "parameters": {
                "type": "object",
                "properties": {"incident_id": {"type": "string"}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_incident_details",
            "description": (
                "Details of an incident: the commit that caused it, why it was made "
                "(from the Entire checkpoint), the accepted fix and before/after scores. "
                "Omit incident_id for the newest incident."
            ),
            "parameters": {
                "type": "object",
                "properties": {"incident_id": {"type": "string"}},
            },
        },
    },
]

_ANTIBODY_TOOLS = {"list_incidents", "get_incident_brief", "get_incident_details"}

_MAX_CITY_LEN = 120


async def execute_tool(name: str, arguments: dict) -> dict:
    """Validate and run a tool call. Returns a JSON-serialisable dict.

    Raises ``KeyError`` only for unknown tools; argument problems are returned
    as structured ``{"status": "error", ...}`` dicts so the model can recover.
    """
    if name != "get_weather" and name not in _ANTIBODY_TOOLS:
        logger.warning("Unknown tool requested: {!r}", name)
        return {"status": "error", "message": f"Unknown tool '{name}'."}

    if not isinstance(arguments, dict):
        return {"status": "error", "message": "Tool arguments must be an object."}

    if name in _ANTIBODY_TOOLS:
        try:
            return await _antibody_tool(name, arguments)
        except AntibodyError as exc:
            return {"status": "error", "message": str(exc)}

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


async def _antibody_tool(name: str, arguments: dict, client: AntibodyClient | None = None) -> dict:
    client = client or AntibodyClient()
    items, mock = await client.incidents()
    if name == "list_incidents":
        return {"status": "ok", "test_data": mock, "incidents": [
            {"id": i["id"], "status": i["status"], "detection": i.get("detection"),
             "first_seen": i.get("first_seen")} for i in items[:10]]}
    incident_id = arguments.get("incident_id") or (items[0]["id"] if items else None)
    if not isinstance(incident_id, str) or not incident_id:
        return {"status": "error", "message": "There are no incidents."}
    if name == "get_incident_brief":
        text, mock = await client.brief(incident_id)
        return {"status": "ok", "incident_id": incident_id, "test_data": mock, "brief": text}
    d = await client.detail(incident_id)
    diag = d.get("diagnosis") or {}
    res = d.get("resolution") or {}
    families = d.get("families") or []
    return {
        "status": "ok", "incident_id": incident_id, "test_data": mock,
        "incident_status": (d.get("incident") or {}).get("status"),
        "commit": (diag.get("commit_sha") or "")[:8] or None, "explanation": diag.get("explanation"),
        "why_it_was_changed": diag.get("reasoning_excerpt"),
        "why_source": diag.get("reasoning_source"),
        "accepted_fix": res.get("accepted_fix_id"), "pr_url": res.get("pr_url"),
        "merged": res.get("merged", False),
        "scores": [{"candidate": f.get("candidate"), "must_fix": f"{f.get('must_fix_passed')}/{f.get('must_fix_total')}",
                    "must_not_change": f"{f.get('must_not_change_passed')}/{f.get('must_not_change_total')}"}
                   for f in families],
    }
