"""Settings from the environment / detection/.env. Model IDs only from env."""

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel

PROJECT_DIR = Path(__file__).resolve().parent.parent  # the detection/ project folder
FIXTURES = PROJECT_DIR / "fixtures"
PROMPTS_DIR = Path(__file__).resolve().parent / "patient" / "prompts"

load_dotenv(PROJECT_DIR / ".env", override=False)


def _use_certifi() -> None:
    """Verify TLS with certifi's CA bundle instead of the Windows trust store. httpx2 (inside the
    openai SDK) otherwise uses truststore, whose Windows chain check (CertGetCertificateChain) can block
    for minutes fetching revocation data, which hung API calls made from server worker threads."""
    try:
        import certifi

        os.environ.setdefault("SSL_CERT_FILE", certifi.where())
    except ImportError:
        pass


_use_certifi()


def _flag(name: str, default: str = "0") -> bool:
    return os.environ.get(name, default).strip().lower() in ("1", "true", "yes", "on")


class Settings(BaseModel):
    llm_provider: str = "groq"  # groq | deepseek (both OpenAI-compatible)
    groq_api_key: str = ""
    groq_base_url: str = "https://api.groq.com/openai/v1"
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    model_cheap: str = ""
    price_in_per_mtok: float = 0.0
    price_out_per_mtok: float = 0.0
    crustdata_api_key: str = ""
    crustdata_base_url: str = "https://api.crustdata.com"
    crustdata_api_version: str = "2025-11-01"
    crustdata_mode: str = "replay"
    default_cassette_set: str = "base"
    bug_swallow_tool_errors: bool = False
    patient_prompt_version: str = "v1"
    detection_port: int = 5050
    neatlogs_api_key: str = ""
    state_dir: Path = PROJECT_DIR / ".state"
    cors_origins: str = "http://localhost:3000"

    @property
    def llm_key_and_url(self) -> tuple[str, str]:
        if self.llm_provider == "deepseek":
            return self.deepseek_api_key, self.deepseek_base_url
        return self.groq_api_key, self.groq_base_url

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    e = os.environ.get
    return Settings(
        llm_provider=e("LLM_PROVIDER", "groq").strip().lower(),
        groq_api_key=e("GROQ_API_KEY", ""),
        groq_base_url=e("GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
        deepseek_api_key=e("DEEPSEEK_API_KEY", ""),
        deepseek_base_url=e("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
        model_cheap=e("MODEL_CHEAP", ""),
        price_in_per_mtok=float(e("PRICE_CHEAP_IN_PER_MTOK", "0") or 0),
        price_out_per_mtok=float(e("PRICE_CHEAP_OUT_PER_MTOK", "0") or 0),
        crustdata_api_key=e("CRUSTDATA_API_KEY", ""),
        crustdata_base_url=e("CRUSTDATA_BASE_URL", "") or "https://api.crustdata.com",
        crustdata_api_version=e("CRUSTDATA_API_VERSION", "2025-11-01"),
        crustdata_mode=e("CRUSTDATA_MODE", "replay"),
        default_cassette_set=e("CASSETTE_SET", "base"),
        bug_swallow_tool_errors=_flag("BUG_SWALLOW_TOOL_ERRORS"),
        patient_prompt_version=e("PATIENT_PROMPT_VERSION", "v1"),
        detection_port=int(e("DETECTION_PORT", "5050")),
        neatlogs_api_key=e("NEATLOGS_API_KEY", ""),
        state_dir=Path(e("DETECTION_STATE_DIR", str(PROJECT_DIR / ".state"))),
        cors_origins=e("CORS_ORIGINS", "http://localhost:3000"),
    )
