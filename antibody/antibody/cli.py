"""antibody watch | handle | demo | gate | backtest | costs | evidence | serve | stub-serve | approve | neatlogs-setup"""

import argparse
import json
import logging
import sys
from pathlib import Path

from .config import get_settings


def _setup_logging(verbose: bool) -> None:
    logging.basicConfig(level=logging.INFO if verbose else logging.WARNING,
                        format="%(levelname)s %(name)s: %(message)s")


def cmd_handle(a) -> int:
    from . import tracing
    from .models import Incident
    from .pipeline import Pipeline

    tracing.init()
    data = json.loads(Path(a.file).read_text(encoding="utf-8"))
    inc = Incident.model_validate(data)
    print(f"incident {inc.id} ({inc.detection})")
    out = Pipeline(ship_mock=a.ship_mock).handle(inc, force=a.force)
    print(f"status: {out.status}")
    tracing.shutdown()
    return 0


def cmd_serve(a) -> int:
    import uvicorn

    port = a.port or get_settings().antibody_api_port
    uvicorn.run("antibody.api:app", host=a.host, port=port)
    return 0


def cmd_stub_serve(a) -> int:
    import uvicorn

    uvicorn.run("antibody.stub_service:app", host="127.0.0.1", port=a.port, log_level="warning")
    return 0


def cmd_watch(a) -> int:
    from . import intake, tracing

    tracing.init()
    return intake.watch(once=a.once, handle=not a.no_handle)


def cmd_gate(a) -> int:
    from .gate import run_gate

    print(f"gate: replaying immunity families against {a.head}")
    report, mock = run_gate(a.head)
    print(f"verdict: {report.verdict.upper()}" + (" (MOCK)" if mock else ""))
    return 1 if report.verdict == "blocked" else 0


def cmd_backtest(a) -> int:
    from .gate import backtest

    s = backtest(clean_refs=a.clean)
    print(f"caught {s['caught']}/{s['families']} causing commits; false alarms {s['false_alarms']}/{s['clean_checks']} clean parents")
    return 0


def cmd_neatlogs_setup(a) -> int:
    """Create the tw_* detections in neatlogs (idempotent), so intake reads neatlogs alerts."""
    from . import neatlogs_mcp

    names = [d for d in get_settings().detection_list if d.startswith("tw_")]
    print(f"neatlogs: ensuring detections {', '.join(names)}")
    neatlogs_mcp.ensure_detections(names)
    return 0


def cmd_costs(a) -> int:
    from .costs import report

    r = report()
    for row in r["rows"]:
        nl = "n/a" if row["neatlogs_cost_usd"] is None else f"${row['neatlogs_cost_usd']:.4f}"
        print(f"  {row['incident_id']}: ledger ${row['ledger_cost_usd']:.4f}, neatlogs {nl}, "
              f"{row['duration_ms'] / 1000:.0f} s{' (MOCK)' if row['mock'] else ''}")
    print(f"real incidents: {r['real_incidents']}; avg ledger cost: {r['avg_ledger_cost_usd_real']}; "
          f"avg neatlogs cost: {r['avg_neatlogs_cost_usd_real']}")
    return 0


def cmd_demo(a) -> int:
    from . import tracing
    from .demo import run

    tracing.init()
    try:
        return run(a.file, ship_mock=a.ship_mock, pause=a.pause)
    finally:
        tracing.shutdown()


def cmd_evidence(a) -> int:
    from .costs import report
    from .evidence import write

    report()  # refresh cost numbers first
    print(f"wrote {write()}")
    return 0


def cmd_approve(a) -> int:
    from .pipeline import ApprovalError, approve
    from .state import StateStore

    try:
        res = approve(StateStore(), a.incident, a.fix, a.phrase, "typed")
    except ApprovalError as e:
        print(f"error: {e}")
        return 1
    print(f"approved {a.fix}; merged={res.merged} pr={res.pr_url}")
    if res.merged:
        from .aftercare import after_merge

        print("pulling main, gating it and refreshing the backtest...")
        after_merge(a.incident)
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="antibody")
    p.add_argument("-v", "--verbose", action="store_true")
    sub = p.add_subparsers(dest="cmd", required=True)

    h = sub.add_parser("handle", help="run the pipeline for one incident file")
    h.add_argument("--file", required=True)
    h.add_argument("--force", action="store_true", help="rerun stages whose output exists")
    h.add_argument("--ship-mock", action="store_true", help="push and open a PR even if stubs were used")
    h.set_defaults(fn=cmd_handle)

    s = sub.add_parser("serve", help="Operator API")
    s.add_argument("--port", type=int)
    s.add_argument("--host", default="127.0.0.1")
    s.set_defaults(fn=cmd_serve)

    ss = sub.add_parser("stub-serve", help="serve the stub patient + scorer (MOCK)")
    ss.add_argument("--port", type=int, default=5099)
    ss.set_defaults(fn=cmd_stub_serve)

    w = sub.add_parser("watch", help="poll neatlogs every 60 s and open incidents")
    w.add_argument("--once", action="store_true")
    w.add_argument("--no-handle", action="store_true", help="only open incidents, don't run the pipeline")
    w.set_defaults(fn=cmd_watch)

    g = sub.add_parser("gate", help="replay immunity families against a branch")
    g.add_argument("--head", required=True)
    g.set_defaults(fn=cmd_gate)

    b = sub.add_parser("backtest", help="gate each family against the commit that caused it, and its parent")
    b.add_argument("--clean", nargs="*", default=[], help="known-good commits to count false alarms on")
    b.set_defaults(fn=cmd_backtest)

    ns = sub.add_parser("neatlogs-setup", help="create the tw_* detections in neatlogs (idempotent)")
    ns.set_defaults(fn=cmd_neatlogs_setup)
    c = sub.add_parser("costs", help="cost per incident (ledger and neatlogs), for the business plan")
    c.set_defaults(fn=cmd_costs)

    d = sub.add_parser("demo", help="run one incident end to end with narrated output (for the video)")
    d.add_argument("--file", default="fixtures/incidents/sample.json")
    d.add_argument("--ship-mock", action="store_true")
    d.add_argument("--pause", type=float, default=0.6, help="seconds between stages, for readability")
    d.set_defaults(fn=cmd_demo)

    e = sub.add_parser("evidence", help="export labelled proof (incidents, PRs, gate, backtest, costs) as JSON")
    e.set_defaults(fn=cmd_evidence)

    ap = sub.add_parser("approve", help="approve a fix with the exact phrase")
    ap.add_argument("incident")
    ap.add_argument("--fix", required=True)
    ap.add_argument("--phrase", required=True)
    ap.set_defaults(fn=cmd_approve)

    a = p.parse_args(argv)
    _setup_logging(a.verbose)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
