"""The Antibody link: strict approval phrases, the Operator API client, and the on-call call.

A fake Antibody runs on ``httpx.MockTransport``; no network.
"""

from __future__ import annotations

import json

import httpx
import pytest

from app.bot import oncall
from app.bot.oncall import OnCallState
from app.services.antibody import AntibodyClient, AntibodyError, parse_command

INC = {"id": "inc_1_tw_empty_after_error", "status": "awaiting_approval",
       "detection": "tw_empty_after_error", "first_seen": "2026-10-11T09:39:00Z"}


@pytest.mark.parametrize("text,expected", [
    ("approve fix 1", ("approve", 1, "")),
    ("Approve fix one.", ("approve", 1, "")),
    ("  APPROVE FIX 2!  ", ("approve", 2, "")),
    ("approve fix number 3", ("approve", 3, "")),
    ("reject fix 1 because it hides the error", ("reject", 1, "it hides the error")),
    ("reject fix 2", ("reject", 2, "")),
    ("yes", None),
    ("ok do it", None),
    ("please approve fix 1", None),
    ("approve fix 1 and also fix 2", None),
    ("approve it", None),
])
def test_parse_command(text, expected):
    assert parse_command(text) == expected


class FakeAntibody:
    """Enough of the Operator API to drive the bot, with the same exact-phrase rule."""

    def __init__(self, incidents=None, mock=False):
        self.incidents = incidents if incidents is not None else [dict(INC)]
        self.mock = mock
        self.approvals: list[dict] = []
        self.rejections: list[dict] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        h = {"x-antibody-mock": "1"} if self.mock else {}
        path = request.url.path
        if path == "/incidents":
            return httpx.Response(200, json=self.incidents, headers=h)
        if path.endswith("/brief"):
            return httpx.Response(200, json={"text": "People search errors were reported as no contacts."}, headers=h)
        if path.endswith("/approve"):
            body = json.loads(request.content)
            if body["phrase"] != f"approve fix {body['fix_id'].split('_')[1]}":
                return httpx.Response(400, json={"error": "Not an approval phrase"})
            self.approvals.append(body)
            self.incidents[0]["status"] = "resolved"
            return httpx.Response(200, json={"accepted_fix_id": "fix_1", "merged": True,
                                             "pr_url": "https://github.com/x/y/pull/1"})
        if path.endswith("/reject"):
            self.rejections.append(json.loads(request.content))
            self.incidents[0]["status"] = "escalated"
            return httpx.Response(200, json={"accepted_fix_id": "fix_1"})
        if path.startswith("/incidents/"):
            return httpx.Response(200, json={"incident": self.incidents[0], "families": [],
                                             "resolution": {"accepted_fix_id": "fix_1"}}, headers=h)
        return httpx.Response(404, json={"error": "Unknown"})

    def client(self, settings) -> AntibodyClient:
        return AntibodyClient(settings, transport=httpx.MockTransport(self.handler))


@pytest.fixture
def state(settings, tmp_path):
    settings.state_dir = str(tmp_path)
    return OnCallState(settings)


async def test_approve_by_voice_goes_to_antibody(settings, state):
    fake = FakeAntibody()
    reply = await oncall.handle_command(fake.client(settings), state, 42, "Approve fix one.", "voice")
    assert fake.approvals == [{"fix_id": "fix_1", "phrase": "approve fix 1", "channel": "voice"}]
    assert "Approved fix 1 and merged" in reply


async def test_not_a_decision_is_left_to_the_llm(settings, state):
    fake = FakeAntibody()
    assert await oncall.handle_command(fake.client(settings), state, 42, "yes do it", "voice") is None
    assert fake.approvals == []


async def test_reject_with_reason(settings, state):
    fake = FakeAntibody()
    reply = await oncall.handle_command(fake.client(settings), state, 42, "reject fix 1 because risky", "typed")
    assert fake.rejections == [{"fix_id": "fix_1", "reason": "risky"}]
    assert "Rejected fix 1" in reply


async def test_nothing_waiting(settings, state):
    fake = FakeAntibody(incidents=[])
    reply = await oncall.handle_command(fake.client(settings), state, 42, "approve fix 1", "typed")
    assert "no fix waiting" in reply


async def test_antibody_down_is_reported(settings, state):
    def down(request):
        raise httpx.ConnectError("refused")

    client = AntibodyClient(settings, transport=httpx.MockTransport(down))
    reply = await oncall.handle_command(client, state, 42, "approve fix 1", "typed")
    assert reply.startswith("Antibody said:") and "not reachable" in reply
    with pytest.raises(AntibodyError):
        await client.incidents()


class Bot:
    def __init__(self):
        self.messages, self.voices = [], []

    async def send_message(self, chat_id, text):
        self.messages.append((chat_id, text))

    async def send_voice(self, chat_id, voice):
        self.voices.append(chat_id)


class Services:
    def __init__(self, settings, client, state):
        self.settings, self.antibody, self.oncall = settings, client, state

    async def synthesize(self, text, language):
        return b"wav"

    async def to_ogg(self, wav):
        return b"ogg"


async def test_call_once_per_incident_with_the_exact_phrase(settings, state):
    fake = FakeAntibody(mock=True)
    state.chat_id = 7
    services, bot = Services(settings, fake.client(settings), state), Bot()
    assert await oncall.check_once(bot, services) == [INC["id"]]
    text = bot.messages[0][1]
    assert "say: approve fix 1" in text and "test data" in text and bot.voices == [7]
    assert await oncall.check_once(bot, services) == []  # not called twice
    assert OnCallState(settings).announced == {INC["id"]}  # survives a restart


async def test_no_call_without_an_on_call_chat(settings, state):
    services, bot = Services(settings, FakeAntibody().client(settings), state), Bot()
    assert await oncall.check_once(bot, services) == []
    assert bot.messages == []


async def test_one_call_at_a_time_oldest_first(settings, state):
    older = dict(INC, id="inc_0_old", first_seen="2026-10-11T09:00:00Z")
    fake = FakeAntibody(incidents=[dict(INC), older])  # API order: newest first
    state.chat_id = 7
    services, bot = Services(settings, fake.client(settings), state), Bot()
    assert await oncall.check_once(bot, services) == ["inc_0_old"]
    assert await oncall.check_once(bot, services) == []  # still deciding on the first
    reply = await oncall.handle_command(fake.client(settings), state, 7, "approve fix 1", "voice")
    assert fake.approvals and "1 more fix is waiting" in reply


async def test_concurrent_checks_call_once(settings, state):
    import asyncio

    fake = FakeAntibody()
    state.chat_id = 7
    services, bot = Services(settings, fake.client(settings), state), Bot()
    results = await asyncio.gather(oncall.check_once(bot, services), oncall.check_once(bot, services))
    assert sorted(len(r) for r in results) == [0, 1] and len(bot.messages) == 1
