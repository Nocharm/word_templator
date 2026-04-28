"""인증 라우터 — signup, login, logout, me."""

import re

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import COOKIE_NAME, get_current_user, get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.db.models import User
from app.settings import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])
_settings = get_settings()

# NOTE: SSO insertion point — settings.auth_provider == "oidc" 분기는
# 사내 IdP 결정 후 추가. 현재는 "local" (email/pw + JWT 쿠키) 만 동작.

# 임시 — OAuth 도입 전까지만 사용. RFC strict 검증 대신 "@ + 도메인" 만 확인.
_LOOSE_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class Credentials(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=4, max_length=200)

    @field_validator("email")
    @classmethod
    def _validate_email_loose(cls, v: str) -> str:
        v = v.strip().lower()
        if not _LOOSE_EMAIL.match(v):
            raise ValueError("이메일 형식이 올바르지 않습니다 (예: name@example.com)")
        return v


class UserOut(BaseModel):
    id: str
    email: str
    role: str


@router.post("/signup", status_code=201, response_model=UserOut)
def post_signup(creds: Credentials, db: Session = Depends(get_db)) -> UserOut:
    role = "admin" if creds.email in _settings.admin_email_set else "user"
    user = User(email=creds.email, password_hash=hash_password(creds.password), role=role)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="email already registered") from None
    db.refresh(user)
    return UserOut(id=str(user.id), email=user.email, role=user.role)


@router.post("/login")
def post_login(
    creds: Credentials, response: Response, db: Session = Depends(get_db)
) -> dict[str, str]:
    user = db.query(User).filter_by(email=creds.email).one_or_none()
    if user is None or not verify_password(creds.password, user.password_hash):
        raise HTTPException(status_code=401, detail="invalid credentials")
    token = create_access_token(str(user.id))
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=False,  # dev: HTTP. prod nginx에서 HTTPS 종료, 그때 True 권장.
        samesite="lax",
        max_age=_settings.jwt_expires_hours * 3600,
    )
    return {"status": "ok"}


@router.post("/logout", status_code=204)
def post_logout(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME)


@router.get("/me", response_model=UserOut)
def get_me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut(id=str(user.id), email=user.email, role=user.role)


class PasswordChange(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=200)
    new_password: str = Field(..., min_length=4, max_length=200)


@router.patch("/password", status_code=204)
def patch_password(
    body: PasswordChange,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="current password incorrect")
    if body.current_password == body.new_password:
        raise HTTPException(status_code=400, detail="new password must differ from current")
    user.password_hash = hash_password(body.new_password)
    db.commit()
