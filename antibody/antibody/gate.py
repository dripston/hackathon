"""The pre-deploy gate: replay every saved immunity family against a branch and predict which past
incidents it would re-open. Replay only; never calls Crustdata live.

Also the backtest: run each family against the commit that caused its incident (should block) and
against that commit's parent (should pass), to report detection and false-alarm rates.
"""

import json
import logging
from pathlib import Path

from . import apply, git_tools, grade, replay
from .config import REPO_ROOT
from .models import GateFamily, GateReport, Scenario
from .patient_client import PatientClient
from .scorer_client import ScorerClient
from .state import StateStore, now_iso

log = logging.getLogger("antibody.gate")

IMMUNITY = REPO_ROOT / "antibody" / "fixtures" / "immunity"


def load_families(directory: Path = IMMUNITY, ref: str | None = None) -> list[dict]:
    """Immunity families in the working tree, plus any that git ref `ref` adds (a branch under review
    can bring its own family, e.g. an Antibody fix branch)."""
    fams = {}
    if directory.exists():
        for p in sorted(directory.glob("*.json")):
            fam = json.loads(p.read_text(encoding="utf-8"))
            fams[fam["incident_id"]] = fam
    if ref:
        rel = directory.relative_to(REPO_ROOT).as_posix()
        names = git_tools.git("ls-tree", "--name-only", ref, f"{rel}/", check=False).splitlines()
        for name in names:
            if name.endswith(".json"):
                text = git_tools.show_file(ref, name)
                if text:
                    fam = json.loads(text)
                    fams.setdefault(fam["incident_id"], fam)
    return [fams[k] for k in sorted(fams)]


def check_family(fam: dict, ref: str, budget: replay.Budget | None = None) -> tuple[GateFamily | None, bool]:
    """Replay one family against git ref `ref`. Returns (result or None if not applicable, is_mock)."""
    scenarios = [Scenario.model_validate(s) for s in fam["scenarios"]]
    flags = fam.get("bug_flags") or None
    iid = fam["incident_id"]
    if git_tools.show_file(ref, fam["target_file"]) is None:
        return None, False  # the file didn't exist at that ref: the family doesn't apply
    if fam["fix_kind"] == "tool_wrapper_patch":
        stub = PatientClient().is_stub
        safe_ref = ref.replace("/", "_").replace("~", "_").replace("^", "_")
        wt = apply.checkout(ref, f"gate-{iid}-{safe_ref}"[:120])
        try:
            with apply.patient_service(wt, stub=stub) as url:
                result, mock = replay.run_family(iid, scenarios, ref, prompt_version=fam.get("prompt_version"),
                                                 bug_flags=flags, budget=budget,
                                                 patient=PatientClient(url, force_http=True),
                                                 scorer=ScorerClient(url, force_http=True))
        finally:
            apply.remove(wt, None)
    else:
        content = git_tools.show_file(ref, fam["target_file"])
        if content is None:
            return None, False
        result, mock = replay.run_family(iid, scenarios, ref, prompt_override=content, bug_flags=flags, budget=budget)
    reopens = result.must_fix_passed < result.must_fix_total
    broke = result.must_not_change_passed < result.must_not_change_total
    if reopens:
        msg = f"re-opens {iid}: must_fix {result.must_fix_passed}/{result.must_fix_total}"
    elif broke:
        msg = f"breaks healthy cases of {iid}: must_not_change {result.must_not_change_passed}/{result.must_not_change_total}"
    else:
        msg = f"ok {iid}: {grade.line(result)}"
    return GateFamily(incident_id=iid, must_fix_passed=result.must_fix_passed, must_fix_total=result.must_fix_total,
                      reopens=reopens or broke, must_not_change_passed=result.must_not_change_passed,
                      must_not_change_total=result.must_not_change_total, message=msg), mock


def run_gate(head: str, store: StateStore | None = None, echo=print) -> tuple[GateReport, bool]:
    store = store or StateStore()
    families = load_families(ref=head)
    out: list[GateFamily] = []
    any_mock = False
    for fam in families:
        res, mock = check_family(fam, head)
        any_mock = any_mock or mock or fam.get("mock", False)
        if res is None:
            echo(f"  n/a  {fam['incident_id']}: {fam['target_file']} not on {head}")
            continue
        echo(f"  {'FAIL' if res.reopens else 'pass'} {res.message}")
        out.append(res)
    report = GateReport(branch=head, verdict="blocked" if any(f.reopens for f in out) else "safe",
                        families=out, created_at=now_iso())
    store.write_gate(report)
    meta = store.root / "gate" / "meta.json"
    meta.write_text(json.dumps({"mock": any_mock}), encoding="utf-8")
    return report, any_mock


def backtest(store: StateStore | None = None, echo=print, clean_refs: list[str] | None = None) -> dict:
    """For each family: the causing commit should be blocked; its parent should pass.
    `clean_refs`: extra known-good commits; any family blocking one counts as a false alarm."""
    store = store or StateStore()
    rows = []
    for fam in load_families():
        sha = fam.get("caused_by_commit")
        if not sha:
            continue
        bad, _ = check_family(fam, sha)
        good, _ = check_family(fam, f"{sha}^")
        row = {
            "incident_id": fam["incident_id"], "commit": sha,
            "caught": bool(bad and bad.reopens), "bad": bad.message if bad else "n/a",
            "false_alarm": bool(good and good.reopens), "parent": good.message if good else "n/a (file absent before)",
            "mock": fam.get("mock", False),
        }
        parent = "n/a (file absent)" if good is None else ("FALSE ALARM" if row["false_alarm"] else "ok")
        echo(f"  {fam['incident_id']}: causing commit {'BLOCKED' if row['caught'] else 'missed'}; parent {parent}")
        rows.append(row)
    clean = []
    for ref in clean_refs or []:
        for fam in load_families():
            res, _ = check_family(fam, ref)
            if res is not None:
                clean.append({"ref": ref, "incident_id": fam["incident_id"], "false_alarm": res.reopens,
                              "message": res.message})
                echo(f"  clean {ref} vs {fam['incident_id']}: {'FALSE ALARM' if res.reopens else 'ok'}")
    caught = sum(r["caught"] for r in rows)
    parents = [r for r in rows if not r["parent"].startswith("n/a")]
    checks = [{"false_alarm": r["false_alarm"]} for r in parents] + clean
    fa = sum(c["false_alarm"] for c in checks)
    summary = {
        "families": len(rows), "caught": caught,
        "detection_rate": (caught / len(rows)) if rows else None,
        "false_alarms": fa, "clean_checks": len(checks),
        "false_alarm_rate": (fa / len(checks)) if checks else None,
        "rows": rows, "clean": clean, "created_at": now_iso(),
        "label": "SIMULATED (replay of recorded tool responses against seeded bugs)",
    }
    (store.root / "backtest.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary
