"""Job 모델 — 변환 작업 메타 + 편집된 outline."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import GUID, JSONPortable


def _default_expires_at() -> datetime:
    return datetime.now(tz=UTC) + timedelta(days=30)


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("users.id"), nullable=False
    )
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="parsed")
    source_path: Mapped[str] = mapped_column(String(500), nullable=False)
    result_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    applied_template_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("templates.id"), nullable=True
    )
    style_overrides: Mapped[dict] = mapped_column(JSONPortable(), nullable=False, default=dict)
    outline_json: Mapped[dict] = mapped_column(JSONPortable(), nullable=False)
    # 업로드 시 1회 기록되는 원본 outline 스냅샷 — preview diff 의 좌측 ("before") 용
    original_outline_json: Mapped[dict | None] = mapped_column(JSONPortable(), nullable=True)
    error_message: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_default_expires_at
    )
