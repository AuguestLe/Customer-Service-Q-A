from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[1] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    chat_mode: Literal["deepseek", "mock"] = "deepseek"
    deepseek_api_key: SecretStr = SecretStr("")
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = Field(default="deepseek-flash", min_length=1, max_length=100)
    deepseek_reasoning_effort: Literal["none", "low", "high", "max"] = "none"
    max_output_tokens: int = Field(default=2048, ge=128, le=4096)
    upstream_timeout_seconds: float = Field(default=90, ge=1, le=180)

    @field_validator("deepseek_base_url")
    @classmethod
    def validate_base_url(cls, value: str) -> str:
        from urllib.parse import urlsplit

        parts = urlsplit(value)
        if parts.scheme != "https" and not (
            parts.scheme == "http" and parts.hostname in {"localhost", "127.0.0.1", "::1"}
        ):
            raise ValueError("Model API must use HTTPS, except for localhost development")
        if not parts.hostname or parts.username or parts.password or parts.query or parts.fragment:
            raise ValueError(
                "Model API base URL must not contain credentials, queries or fragments"
            )
        return value.rstrip("/")

    @property
    def configured(self) -> bool:
        return self.chat_mode == "mock" or bool(self.deepseek_api_key.get_secret_value().strip())
