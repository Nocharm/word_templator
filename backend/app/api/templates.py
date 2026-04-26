"""Templates 라우터 (Phase 1: 목록만)."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.db.models import Template, User

router = APIRouter(prefix="/templates", tags=["templates"])


class TemplateOut(BaseModel):
    id: str
    name: str
    is_builtin: bool
    spec: dict


@router.get("", response_model=list[TemplateOut])
def get_templates(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[TemplateOut]:
    rows = (
        db.query(Template)
        .filter((Template.is_builtin == True) | (Template.owner_id == user.id))  # noqa: E712
        .order_by(Template.is_builtin.desc(), Template.created_at.asc())
        .all()
    )
    return [
        TemplateOut(id=str(r.id), name=r.name, is_builtin=r.is_builtin, spec=r.spec) for r in rows
    ]
