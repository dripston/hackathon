"""Gateway configuration; shared secrets remain in the repository-root .env."""
from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env", override=False)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="GATEWAY_", extra="ignore")

    antibody_url: str = "http://127.0.0.1:4000"
    detection_url: str = "http://127.0.0.1:5050"
    voice_url: str = "http://127.0.0.1:8001"
    autostart: bool = True
    watcher_enabled: bool = True
    check_interval: float = Field(default=5, ge=1)
    startup_timeout: float = Field(default=120, ge=1)
    request_timeout: float = Field(default=120, ge=1)
    max_body_bytes: int = Field(default=2_000_000, ge=1)
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    @field_validator("antibody_url", "detection_url", "voice_url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        from urllib.parse import urlsplit
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
            raise ValueError("Module URL must be an HTTP(S) origin without credentials, path or query")
        return value.rstrip("/")

    @property
    def modules(self) -> dict[str, str]:
        return {"detection": self.detection_url, "antibody": self.antibody_url, "voice": self.voice_url}
