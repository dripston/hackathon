"""Client for Antibody's Operator API (CONTRACT.md, port 4000).

The voice agent reads incidents and briefs through it, and passes the engineer's
spoken approval phrase through unchanged apart from transcription clean-up
(see ``approval_phrase``). Antibody itself enforces the exact-phrase rule.
"""

from __future__ import annotations

import re

import httpx

from app.config import Settings, get_settings

_NUMBER_WORDS = {
    "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
    "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10",
}
_PHRASE_RE = re.compile(r"^(approve|reject) fix (\d+)(?:\s+(?:because\s+)?(.*))?$")


class AntibodyError(Exception):
    """Antibody returned an error (message is safe to read out)."""


def parse_command(text: str) -> tuple[str, int, str] | None:
    """('approve' | 'reject', fix number, reason) if ``text`` is an approval or rejection.

    Speech-to-text adds capitals, edge punctuation and number words ("Approve fix one."),
    so those are normalised. Nothing else is: "yes", "ok, approve it" or "please approve
    fix 1" are not approvals. An approval must be exactly "approve fix <n>"; a rejection
    may carry a reason after the number.
    """
    t = " ".join((text or "").lower().split()).strip(" .!?,;:\"'")
    t = re.sub(r"\b(" + "|".join(_NUMBER_WORDS) + r")\b", lambda m: _NUMBER_WORDS[m.group(1)], t)
    t = re.sub(r"^(approve|reject) fix (?:number |no\.? |#)?", r"\1 fix ", t)
    m = _PHRASE_RE.match(t)
    if not m:
        return None
    verb, n, rest = m.group(1), int(m.group(2)), (m.group(3) or "").strip()
    if verb == "approve" and rest:
        return None
    return verb, n, rest


class AntibodyClient:
    def __init__(self, settings: Settings | None = None, transport: httpx.AsyncBaseTransport | None = None):
        self.settings = settings or get_settings()
        self._transport = transport

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(base_url=self.settings.antibody_url.rstrip("/"),
                                 timeout=self.settings.request_timeout_seconds, transport=self._transport)

    async def _get(self, path: str) -> tuple[object, bool]:
        try:
            async with self._client() as c:
                r = await c.get(path)
        except httpx.HTTPError as exc:
            raise AntibodyError(f"Antibody is not reachable at {self.settings.antibody_url}") from exc
        if r.status_code >= 400:
            raise AntibodyError(_error(r))
        return r.json(), r.headers.get("x-antibody-mock", "").lower() in ("1", "true")

    async def incidents(self) -> tuple[list[dict], bool]:
        data, mock = await self._get("/incidents")
        return list(data or []), mock

    async def brief(self, incident_id: str) -> tuple[str, bool]:
        data, mock = await self._get(f"/incidents/{incident_id}/brief")
        return str((data or {}).get("text", "")), mock

    async def detail(self, incident_id: str) -> dict:
        data, _ = await self._get(f"/incidents/{incident_id}")
        return data or {}

    async def awaiting(self) -> list[dict]:
        """Incidents waiting for a human decision, newest first."""
        items, _ = await self.incidents()
        return [i for i in items if i.get("status") == "awaiting_approval"]

    async def _post(self, path: str, body: dict) -> dict:
        try:
            async with self._client() as c:
                r = await c.post(path, json=body)
        except httpx.HTTPError as exc:
            raise AntibodyError(f"Antibody is not reachable at {self.settings.antibody_url}") from exc
        if r.status_code >= 400:
            raise AntibodyError(_error(r))
        return r.json()

    async def approve(self, incident_id: str, n: int, phrase: str, channel: str) -> dict:
        return await self._post(f"/incidents/{incident_id}/approve",
                                {"fix_id": f"fix_{n}", "phrase": phrase, "channel": channel})

    async def reject(self, incident_id: str, n: int, reason: str) -> dict:
        return await self._post(f"/incidents/{incident_id}/reject", {"fix_id": f"fix_{n}", "reason": reason})


def _error(r: httpx.Response) -> str:
    try:
        return str(r.json().get("error") or r.text)[:300]
    except ValueError:
        return f"Antibody returned HTTP {r.status_code}"
