"""Pydantic Settings: .env 로드 + 검증된 단일 출처."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = Field(..., alias="DATABASE_URL")
    jwt_secret: str = Field(..., alias="JWT_SECRET")
    jwt_algorithm: str = Field("HS256", alias="JWT_ALGORITHM")
    jwt_expires_hours: int = Field(72, alias="JWT_EXPIRES_HOURS")
    data_dir: str = Field("/data", alias="DATA_DIR")
    file_retention_days: int = Field(30, alias="FILE_RETENTION_DAYS")
    cors_origins: str = Field("http://localhost:3000", alias="CORS_ORIGINS")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    # pydantic-settings populates required fields from env/dotenv at construction time
    return Settings()  # type: ignore[call-arg]
