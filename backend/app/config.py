from __future__ import annotations

from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str       = "postgresql+asyncpg://satellier:satellier@localhost:5432/satellier"
    redis_url:    str       = "redis://localhost:6379"
    cors_origins: List[str] = ["http://localhost:3000", "http://localhost:5173"]
    secret_key:   str       = "change-this-in-production"
    debug:        bool      = False

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )


settings = Settings()
