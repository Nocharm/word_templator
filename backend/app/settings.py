"""Pydantic Settings: .env 로드 + 검증된 단일 출처."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # 다중 경로 — backend/ 에서 실행해도 루트 .env 를 찾고, Docker 컨테이너에서는
    # env_file 주입 또는 OS env 만으로도 동작 (없으면 silently skip).
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        extra="ignore",
    )

    database_url: str = Field(..., alias="DATABASE_URL")
    jwt_secret: str = Field(..., alias="JWT_SECRET")
    jwt_algorithm: str = Field("HS256", alias="JWT_ALGORITHM")
    jwt_expires_hours: int = Field(72, alias="JWT_EXPIRES_HOURS")
    data_dir: str = Field("/data", alias="DATA_DIR")
    file_retention_days: int = Field(30, alias="FILE_RETENTION_DAYS")
    cors_origins: str = Field("http://localhost:3000", alias="CORS_ORIGINS")
    max_batch_parallel: int = Field(4, alias="MAX_BATCH_PARALLEL")
    # 콤마 구분 이메일 목록 — signup 시 자동 admin 권한 부여.
    admin_emails: str = Field("", alias="ADMIN_EMAILS")
    # 인증 공급자 — "local" 만 구현. 사내 SSO/OIDC 도입 시 분기 추가.
    auth_provider: str = Field("local", alias="AUTH_PROVIDER")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def admin_email_set(self) -> set[str]:
        return {e.strip().lower() for e in self.admin_emails.split(",") if e.strip()}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    # pydantic-settings populates required fields from env/dotenv at construction time
    return Settings()  # type: ignore[call-arg]
