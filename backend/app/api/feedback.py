"""피드백 라우터 — 사용자 제출/조회 + 관리자 관리."""

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_current_user, get_db
from app.db.models import Feedback, User

router = APIRouter(tags=["feedback"])

CATEGORIES = ("bug", "feature", "other")
STATUSES = ("open", "in_progress", "closed")


class FeedbackCreate(BaseModel):
    category: Literal["bug", "feature", "other"]
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1, max_length=5000)


class FeedbackOut(BaseModel):
    id: str
    user_id: str
    user_email: str | None = None
    category: str
    title: str
    body: str
    status: str
    admin_note: str | None
    created_at: datetime
    updated_at: datetime


class AdminFeedbackUpdate(BaseModel):
    status: Literal["open", "in_progress", "closed"] | None = None
    admin_note: str | None = Field(default=None, max_length=5000)


def _to_out(fb: Feedback, *, include_email: bool = False) -> FeedbackOut:
    return FeedbackOut(
        id=str(fb.id),
        user_id=str(fb.user_id),
        user_email=fb.user.email if include_email and getattr(fb, "user", None) else None,
        category=fb.category,
        title=fb.title,
        body=fb.body,
        status=fb.status,
        admin_note=fb.admin_note,
        created_at=fb.created_at,
        updated_at=fb.updated_at,
    )


# ── User endpoints ────────────────────────────────────────────────────────


@router.post("/feedback", status_code=201, response_model=FeedbackOut)
def post_feedback(
    body: FeedbackCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FeedbackOut:
    fb = Feedback(
        user_id=user.id,
        category=body.category,
        title=body.title,
        body=body.body,
    )
    db.add(fb)
    db.commit()
    db.refresh(fb)
    return _to_out(fb)


@router.get("/feedback/me", response_model=list[FeedbackOut])
def get_my_feedback(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[FeedbackOut]:
    rows = (
        db.query(Feedback)
        .filter_by(user_id=user.id)
        .order_by(Feedback.created_at.desc())
        .all()
    )
    return [_to_out(fb) for fb in rows]


# ── Admin endpoints ───────────────────────────────────────────────────────


@router.get("/admin/feedback", response_model=list[FeedbackOut])
def get_admin_feedback_list(
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
    status: str | None = Query(default=None),
    category: str | None = Query(default=None),
) -> list[FeedbackOut]:
    if status is not None and status not in STATUSES:
        raise HTTPException(status_code=400, detail="invalid status filter")
    if category is not None and category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="invalid category filter")
    q = db.query(Feedback)
    if status is not None:
        q = q.filter(Feedback.status == status)
    if category is not None:
        q = q.filter(Feedback.category == category)
    rows = q.order_by(Feedback.created_at.desc()).all()
    # 관리자 화면용 — 작성자 이메일 노출.
    user_ids = {fb.user_id for fb in rows}
    users = {u.id: u.email for u in db.query(User).filter(User.id.in_(user_ids)).all()}
    out: list[FeedbackOut] = []
    for fb in rows:
        item = _to_out(fb)
        item.user_email = users.get(fb.user_id)
        out.append(item)
    return out


@router.patch("/admin/feedback/{feedback_id}", response_model=FeedbackOut)
def patch_admin_feedback(
    feedback_id: str,
    body: AdminFeedbackUpdate,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> FeedbackOut:
    try:
        fid = uuid.UUID(feedback_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="not found") from None
    fb = db.query(Feedback).filter_by(id=fid).one_or_none()
    if fb is None:
        raise HTTPException(status_code=404, detail="not found")
    if body.status is not None:
        fb.status = body.status
    if body.admin_note is not None:
        fb.admin_note = body.admin_note
    db.commit()
    db.refresh(fb)
    out = _to_out(fb)
    owner = db.query(User).filter_by(id=fb.user_id).one_or_none()
    if owner is not None:
        out.user_email = owner.email
    return out
