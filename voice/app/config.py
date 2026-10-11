"""Application configuration via pydantic-settings.

All secrets come from the environment (or a local .env). Fields default to safe,
empty values so the package can be imported in tests without real credentials;
``Settings.validate_runtime()`` enforces required secrets only when the bot
actually starts.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Telegram ---
    telegram_bot_token: str = ""
    telegram_mode: str = "polling"  # "polling" | "webhook"
    telegram_webhook_url: str = ""
    telegram_webhook_secret: str = ""

    # --- Groq LLM ---
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

    # --- Sarvam AI ---
    sarvam_api_key: str = ""
    sarvam_stt_model: str = "saaras:v4"
    sarvam_stt_mode: str = "transcribe"
    sarvam_stt_language: str = "unknown"
    sarvam_tts_model: str = "bulbul:v2"
    sarvam_tts_speaker: str = "anushka"
    sarvam_tts_language: str = "en-IN"

    # --- Runtime ---
    app_env: str = "development"
    log_level: str = "INFO"
    host: str = "0.0.0.0"
    port: int = 8000

    # --- Limits ---
    request_timeout_seconds: float = 30.0
    max_voice_duration_seconds: int = 120
    max_audio_bytes: int = 20 * 1024 * 1024
    history_max_messages: int = 20
    max_tts_chars: int = 1500
    llm_max_tool_iterations: int = 4
    log_transcripts: bool = False

    # --- Antibody (the on-call system this bot is the voice of) ---
    antibody_url: str = "http://localhost:4000"
    # Telegram chat that gets called when a fix is waiting. Blank: the chat that last sent /oncall.
    oncall_chat_id: str = ""
    oncall_poll_seconds: float = 15.0
    state_dir: str = ".state"

    # Sarvam API base (overridable for tests / proxies).
    sarvam_base_url: str = "https://api.sarvam.ai"

    @property
    def is_webhook(self) -> bool:
        return self.telegram_mode.strip().lower() == "webhook"

    def validate_runtime(self) -> None:
        """Raise if required secrets are missing. Call just before serving."""
        missing: list[str] = []
        if not self.telegram_bot_token:
            missing.append("TELEGRAM_BOT_TOKEN")
        if not self.groq_api_key:
            missing.append("GROQ_API_KEY")
        if not self.sarvam_api_key:
            missing.append("SARVAM_API_KEY")
        if self.is_webhook and not self.telegram_webhook_url:
            missing.append("TELEGRAM_WEBHOOK_URL (required when TELEGRAM_MODE=webhook)")
        if missing:
            raise RuntimeError(
                "Missing required configuration: " + ", ".join(missing) +
                ". Copy .env.example to .env and fill these in."
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()
