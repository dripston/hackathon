"""Settings from environment / antibody/.env. Model IDs come only from env."""

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

ANTIBODY_DIR = Path(__file__).resolve().parent.parent  # the antibody/ project folder
REPO_ROOT = ANTIBODY_DIR.parent

# Export antibody/.env to the process environment too: boto3 reads AWS_* (including
# AWS_BEARER_TOKEN_BEDROCK) only from os.environ, not from pydantic settings. Never overrides real env.
load_dotenv(ANTIBODY_DIR / ".env", override=False)


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


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ANTIBODY_DIR / ".env", extra="ignore")

    neatlogs_api_key: str = ""
    neatlogs_mcp_url: str = "https://ingest.neatlogs.com/mcp"
    neatlogs_trace_url: str = ""  # e.g. a dashboard URL with {trace_id}; empty = show bare ids

    llm_provider: str = "bedrock"  # bedrock | anthropic | groq | deepseek | stub
    groq_api_key: str = ""
    groq_base_url: str = "https://api.groq.com/openai/v1"
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    aws_region: str = "us-east-1"
    anthropic_api_key: str = ""
    model_cheap: str = ""
    model_strong: str = ""
    # USD per million tokens, for the cost cap and cost per incident. Set from your provider's price page.
    price_cheap_in_per_mtok: float = 0.0
    price_cheap_out_per_mtok: float = 0.0
    price_strong_in_per_mtok: float = 0.0
    price_strong_out_per_mtok: float = 0.0

    patient_url: str = "http://localhost:5050"
    scorer_url: str = "http://localhost:5050"
    use_stubs: bool = True
    cassette_set: str = "base"  # detection's recording set: base (real Crustdata) or seeded (fictional)

    github_repo: str = ""  # OWNER/REPO
    antibody_api_port: int = 4000
    antibody_state_dir: str = ".state"
    antibody_cost_cap_usd: float = 1.50
    cors_origins: str = "http://localhost:3000"

    # Where the patient's prompt and tool code live (detection teammate's folder).
    patient_prompt_dir: str = "detection/detection/patient/prompts"
    patient_tool_files: str = "detection/detection/patient/agent.py,detection/detection/patient/tools/provider.py,detection/detection/patient/tools/crustdata.py"
    detections: str = "tw_invented_person,tw_empty_after_error,tw_company_match_skipped,tw_claimed_success_on_failure,jev_grounded_low"

    @property
    def state_path(self) -> Path:
        p = Path(self.antibody_state_dir)
        return p if p.is_absolute() else ANTIBODY_DIR / p

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def detection_list(self) -> list[str]:
        return [d.strip() for d in self.detections.split(",") if d.strip()]

    @property
    def tool_file_list(self) -> list[str]:
        return [f.strip() for f in self.patient_tool_files.split(",") if f.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
