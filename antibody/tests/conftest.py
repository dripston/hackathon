import pytest

from antibody import config


@pytest.fixture(autouse=True)
def stub_env(tmp_path, monkeypatch):
    """Every test: stubs on, no LLM, no neatlogs, state in a temp dir. Never touches the network."""
    monkeypatch.setenv("USE_STUBS", "1")
    monkeypatch.setenv("LLM_PROVIDER", "stub")
    monkeypatch.setenv("NEATLOGS_API_KEY", "")
    monkeypatch.setenv("ANTIBODY_STATE_DIR", str(tmp_path / "state"))
    config.get_settings.cache_clear()
    yield
    config.get_settings.cache_clear()
