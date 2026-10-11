"""The on-call side of the bot: Antibody calls the engineer, the engineer approves by voice.

* ``watch`` polls Antibody. When an incident starts waiting for approval (or is escalated
  because no fix passed), it sends the on-call chat a voice note with the brief.
* ``handle_command`` runs *before* the LLM. "approve fix <n>" and "reject fix <n> [reason]"
  go straight to Antibody with the engineer's own words; the model never approves anything.
"""

from __future__ import annotations

import asyncio
import io
import json
from pathlib import Path

from telegram import InputFile

from app.config import Settings
from app.errors import VoiceAgentError
from app.services.antibody import AntibodyClient, AntibodyError, parse_command
from app.utils.logging import logger


class OnCallState:
    """Who gets called, which incidents were announced, and each chat's current incident.
    Saved to ``<state_dir>/oncall.json`` so a restart doesn't call twice."""

    def __init__(self, settings: Settings):
        self.path = Path(settings.state_dir) / "oncall.json"
        data = {}
        if self.path.exists():
            try:
                data = json.loads(self.path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                data = {}
        self.chat_id: int | None = int(settings.oncall_chat_id) if settings.oncall_chat_id else data.get("chat_id")
        self.announced: set[str] = set(data.get("announced", []))
        self.current: dict[str, str] = dict(data.get("current", {}))

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps({"chat_id": self.chat_id, "announced": sorted(self.announced),
                                         "current": self.current}, indent=2), encoding="utf-8")

    def set_current(self, chat_id: int, incident_id: str) -> None:
        self.current[str(chat_id)] = incident_id
        self.save()


def _fix_number(detail: dict) -> int | None:
    fix_id = ((detail or {}).get("resolution") or {}).get("accepted_fix_id") or ""
    return int(fix_id.split("_")[1]) if fix_id.startswith("fix_") and fix_id[4:].isdigit() else None


async def call_script(client: AntibodyClient, incident: dict) -> str:
    """What the bot says when it calls: the brief plus the exact phrase to approve."""
    text, mock = await client.brief(incident["id"])
    if incident.get("status") == "escalated":
        ask = "No fix passed the whole family, so this one needs you."
    else:
        n = _fix_number(await client.detail(incident["id"]))
        ask = f"To merge it, say: approve fix {n}. To turn it down, say: reject fix {n}." if n else ""
    note = " Note: this incident ran on test data." if mock else ""
    return f"Antibody here, you're on call. {text} {ask}{note}".strip()


async def handle_command(client: AntibodyClient, state: OnCallState, chat_id: int, text: str,
                         channel: str) -> str | None:
    """Reply text if ``text`` is an approval or rejection, else None (let the LLM answer)."""
    cmd = parse_command(text)
    if cmd is None:
        return None
    verb, n, reason = cmd
    try:
        incident_id = state.current.get(str(chat_id))
        waiting = await client.awaiting()
        if incident_id not in {i["id"] for i in waiting}:
            if not waiting:
                return "There's no fix waiting for approval right now."
            incident_id = waiting[0]["id"]
        if verb == "approve":
            res = await client.approve(incident_id, n, f"approve fix {n}", channel)
            merged = "and merged" if res.get("merged") else "but it is not merged yet"
            pr = " The pull request is on GitHub." if res.get("pr_url") else ""
            return f"Approved fix {n} {merged}. The incident is resolved.{pr}"
        await client.reject(incident_id, n, reason or f"rejected by {channel}")
        return f"Rejected fix {n}. The incident is escalated, and nothing was merged."
    except AntibodyError as exc:
        return f"Antibody said: {exc}"


async def _send_call(bot, chat_id: int, text: str, services) -> None:
    await bot.send_message(chat_id=chat_id, text=text)
    try:
        wav = await services.synthesize(text, services.settings.sarvam_tts_language)
        ogg = await services.to_ogg(wav)
    except VoiceAgentError as exc:
        logger.warning("On-call TTS failed; text only: {}", exc)
        return
    await bot.send_voice(chat_id=chat_id, voice=InputFile(io.BytesIO(ogg), filename="oncall.ogg"))


async def check_once(bot, services) -> list[str]:
    """Announce every incident that needs a human and hasn't been announced. Returns their ids."""
    state: OnCallState = services.oncall
    if state.chat_id is None:
        return []
    items, _ = await services.antibody.incidents()
    called = []
    for inc in items:
        if inc.get("status") not in ("awaiting_approval", "escalated") or inc["id"] in state.announced:
            continue
        text = await call_script(services.antibody, inc)
        await _send_call(bot, state.chat_id, text, services)
        state.announced.add(inc["id"])
        state.set_current(state.chat_id, inc["id"])
        called.append(inc["id"])
        logger.info("On-call: called chat {} about {}", state.chat_id, inc["id"])
    return called


async def watch(bot, services) -> None:
    """Poll Antibody forever. Errors are logged and retried on the next tick."""
    while True:
        try:
            await check_once(bot, services)
        except AntibodyError as exc:
            logger.debug("On-call poll: {}", exc)
        except Exception as exc:  # keep the watcher alive; the bot must not die with it
            logger.error("On-call poll failed: {}", exc)
        await asyncio.sleep(services.settings.oncall_poll_seconds)
