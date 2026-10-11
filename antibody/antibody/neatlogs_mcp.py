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


async def _call_many(calls: list[tuple[str, dict]], tolerant: bool = False) -> list[Any]:
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
                    try:
                        out.append(_payload(await session.call_tool(name, args)))
                    except RuntimeError:  # a tool-level error, e.g. one trace not ingested yet
                        if not tolerant:
                            raise
                        out.append(None)
                return out


def call(name: str, args: dict | None = None) -> Any:
    return call_many([(name, args or {})])[0]


def call_many(calls: list[tuple[str, dict]], tolerant: bool = False) -> list[Any]:
    """Run several tool calls over one MCP session (sync wrapper). `tolerant`: a call that fails
    with a tool error gives None instead of failing the batch."""
    import time

    for attempt in range(2):  # one retry: the MCP server sometimes answers 503 mid-session
        try:
            return asyncio.run(_call_many(calls, tolerant))
        except NeatlogsUnavailable:
            raise
        except Exception as e:
            leaf = _leaf(e)
            if attempt == 0 and "tool error" not in leaf:
                time.sleep(2)
                continue
            raise NeatlogsUnavailable(f"neatlogs MCP failed: {leaf}") from e


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


def search_traces(query: str, limit: int = 20, date_from: str | None = None, date_to: str | None = None,
                  detection_name: str | None = None, workflow_name: str | None = None) -> list[dict]:
    """Verified live: {"total", "totalRelation", "mode", "results": [...]}; an empty query is rejected.
    Filters are top-level arguments (date_from/date_to ISO, detection_name, workflow_name)."""
    if not query:
        return []
    args: dict = {"query": query, "limit": limit}
    for k, v in (("date_from", date_from), ("date_to", date_to), ("detection_name", detection_name),
                 ("workflow_name", workflow_name)):
        if v:
            args[k] = v
    r = call("search_traces", args) or {}
    return r.get("results", r.get("traces", []))


def detection_occurrences(name: str, start_iso: str, end_iso: str) -> int:
    """How often a detection fired in the hourly buckets overlapping [start, end) (verified live:
    get_detection_trend -> {total_occurrences, data_points: [{date, count}]}). Hour granularity is the
    finest neatlogs offers, so a 10-minute window counts its whole hour."""
    r = call("get_detection_trend", {"detection_name": name, "period": "24h", "granularity": "hour"}) or {}
    start_hour = start_iso[:13]  # "YYYY-MM-DDTHH"
    return sum(int(p.get("count", 0)) for p in r.get("data_points", [])
               if start_hour <= str(p.get("date", ""))[:13] <= end_iso[:13])


# ---- our detections ----

SCORE_SPAN = "antibody.score"


def detection_config(check_id: str) -> dict:
    """Conditional rule: the run's score span says this tripwire failed, and the run was real. The span's
    input is compact JSON written by detection/tracing.py, e.g. ..."antibody.simulated":false,...
    "antibody.tw.tw_empty_after_error":1..."""
    rules = [
        {"type": "rule", "field": "span_name", "operator": "=", "value": SCORE_SPAN},
        {"type": "rule", "field": "input", "operator": "contains", "value": f'"antibody.tw.{check_id}":1'},
        {"type": "rule", "field": "input", "operator": "contains", "value": '"antibody.simulated":false'},
    ]
    return {"root": {"type": "group", "logic": "AND", "children": rules}}


DESCRIPTIONS = {
    "tw_invented_person": "The brief names a decision maker who appears in no people-search result.",
    "tw_empty_after_error": "People search failed, but the brief says no decision makers were found.",
    "tw_company_match_skipped": "The brief used a company record without confirming it matches the domain.",
    "tw_claimed_success_on_failure": "A tool failed, but the summary claims the research completed.",
}


def ensure_detections(check_ids: list[str], echo=print) -> dict[str, str]:
    """Create our tripwire detections in neatlogs if missing. Returns {check_id: status}."""
    existing = {d.get("name") for d in list_detections()} | {d.get("slug") for d in list_detections()}
    groups = (call("list_detection_groups") or {}).get("groups", [])
    group = next((g["id"] for g in groups if g.get("name") == "Negative"), groups[0]["id"] if groups else None)
    out = {}
    for cid in check_ids:
        if cid in existing:
            out[cid] = "exists"
            echo(f"  {cid}: already exists")
            continue
        run_on = {"frequency": "span_name", "span_names": [SCORE_SPAN]}
        preview = call("preview_detection", {"type": "conditional", "config": detection_config(cid),
                                             "run_on": run_on, "timeframe_days": 14, "limit": 1}) or {}
        n = preview.get("total_count", 0)
        created = call("create_detection", {
            "display_name": cid, "group_id": group, "type": "conditional", "config": detection_config(cid),
            "description": DESCRIPTIONS.get(cid, cid) + " Real runs only (antibody.simulated = false).",
            "run_on": run_on}) or {}
        out[cid] = f"created ({n} matching spans in the last 14 days)"
        echo(f"  {cid}: created, id {created.get('id') or created.get('detection', {}).get('id')}, "
             f"{n} matching spans in the last 14 days")
    return out


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
