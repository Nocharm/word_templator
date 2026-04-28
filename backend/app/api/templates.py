"""Templates 라우터 — 빌트인 + 사용자 커스텀 CRUD."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.db.models import Template, User
from app.domain.style_spec import StyleSpec

router = APIRouter(prefix="/templates", tags=["templates"])


class TemplateOut(BaseModel):
    id: str
    name: str
    is_builtin: bool
    spec: dict


class TemplateCreate(BaseModel):
    name: str
    spec: dict


class TemplateUpdate(BaseModel):
    name: str | None = None
    spec: dict | None = None


def _validate_spec(spec: dict) -> None:
    """StyleSpec 검증 — pydantic ValidationError 를 FastAPI 422 로 변환."""
    try:
        StyleSpec.model_validate(spec)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors()) from e


def _serialize(t: Template) -> TemplateOut:
    return TemplateOut(id=str(t.id), name=t.name, is_builtin=t.is_builtin, spec=t.spec)


def _get_writable(db: Session, user: User, tmpl_id: str) -> Template:
    try:
        tid = uuid.UUID(tmpl_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail="template not found") from e
    tmpl = db.query(Template).filter_by(id=tid).one_or_none()
    if tmpl is None:
        raise HTTPException(status_code=404, detail="template not found")
    if tmpl.is_builtin:
        raise HTTPException(status_code=403, detail="builtin templates are read-only")
    if tmpl.owner_id != user.id:
        raise HTTPException(status_code=403, detail="not your template")
    return tmpl


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
    return [_serialize(r) for r in rows]


@router.post("", status_code=201, response_model=TemplateOut)
def post_template(
    body: TemplateCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TemplateOut:
    _validate_spec(body.spec)
    tmpl = Template(owner_id=user.id, name=body.name, is_builtin=False, spec=body.spec)
    db.add(tmpl)
    db.commit()
    db.refresh(tmpl)
    return _serialize(tmpl)


@router.patch("/{tmpl_id}", response_model=TemplateOut)
def patch_template(
    tmpl_id: str,
    body: TemplateUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TemplateOut:
    tmpl = _get_writable(db, user, tmpl_id)
    if body.name is not None:
        tmpl.name = body.name
    if body.spec is not None:
        _validate_spec(body.spec)
        tmpl.spec = body.spec
    db.commit()
    db.refresh(tmpl)
    return _serialize(tmpl)


@router.delete("/{tmpl_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    tmpl_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    tmpl = _get_writable(db, user, tmpl_id)
    db.delete(tmpl)
    db.commit()
