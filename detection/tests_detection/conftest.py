import pytest


@pytest.fixture(autouse=True)
def no_network_jev(monkeypatch):
    """Tests never call TypeSafe: the Jev check is reported as not configured."""
    monkeypatch.setenv("JEV_ENABLED", "0")
