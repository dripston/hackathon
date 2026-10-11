"""Crustdata tools (API version 2025-11-01). Endpoints and fields from docs.crustdata.com:

- company:  POST /company/search  filter basic_info.primary_domain = <domain>
- people:   POST /person/search   employer + current-title filters
- jobs:     POST /job/search      company.basic_info.company_id = <id>

Results are normalised to small dicts before they are recorded, so cassettes stay compact and
contain only what the agent uses. Response shapes verified against real responses on 2026-10-11 (companies[], profiles[],
job_listings[]; credits reported in the x-credits-used header). The name fallback filter is still
unverified.
"""

import httpx

from ...config import get_settings
from ...models import ToolError
from .provider import ToolCallError

CREDITS_USED = [0.0]  # running total of the x-credits-used response header, for `detection record`

TITLES = ["Founder", "CEO", "Chief Executive", "CTO", "Chief Technology", "VP Engineering",
          "Head of Engineering", "VP Sales", "Head of Sales"]


def _post(path: str, body: dict) -> dict:
    s = get_settings()
    if not s.crustdata_api_key:
        raise ToolCallError(ToolError(code="NO_CREDENTIALS", message="CRUSTDATA_API_KEY not set"))
    try:
        r = httpx.post(f"{s.crustdata_base_url.rstrip('/')}{path}", json=body, timeout=30.0, headers={
            "authorization": f"Bearer {s.crustdata_api_key}", "content-type": "application/json",
            "x-api-version": s.crustdata_api_version,
        })
    except httpx.TimeoutException:
        raise ToolCallError(ToolError(code="TIMEOUT", message=f"{path} timed out"))
    except httpx.HTTPError as e:
        raise ToolCallError(ToolError(code="HTTP_ERROR", message=str(e)[:200]))
    if r.status_code == 429:
        raise ToolCallError(ToolError(code="HTTP_429", message="rate limited"))
    if r.status_code >= 500:
        raise ToolCallError(ToolError(code="HTTP_500", message=f"server error {r.status_code}"))
    if r.status_code >= 400:
        raise ToolCallError(ToolError(code=f"HTTP_{r.status_code}", message=r.text[:200]))
    try:
        CREDITS_USED[0] += float(r.headers.get("x-credits-used") or 0)
    except ValueError:
        pass
    return r.json()


def _get(d: dict, dotted: str):
    for part in dotted.split("."):
        if not isinstance(d, dict):
            return None
        d = d.get(part)
    return d


def company_enrich(args: dict) -> dict:
    """Resolve a domain to a company. Exact domain match first; if none, fall back to a name match on
    the domain's stem (e.g. 'harborline' for harborline.co), which can return a different company
    with the same name. That fallback is why the agent must confirm the company."""
    domain = args["domain"]
    fields = ["crustdata_company_id", "basic_info.name", "basic_info.primary_domain", "headcount.total"]
    res = _post("/company/search", {"filters": {"field": "basic_info.primary_domain", "type": "=", "value": domain},
                                     "limit": 1, "fields": fields})
    matched_by = "domain"
    companies = res.get("companies") or []
    if not companies:
        stem = domain.split(".")[0].replace("-", " ").title()
        # unverified: exact-name filter on basic_info.name
        res = _post("/company/search", {"filters": {"field": "basic_info.name", "type": "=", "value": stem},
                                         "limit": 1, "fields": fields})
        companies = res.get("companies") or []
        matched_by = "name"
    if not companies:
        return {}
    c = companies[0]
    return {
        "company_id": c.get("crustdata_company_id"),
        "name": _get(c, "basic_info.name"),
        "domain": _get(c, "basic_info.primary_domain"),
        "headcount": _get(c, "headcount.total"),
        "matched_by": matched_by,
    }


def people_search(args: dict) -> list[dict]:
    """Current leaders at the company (founders, C-level, VP/Head of Engineering and Sales)."""
    body = {
        "filters": {"op": "and", "conditions": [
            {"field": "experience.employment_details.current.company_name", "type": "in", "value": [args["company"]]},
            {"op": "or", "conditions": [
                {"field": "experience.employment_details.current.title", "type": "(.)", "value": t} for t in TITLES]},
        ]},
        # Only the fields the brief uses: profiles are billed per field group (0.33 -> 0.13 credits each).
        "fields": ["basic_profile.name", "basic_profile.current_title"],
        "limit": int(args.get("limit", 10)),
    }
    res = _post("/person/search", body)
    out = []
    for p in res.get("profiles") or []:
        out.append({"name": _get(p, "basic_profile.name"), "title": _get(p, "basic_profile.current_title")})
    return [p for p in out if p["name"]]


def jobs(args: dict) -> list[dict]:
    res = _post("/job/search", {
        "filters": {"field": "company.basic_info.company_id", "type": "=", "value": args["company_id"]},
        "fields": ["job_details.title", "metadata.date_added"],
        "sorts": [{"field": "metadata.date_added", "order": "desc"}],
        "limit": int(args.get("limit", 10)),
    })
    return [{"title": _get(j, "job_details.title"), "date_added": _get(j, "metadata.date_added")}
            for j in res.get("job_listings") or [] if _get(j, "job_details.title")]


LIVE = {"crustdata.company_enrich": company_enrich, "crustdata.people_search": people_search, "crustdata.jobs": jobs}
