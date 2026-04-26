"""인증 라우터 — signup, login, logout, me."""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import COOKIE_NAME, get_current_user, get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.db.models import User
from app.settings import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])
_settings = get_settings()


class Credentials(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str


@router.post("/signup", status_code=201, response_model=UserOut)
def post_signup(creds: Credentials, db: Session = Depends(get_db)) -> UserOut:
    user = User(email=creds.email, password_hash=hash_password(creds.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="email already registered") from None
    db.refresh(user)
    return UserOut(id=str(user.id), email=user.email)


@router.post("/login")
def post_login(creds: Credentials, response: Response, db: Session = Depends(get_db)) -> dict[str, str]:
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
    return UserOut(id=str(user.id), email=user.email)
