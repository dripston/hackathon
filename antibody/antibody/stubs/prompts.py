"""Stub copies of the patient's prompt versions (the real ones live in detection/).

They are real files under antibody/fixtures/stub_patient/prompts/ so the worktree, diff and PR
flow can be exercised end to end while detection is still being built.
"""

from ..config import ANTIBODY_DIR

STUB_PROMPT_DIR = ANTIBODY_DIR / "fixtures" / "stub_patient" / "prompts"


def load(version: str) -> str:
    path = STUB_PROMPT_DIR / f"{version}.md"
    if not path.exists():
        path = STUB_PROMPT_DIR / "v1.md"
    return path.read_text(encoding="utf-8")
