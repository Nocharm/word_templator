"""모델 레지스트리 — Alembic autogenerate가 발견할 수 있도록 모두 import."""

from app.db.models.feedback import Feedback
from app.db.models.job import Job
from app.db.models.template import Template
from app.db.models.user import User

__all__ = ["Feedback", "Job", "Template", "User"]
