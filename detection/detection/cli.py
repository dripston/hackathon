"""detection serve | run | traffic | forecast | record | seed-fixtures"""

import argparse
import json
import random
import sys
import time

from .config import FIXTURES, get_settings


def _domains(cassette_set: str) -> list[str]:
    f = FIXTURES / ("seeded_domains.txt" if cassette_set == "seeded" else "domains.txt")
    return [l.strip() for l in f.read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")]


def cmd_serve(a) -> int:
    import uvicorn

    uvicorn.run("detection.api:app", host=a.host, port=a.port or get_settings().detection_port)
    return 0


def cmd_run(a) -> int:
    from .models import Fault, RunRequest, ToolError
    from .service import execute
    from . import tracing

    faults = [Fault(tool=f.split("@")[0], at_call=int(f.split("@")[1].split(":")[0]),
                    error=ToolError(code=f.split(":")[1], message="injected")) for f in a.fault]
    run, score, mock = execute(RunRequest(domain=a.domain, prompt_version=a.prompt, tool_mode=a.mode,
                                          cassette_set=a.cassette_set, faults=faults,
                                          bug_flags={"swallow_tool_errors": True} if a.swallow else None))
    for s in run.steps:
        status = f"ERROR {s.error.code}" if s.error else ("synthetic" if s.synthetic else "ok")
        print(f"  [{s.index}] {s.kind:4} {s.name:26} {status}")
    print(json.dumps(run.output, indent=2))
    print(f"violations: {score.violations or 'none'}   trace: {run.trace_id}   cost: ${run.total_cost_usd:.5f}"
          + ("   (MOCK data)" if mock else ""))
    tracing.shutdown()
    return 0


def cmd_traffic(a) -> int:
    """Production-like traffic over the recorded domains in replay mode. --decay raises the people-search
    fault rate over time (e.g. 2% -> 15%) for the risk-forecast demo."""
    from .models import Fault, RunRequest, ToolError
    from .service import execute
    from . import tracing

    domains = _domains(a.cassette_set)
    rng = random.Random(a.seed)
    interval = 60.0 / a.rate
    t0 = time.monotonic()
    n = 0
    owed = 0.0  # --decay: error diffusion over people-search calls, so each window gets its intended rate
    try:
        while a.count <= 0 or n < a.count:
            elapsed_min = (time.monotonic() - t0) / 60
            rate = a.fault_rate
            if a.decay:
                rate = min(0.02 + (0.13 * elapsed_min / a.decay_minutes), 0.30)
                owed += rate
            faults = []
            inject = (owed >= 1.0) if a.decay else (rng.random() < rate)
            if inject:
                code = rng.choice(["HTTP_429", "HTTP_429", "TIMEOUT", "HTTP_500"])
                faults.append(Fault(tool="crustdata.people_search", at_call=1, error=ToolError(code=code, message="injected")))
            domain = rng.choice(domains)
            run, score, _ = execute(RunRequest(domain=domain, prompt_version=a.prompt, tool_mode="replay",
                                               cassette_set=a.cassette_set, faults=faults, simulated=False))
            if a.decay:
                searched = any(s.name == "crustdata.people_search" for s in run.steps)
                if not searched:
                    owed -= rate  # no people search (company not confirmed): this run isn't in the denominator
                elif inject:
                    owed -= 1.0  # the fault actually hit a people search
            n += 1
            print(f"{n:4} {domain:28} fault_rate={rate:.0%} faults={len(faults)} violations={score.violations or '-'}", flush=True)
            time.sleep(max(0.0, interval))
    except KeyboardInterrupt:
        pass
    tracing.shutdown()
    return 0


def cmd_forecast(a) -> int:
    from .forecast import forecasts

    for r in forecasts():
        print(f"{r.likelihood:8} {r.subject:26} now {r.current:.0%} -> {r.threshold:.0%} in ~{r.eta_minutes} min  [{r.outcome}]  {r.evidence}")
    return 0


def cmd_record(a) -> int:
    """Record real Crustdata responses for the domains (spends credits). Measures credits on the first 3."""
    from .patient.agent import run_research
    from .patient.tools.crustdata import CREDITS_USED
    from .patient.tools.provider import Provider

    domains = _domains("base")[: a.limit] if a.limit else _domains("base")
    for i, d in enumerate(domains, 1):
        before = CREDITS_USED[0]
        run = run_research(d, a.prompt_version, provider=Provider("record", "base"), simulated=True)
        tools = [s for s in run.steps if s.kind == "tool"]
        errs = [f"{s.name}:{s.error.code}" for s in tools if s.error]
        print(f"{i:3} {d:28} tool calls={len(tools)} credits={CREDITS_USED[0] - before:.2f} "
              f"errors={errs or '-'}", flush=True)
        if i == 3 and len(domains) > 3:
            projected = CREDITS_USED[0] / 3 * len(domains)
            print(f"    projected for {len(domains)} domains: {projected:.1f} credits", flush=True)
            if projected > a.max_credits:
                print(f"    stopping: projection exceeds --max-credits {a.max_credits}", flush=True)
                return 1
    print(f"total credits used: {CREDITS_USED[0]:.2f}")
    return 0


def cmd_seed(a) -> int:
    from .seed import write_seeded

    n = write_seeded()
    print(f"wrote {n} SEEDED cassettes (fictional companies) to fixtures/cassettes/seeded/")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="detection")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("serve", help="Detection API (default :5050)")
    s.add_argument("--port", type=int)
    s.add_argument("--host", default="127.0.0.1")
    s.set_defaults(fn=cmd_serve)

    r = sub.add_parser("run", help="one patient run")
    r.add_argument("domain")
    r.add_argument("--prompt", default=None, help="prompt version, e.g. v1")
    r.add_argument("--mode", default="replay", choices=["live", "record", "replay"])
    r.add_argument("--cassette-set", default=get_settings().default_cassette_set)
    r.add_argument("--fault", action="append", default=[], help="tool@call:CODE, e.g. crustdata.people_search@1:HTTP_429")
    r.add_argument("--swallow", action="store_true", help="enable bug flag swallow_tool_errors")
    r.set_defaults(fn=cmd_run)

    t = sub.add_parser("traffic", help="production-like traffic in replay mode")
    t.add_argument("--rate", type=float, default=10, help="runs per minute")
    t.add_argument("--prompt", default=None)
    t.add_argument("--fault-rate", type=float, default=0.0)
    t.add_argument("--decay", action="store_true", help="raise the fault rate over time")
    t.add_argument("--decay-minutes", type=float, default=30)
    t.add_argument("--count", type=int, default=0, help="stop after N runs (0 = until Ctrl+C)")
    t.add_argument("--cassette-set", default=get_settings().default_cassette_set)
    t.add_argument("--seed", type=int, default=7)
    t.set_defaults(fn=cmd_traffic)

    f = sub.add_parser("forecast", help="print risk forecasts")
    f.set_defaults(fn=cmd_forecast)

    rec = sub.add_parser("record", help="record real Crustdata responses (spends credits)")
    rec.add_argument("--limit", type=int, default=0)
    rec.add_argument("--prompt-version", default="v1",
                     help="v3 (no company check) also records the calls a wrong-company run makes")
    rec.add_argument("--max-credits", type=float, default=40.0, help="stop if the first 3 domains project above this")
    rec.set_defaults(fn=cmd_record)

    sd = sub.add_parser("seed-fixtures", help="write the SEEDED (fictional) cassette set")
    sd.set_defaults(fn=cmd_seed)

    a = p.parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
