"""FastAPI 앱 진입점."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.feedback import router as feedback_router
from app.api.images import router as images_router
from app.api.jobs import router as jobs_router
from app.api.templates import router as templates_router
from app.db.models import User
from app.db.seed import (
    DEMO_USER_EMAIL,
    seed_builtin_templates,
    seed_demo_accounts,
    seed_demo_job,
)
from app.db.session import SessionLocal
from app.settings import get_settings

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    db = SessionLocal()
    try:
        seed_builtin_templates(db)
        seed_demo_accounts(db)
        demo_user = db.query(User).filter_by(email=DEMO_USER_EMAIL).one_or_none()
        if demo_user is not None:
            seed_demo_job(db, demo_user.id)
    finally:
        db.close()
    yield


app = FastAPI(title="Word Templator API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth_router)
app.include_router(jobs_router)
app.include_router(images_router)
app.include_router(templates_router)
app.include_router(feedback_router)


@app.get("/health")
def get_health() -> dict[str, str]:
    return {"status": "ok"}
