"""FastAPI 앱 진입점."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.jobs import router as jobs_router
from app.api.templates import router as templates_router
from app.db.seed import seed_builtin_templates
from app.db.session import SessionLocal
from app.settings import get_settings

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    db = SessionLocal()
    try:
        seed_builtin_templates(db)
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
app.include_router(templates_router)


@app.get("/health")
def get_health() -> dict[str, str]:
    return {"status": "ok"}
