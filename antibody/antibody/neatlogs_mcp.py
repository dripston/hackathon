"""neatlogs MCP client (Streamable HTTP, Authorization: Bearer <NEATLOGS_API_KEY>).

Tools used (https://docs.neatlogs.com/integrations/mcp-tools): list_detections, get_detection_trend,
search_traces, get_trace_context. Results are parsed from structured content when present, else from
the JSON text content.
"""

import asyncio
import json
import logging
from typing import Any

from .config import get_settings

log = logging.getLogger("antibody.neatlogs")


class NeatlogsUnavailable(RuntimeError):
    pass


def configured() -> bool:
    return bool(get_settings().neatlogs_api_key)


def _payload(result) -> Any:
    if getattr(result, "is_error", False):
        text = " ".join(getattr(c, "text", "") for c in (result.content or []))
        raise RuntimeError(f"neatlogs MCP tool error: {text[:300]}")
    sc = getattr(result, "structured_content", None)
    if sc:
        return sc.get("result", sc) if isinstance(sc, dict) and set(sc) == {"result"} else sc
    texts = [getattr(c, "text", "") for c in (result.content or []) if getattr(c, "text", None)]
    for t in texts:
        try:
            return json.loads(t)
        except json.JSONDecodeError:
            continue
    return {"text": "\n".join(texts)}


async def _call_many(calls: list[tuple[str, dict]]) -> list[Any]:
    from mcp import ClientSession
    from mcp.client.streamable_http import create_mcp_http_client, streamable_http_client

    s = get_settings()
    if not s.neatlogs_api_key:
        raise NeatlogsUnavailable("NEATLOGS_API_KEY not set")
    http = create_mcp_http_client(headers={"Authorization": f"Bearer {s.neatlogs_api_key}"})
    async with http:
        async with streamable_http_client(s.neatlogs_mcp_url, http_client=http) as streams:
            read, write = streams[0], streams[1]
            async with ClientSession(read, write) as session:
                await session.initialize()
                out = []
                for name, args in calls:
                    out.append(_payload(await session.call_tool(name, args)))
                return out


def call(name: str, args: dict | None = None) -> Any:
    return call_many([(name, args or {})])[0]


def call_many(calls: list[tuple[str, dict]]) -> list[Any]:
    """Run several tool calls over one MCP session (sync wrapper)."""
    try:
        return asyncio.run(_call_many(calls))
    except NeatlogsUnavailable:
        raise
    except Exception as e:
        raise NeatlogsUnavailable(f"neatlogs MCP failed: {_leaf(e)}") from e


def _leaf(e: BaseException) -> str:
    """The real error inside anyio/asyncio exception groups."""
    while isinstance(e, BaseExceptionGroup) and e.exceptions:
        e = e.exceptions[0]
    return f"{type(e).__name__}: {e}"


# ---- typed helpers ----

def list_detections() -> list[dict]:
    """Verified live 2026-10-11: {"total", "detections": [{id, slug, display_name, is_active, ...}]}.
    Each item gets a `name` (display_name, else slug) so callers can match our detection names."""
    out = []
    for d in (call("list_detections", {"limit": 100}) or {}).get("detections", []):
        d = dict(d)
        d.setdefault("name", d.get("display_name") or d.get("slug"))
        d.setdefault("enabled", d.get("is_active", True))
        out.append(d)
    return out


def detection_count(name: str, start_iso: str, end_iso: str) -> int:
    r = call("get_detection_trend", {"detection_name": name, "granularity": "hour",
                                     "date_range": f"{start_iso}/{end_iso}"}) or {}
    if "total_count" in r:
        return int(r["total_count"])
    return sum(int(p.get("count", 0)) for p in r.get("trend", []))


def search_traces(query: str, limit: int = 20, date_range: str | None = None) -> list[dict]:
    """Verified live: {"total", "totalRelation", "mode", "results": [...]}; an empty query is rejected."""
    if not query:
        return []
    args: dict = {"query": query, "limit": limit}
    if date_range:
        args["filters"] = {"date_range": date_range}
    r = call("search_traces", args) or {}
    return r.get("results", r.get("traces", []))


def trace_context(trace_id: str) -> dict:
    return call("get_trace_context", {"trace_id": trace_id}) or {}


def walk_spans(span: dict):
    if not isinstance(span, dict):
        return
    yield span
    for c in span.get("children") or []:
        yield from walk_spans(c)


def trace_attributes(ctx: dict) -> dict:
    """Merge span metadata so antibody.* custom attributes can be read from anywhere in the trace."""
    attrs: dict = {}
    for sp in walk_spans(ctx.get("root_span") or {}):
        md = sp.get("metadata") or {}
        if isinstance(md, dict):
            for k, v in md.items():
                if isinstance(v, dict) and k in ("attributes", "custom_attributes"):
                    attrs.update(v)
                else:
                    attrs.setdefault(k, v)
    return attrs


def is_simulated(ctx: dict) -> bool:
    v = trace_attributes(ctx).get("antibody.simulated")
    return v is True or str(v).lower() == "true"
