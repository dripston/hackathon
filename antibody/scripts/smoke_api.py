"""Hit every endpoint the console and voice agent use, as the browser would (Origin: localhost:3000),
and save real responses to antibody/fixtures/api-samples/ for the frontend's mocks.

    uv run python scripts/smoke_api.py            # both services must be running
"""

import json
import sys
from pathlib import Path

import httpx

ANTIBODY, DETECTION = "http://localhost:4000", "http://localhost:5050"
ORIGIN = {"Origin": "http://localhost:3000"}
OUT = Path(__file__).resolve().parents[1] / "fixtures" / "api-samples"


def check(name: str, r: httpx.Response, save: bool = True, expect: int = 200) -> object:
    cors = r.headers.get("access-control-allow-origin")
    mock = r.headers.get("x-antibody-mock")
    ok = r.status_code == expect and cors in ("http://localhost:3000", "*")
    print(f"{'ok  ' if ok else 'FAIL'} {r.request.method:4} {r.request.url.path:48} {r.status_code}"
          f"  cors={cors}  mock={mock or '-'}")
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text
    if save and r.status_code == expect:
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / f"{name}.json").write_text(json.dumps(body, indent=2), encoding="utf-8")
    return body if ok else None


def main() -> int:
    failures = 0
    with httpx.Client(headers=ORIGIN, timeout=60) as c:
        for name, url in [("detection_health", f"{DETECTION}/health"), ("detection_runs", f"{DETECTION}/runs?limit=20"),
                          ("detection_risks", f"{DETECTION}/risks"), ("health", f"{ANTIBODY}/health"),
                          ("overview", f"{ANTIBODY}/overview"), ("incidents", f"{ANTIBODY}/incidents"),
                          ("risks", f"{ANTIBODY}/risks"), ("trust", f"{ANTIBODY}/trust"),
                          ("aftercare", f"{ANTIBODY}/aftercare")]:
            failures += check(name, c.get(url)) is None
        gate = c.get(f"{ANTIBODY}/gate/latest")
        failures += check("gate_latest", gate, expect=gate.status_code if gate.status_code in (200, 404) else 200) is None
        incidents = c.get(f"{ANTIBODY}/incidents").json()
        for i, inc in enumerate(incidents[:3]):
            failures += check(f"incident_{i}", c.get(f"{ANTIBODY}/incidents/{inc['id']}")) is None
            failures += check(f"incident_{i}_brief", c.get(f"{ANTIBODY}/incidents/{inc['id']}/brief")) is None
        if incidents:
            iid = incidents[0]["id"]
            # Wrong phrase must be refused (and changes nothing).
            failures += check("approve_refused", c.post(f"{ANTIBODY}/incidents/{iid}/approve",
                                                        json={"fix_id": "fix_1", "phrase": "yes", "channel": "typed"}),
                              expect=400) is None
        pre = c.options(f"{ANTIBODY}/incidents/x/approve", headers={
            **ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
        failures += check("preflight", pre, save=False) is None
        failures += check("unknown_incident", c.get(f"{ANTIBODY}/incidents/nope"), save=False, expect=404) is None
    print(f"\n{'all endpoints ok' if not failures else f'{failures} FAILED'}; samples in {OUT}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
