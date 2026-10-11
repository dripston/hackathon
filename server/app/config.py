from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[1] / ".env",
        extra="ignore", populate_by_name=True,
    )
    sarvam_api_key: SecretStr = SecretStr("")
    llm_api_key: SecretStr = Field(
        default=SecretStr(""), validation_alias=AliasChoices("LLM_API_KEY", "GROQ_API_KEY")
    )
    llm_model: str = "llama-3.3-70b-versatile"
    sarvam_stt_model: str = "saaras:v3"
    sarvam_tts_model: str = "bulbul:v3"
    sarvam_tts_voice: str = "shubh"
    sarvam_tts_language: Literal["en-IN", "hi-IN"] = "hi-IN"
    public_wss_url: str = ""
    exotel_ws_token: SecretStr = SecretStr("")
    exotel_account_sid: str = ""
    weather_request_timeout_seconds: float = Field(default=4, gt=0, le=30)
    handshake_timeout_seconds: float = Field(default=10, gt=0, le=60)
    call_idle_timeout_seconds: float = Field(default=120, gt=0)
    max_call_seconds: int = Field(default=3600, ge=1, le=3600)
    log_level: str = "INFO"

    @property
    def voice_ready(self) -> bool:
        return bool(self.sarvam_api_key.get_secret_value() and self.llm_api_key.get_secret_value())
