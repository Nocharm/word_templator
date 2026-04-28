# Word Templator Phase 1 (MVP — 텍스트 전용) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Authenticated 사용자가 `.docx`를 업로드 → 헤딩/본문만 파싱된 outline을 마크다운 형태로 보고 들여쓰기로 레벨 수정 → 빌트인 "기본 보고서" 템플릿을 적용해 표준화된 `.docx`를 다운로드받을 수 있는 풀스택 시스템.

**Architecture:** Docker Compose 4개 컨테이너 (Nginx / Next.js 15 / FastAPI / Postgres). Backend는 SQLAlchemy + Alembic + python-docx + lxml. Frontend는 App Router + Tailwind + TanStack Query. JWT httpOnly 쿠키 인증.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.x, Alembic, python-docx, lxml, pydantic v2, passlib(bcrypt), python-jose(JWT), pytest, ruff, uv / Next.js 15, React 19, TypeScript strict, Tailwind, react-hook-form, zod, react-markdown / Postgres 16, Nginx, Docker BuildKit.

**Spec reference:** `docs/superpowers/specs/2026-04-26-word-templator-design.md`

**Phase 1 범위 (스펙 §8 Phase 1):**
- 인증 (회원가입/로그인/로그아웃)
- DB 스키마 + 빌트인 템플릿 1개 시드 (`기본 보고서`)
- `.docx` 업로드 → 본문/헤딩만 파싱 (R3의 a+b 단계)
- Outline 에디터: 마크다운 + Tab/Shift+Tab으로 level 수정
- 빌트인 템플릿 적용 → `.docx` 다운로드
- 표/이미지/필드는 만나면 placeholder 라인 출력
- Docker Compose 통합

**Phase 1 비범위:** 사용자 커스텀 StyleSpec 폼·저장, 빌트인 템플릿 ≥2개, 표/이미지/캡션 실제 렌더, 상대 참조, 다중 파일 병합. (Phase 2~5)

---

## File Structure (Phase 1)

```
word_templator/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                       # FastAPI app, 라우터 등록, 시작 시 시드
│   │   ├── settings.py                   # Pydantic Settings (.env 로드)
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   └── security.py               # bcrypt + JWT
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── deps.py                   # get_db, get_current_user
│   │   │   ├── auth.py                   # /auth/{signup,login,logout,me}
│   │   │   ├── jobs.py                   # /jobs/* 7개
│   │   │   └── templates.py              # /templates GET (목록만)
│   │   ├── db/
│   │   │   ├── __init__.py
│   │   │   ├── base.py                   # SQLAlchemy declarative
│   │   │   ├── session.py                # 엔진 + sessionmaker
│   │   │   ├── seed.py                   # 빌트인 템플릿 시딩
│   │   │   ├── models/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── user.py
│   │   │   │   ├── template.py
│   │   │   │   └── job.py
│   │   │   └── migrations/               # Alembic
│   │   │       ├── env.py
│   │   │       ├── script.py.mako
│   │   │       └── versions/0001_initial.py
│   │   ├── domain/
│   │   │   ├── __init__.py
│   │   │   ├── outline.py                # Block, Outline (Pydantic)
│   │   │   └── style_spec.py             # StyleSpec (Pydantic)
│   │   ├── parser/
│   │   │   ├── __init__.py
│   │   │   ├── detect_heading.py         # R3 (a)+(b)
│   │   │   └── parse_docx.py             # .docx → Outline
│   │   ├── renderer/
│   │   │   ├── __init__.py
│   │   │   ├── render_docx.py            # Outline + StyleSpec → bytes
│   │   │   ├── apply_style.py            # 폰트/줄간격 (R2 한/영 폴백 포함)
│   │   │   └── inject_numbering.py       # numbering.xml 주입
│   │   ├── storage/
│   │   │   ├── __init__.py
│   │   │   └── files.py                  # /data 경로 헬퍼
│   │   └── templates_seed/
│   │       └── report.json               # "기본 보고서" StyleSpec
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── conftest.py                   # 공용 fixture (db, client, fake user)
│   │   ├── fixtures/                     # 샘플 .docx (Task 9에서 생성 스크립트 제공)
│   │   ├── test_health.py
│   │   ├── test_security.py
│   │   ├── test_db_models.py
│   │   ├── test_seed.py
│   │   ├── test_domain_models.py
│   │   ├── test_auth.py
│   │   ├── test_detect_heading.py
│   │   ├── test_parse.py
│   │   ├── test_render.py
│   │   ├── test_storage.py
│   │   └── test_api_jobs.py
│   ├── alembic.ini
│   ├── pyproject.toml                    # ruff, mypy, pytest 설정
│   ├── requirements.txt                  # 프로덕션
│   ├── requirements-dev.txt              # -r requirements.txt + dev 도구
│   └── Dockerfile                        # multi-stage, non-root, BuildKit
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx                    # 루트 (font, providers)
│   │   ├── page.tsx                      # 랜딩 + 로그인 안내 / 업로드 폼
│   │   ├── globals.css
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── signup/page.tsx
│   │   ├── dashboard/page.tsx            # 히스토리 (최소)
│   │   └── editor/[jobId]/page.tsx       # outline 에디터
│   ├── components/
│   │   ├── outline-editor/
│   │   │   ├── OutlineEditor.tsx
│   │   │   ├── ParagraphBlock.tsx
│   │   │   ├── TableBlock.tsx            # placeholder만 (Phase 3에서 채움)
│   │   │   ├── ImageBlock.tsx            # placeholder만
│   │   │   └── FieldBlock.tsx            # placeholder만
│   │   └── providers.tsx                 # TanStack Query Provider
│   ├── lib/
│   │   ├── api.ts                        # fetch wrapper (credentials: include)
│   │   ├── auth.ts                       # 서버 컴포넌트용 me() 헬퍼
│   │   └── types.ts                      # Outline, StyleSpec TS 타입
│   ├── styles/
│   │   └── design-tokens.css             # templates/design-tokens.css 복사
│   ├── public/
│   ├── eslint.config.mjs
│   ├── next.config.ts
│   ├── package.json
│   ├── postcss.config.mjs
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── Dockerfile                        # multi-stage, standalone, non-root
│
├── infra/
│   ├── docker-compose.yml                # 4 서비스: proxy, frontend, backend, db
│   └── nginx/
│       └── default.conf                  # / → frontend, /api → backend
│
├── .env.example                          # 모든 ENV 변수 + 주석
├── .gitignore                            # .env, .venv, node_modules, /data
├── CLAUDE.md                             # Project + Commands 섹션 채움
└── docs/superpowers/specs/2026-04-26-word-templator-design.md  # (이미 존재)
```

각 파일의 책임은 위 트리 우측 코멘트 참조. 한 파일 = 한 책임 원칙. 파일이 200줄 넘으면 책임 분리 신호.

---

## Tasks Overview

| # | Task | Files |
|---|---|---|
| 1 | 프로젝트 스캐폴드 + .gitignore + .env.example + CLAUDE.md 채움 | 루트 |
| 2 | Backend 부트스트랩 (FastAPI 골격, settings, /health) | `backend/app/{main,settings}.py`, `tests/test_health.py` |
| 3 | Backend Dockerfile | `backend/Dockerfile` |
| 4 | DB 레이어 (SQLAlchemy + Alembic + 모델 3개) | `backend/app/db/**` |
| 5 | 빌트인 템플릿 시드 | `backend/app/templates_seed/report.json`, `backend/app/db/seed.py` |
| 6 | 도메인 모델 (Outline + StyleSpec Pydantic) | `backend/app/domain/**` |
| 7 | 인증 (security 유틸 + auth 라우터 + deps) | `backend/app/core/security.py`, `app/api/{auth,deps}.py` |
| 8 | 헤딩 감지 (R3 a+b) | `backend/app/parser/detect_heading.py` |
| 9 | Parser (텍스트만) | `backend/app/parser/parse_docx.py` + 샘플 fixture |
| 10 | Renderer (R2 폰트 폴백 포함) | `backend/app/renderer/**` |
| 11 | Storage 경로 헬퍼 | `backend/app/storage/files.py` |
| 12 | Jobs/Templates API + 라우터 등록 | `backend/app/api/{jobs,templates}.py`, `app/main.py` |
| 13 | Frontend 스캐폴드 (Next.js + Tailwind + design tokens) | `frontend/**` 기본 |
| 14 | Frontend 인증 페이지 + API 클라이언트 | `frontend/app/(auth)/**`, `lib/{api,auth}.ts` |
| 15 | Frontend 업로드 + outline 에디터 + 다운로드 | `frontend/components/outline-editor/**`, 페이지들 |
| 16 | Frontend Dockerfile | `frontend/Dockerfile` |
| 17 | Infra: docker-compose + nginx + README 업데이트 | `infra/**`, `README.md` |
| 18 | 통합 검증 (로컬 round-trip) | (검증 단계, 코드 변경 최소) |

각 Task 완료 = 1 commit (그 안에 여러 step의 micro-commit이 있을 수 있으나 PR 단위로는 Task = 1).

---

## Task 1: 프로젝트 스캐폴드

**Files:**
- Create: `.gitignore`, `.env.example`, `backend/`, `frontend/`, `infra/nginx/`
- Modify: `CLAUDE.md` (Project + Commands 섹션)

- [ ] **Step 1: 디렉터리 생성**

```bash
mkdir -p backend/app/{api,core,db/{models,migrations/versions},domain,parser,renderer,storage,templates_seed} backend/tests/fixtures frontend/app frontend/components frontend/lib frontend/styles frontend/public infra/nginx
```

- [ ] **Step 2: `.gitignore` 작성**

`.gitignore`:
```gitignore
# Python
__pycache__/
*.pyc
.venv/
.pytest_cache/
.mypy_cache/
.ruff_cache/
*.egg-info/

# Node
node_modules/
.next/
out/
*.tsbuildinfo

# Env / secrets
.env
.env.local
.env.*.local

# Data volumes
/data/

# OS
.DS_Store
```

- [ ] **Step 3: `.env.example` 작성**

`.env.example`:
```bash
# Postgres
POSTGRES_USER=app
POSTGRES_PASSWORD=change_me
POSTGRES_DB=word_templator
DATABASE_URL=postgresql+psycopg://app:change_me@db:5432/word_templator

# Backend
JWT_SECRET=change_me_64_chars             # `openssl rand -hex 32`
JWT_ALGORITHM=HS256
JWT_EXPIRES_HOURS=72
DATA_DIR=/data
FILE_RETENTION_DAYS=30
CORS_ORIGINS=http://localhost:3000

# Frontend (NEXT_PUBLIC_* 만 클라이언트 노출)
NEXT_PUBLIC_API_BASE=http://localhost/api
```

- [ ] **Step 4: CLAUDE.md `## Project` 섹션 채움**

`CLAUDE.md` 의 `## Project` 섹션 한 줄 설명 교체:
```markdown
## Project

Word(.docx) 문서를 빌트인 템플릿(StyleSpec) 기준으로 표·문단·번호·폰트를 표준화해 다시 .docx로 출력하는 풀스택 웹 도구. 사용자 인증·히스토리·커스텀 템플릿 지원.
```

- [ ] **Step 5: CLAUDE.md `## Commands` 섹션 채움**

`CLAUDE.md` 의 `## Commands` 섹션 교체:
```bash
# Backend (cd backend)
uv pip install -r requirements-dev.txt        # deps
pytest                                        # full suite
pytest tests/test_parse.py::test_xxx -v       # single test
ruff check . && ruff format .                 # lint + format
uvicorn app.main:app --reload --port 8000     # dev server

# Frontend (cd frontend)
npm install
npm test
npm run lint
npm run dev                                   # http://localhost:3000

# Compose (전체 스택)
cp .env.example .env && $EDITOR .env          # 시크릿 채우기
docker compose -f infra/docker-compose.yml up -d
```

- [ ] **Step 6: Commit**

```bash
git add .gitignore .env.example CLAUDE.md backend/ frontend/ infra/
git commit -m "chore(scaffold): create directory layout and env template"
```

---

## Task 2: Backend 부트스트랩 (FastAPI + settings + /health)

**Files:**
- Create: `backend/requirements.txt`, `backend/requirements-dev.txt`, `backend/pyproject.toml`, `backend/app/__init__.py`, `backend/app/settings.py`, `backend/app/main.py`, `backend/tests/__init__.py`, `backend/tests/conftest.py`, `backend/tests/test_health.py`

- [ ] **Step 1: `requirements.txt` 작성**

```text
fastapi==0.115.0
uvicorn[standard]==0.32.0
pydantic==2.9.2
pydantic-settings==2.6.1
sqlalchemy==2.0.36
alembic==1.13.3
psycopg[binary]==3.2.3
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.12
python-docx==1.1.2
lxml==5.3.0
```

- [ ] **Step 2: `requirements-dev.txt` 작성**

```text
-r requirements.txt
pytest==8.3.3
pytest-asyncio==0.24.0
httpx==0.27.2
ruff==0.7.4
mypy==1.13.0
types-python-jose==3.3.4.20240106
```

- [ ] **Step 3: `pyproject.toml` 작성**

```toml
[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP", "W"]

[tool.mypy]
python_version = "3.12"
strict = true
plugins = ["pydantic.mypy"]

[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
```

- [ ] **Step 4: 의존성 설치**

```bash
cd backend && uv venv .venv && source .venv/bin/activate && uv pip install -r requirements-dev.txt
```

- [ ] **Step 5: `backend/app/settings.py` 작성**

```python
"""Pydantic Settings: .env 로드 + 검증된 단일 출처."""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = Field(..., alias="DATABASE_URL")
    jwt_secret: str = Field(..., alias="JWT_SECRET")
    jwt_algorithm: str = Field("HS256", alias="JWT_ALGORITHM")
    jwt_expires_hours: int = Field(72, alias="JWT_EXPIRES_HOURS")
    data_dir: str = Field("/data", alias="DATA_DIR")
    file_retention_days: int = Field(30, alias="FILE_RETENTION_DAYS")
    cors_origins: str = Field("http://localhost:3000", alias="CORS_ORIGINS")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
```

- [ ] **Step 6: 실패하는 헬스 테스트 작성**

`backend/tests/test_health.py`:
```python
"""GET /health 동작 검증."""

from fastapi.testclient import TestClient

from app.main import app


def test_health_returns_ok():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

`backend/tests/__init__.py` 빈 파일 생성. `backend/tests/conftest.py` 도 일단 빈 파일.

- [ ] **Step 7: 테스트 실패 확인**

```bash
cd backend && pytest tests/test_health.py -v
```
Expected: `ModuleNotFoundError: No module named 'app.main'`

- [ ] **Step 8: `backend/app/__init__.py` 빈 파일, `backend/app/main.py` 작성**

```python
"""FastAPI 앱 진입점."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.settings import get_settings

settings = get_settings()
app = FastAPI(title="Word Templator API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def get_health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 9: 테스트 통과 확인**

테스트 실행 전 `.env` 가 backend 디렉터리에 필요. 임시로 작성:

```bash
cd backend && cp ../.env.example .env
```

```bash
pytest tests/test_health.py -v
```
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add backend/
git commit -m "feat(backend): bootstrap FastAPI app with settings and /health"
```

---

## Task 3: Backend Dockerfile

**Files:**
- Create: `backend/Dockerfile`, `backend/.dockerignore`

- [ ] **Step 1: `backend/.dockerignore` 작성**

```dockerignore
.venv/
__pycache__/
*.pyc
.pytest_cache/
.mypy_cache/
.ruff_cache/
tests/
.env
*.md
```

- [ ] **Step 2: `backend/Dockerfile` 작성 (BuildKit + non-root + uv 캐시)**

```dockerfile
# syntax=docker/dockerfile:1
FROM python:3.12-slim AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    build-essential libxml2-dev libxslt1-dev

RUN pip install uv==0.5.4
WORKDIR /build
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system -r requirements.txt

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends libxml2 libxslt1.1

COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

RUN groupadd --gid 1000 app && useradd --uid 1000 --gid app --shell /bin/bash --create-home app
WORKDIR /app
COPY --chown=app:app app ./app
COPY --chown=app:app alembic.ini ./

USER app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 3: 로컬 빌드 검증**

```bash
cd backend && DOCKER_BUILDKIT=1 docker build -t word-templator-backend:test .
```
Expected: 빌드 성공, 레이어 캐시 활용 메시지.

- [ ] **Step 4: Commit**

```bash
git add backend/Dockerfile backend/.dockerignore
git commit -m "feat(backend): add multi-stage non-root Dockerfile with uv cache"
```

---

## Task 4: DB 레이어 (SQLAlchemy + Alembic + 모델 3개)

**Files:**
- Create: `backend/app/db/__init__.py`, `backend/app/db/base.py`, `backend/app/db/session.py`, `backend/app/db/models/{__init__,user,template,job}.py`, `backend/alembic.ini`, `backend/app/db/migrations/{env.py,script.py.mako}`, `backend/app/db/migrations/versions/0001_initial.py`, `backend/tests/test_db_models.py`

- [ ] **Step 1: `backend/app/db/base.py`**

```python
"""SQLAlchemy declarative base."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
```

- [ ] **Step 2: `backend/app/db/session.py`**

```python
"""DB 엔진 + sessionmaker."""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.settings import get_settings

_settings = get_settings()
engine = create_engine(_settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 3: `backend/app/db/models/user.py`**

```python
"""User 모델 — 인증 단일 출처."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 4: `backend/app/db/models/template.py`**

```python
"""Template 모델 — 빌트인 + 사용자 커스텀 StyleSpec."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Template(Base):
    __tablename__ = "templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_builtin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    spec: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 5: `backend/app/db/models/job.py`**

```python
"""Job 모델 — 변환 작업 메타 + 편집된 outline."""

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _default_expires_at() -> datetime:
    return datetime.now(tz=timezone.utc) + timedelta(days=30)


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="parsed")
    source_path: Mapped[str] = mapped_column(String(500), nullable=False)
    result_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    applied_template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("templates.id"), nullable=True
    )
    style_overrides: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    outline_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    error_message: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_default_expires_at
    )
```

- [ ] **Step 6: `backend/app/db/models/__init__.py`**

```python
"""모델 레지스트리 — Alembic autogenerate가 발견할 수 있도록 모두 import."""

from app.db.models.job import Job
from app.db.models.template import Template
from app.db.models.user import User

__all__ = ["Job", "Template", "User"]
```

- [ ] **Step 7: Alembic 초기화**

```bash
cd backend && alembic init app/db/migrations
```

`backend/alembic.ini` 의 `sqlalchemy.url =` 을 비우고, `script_location = app/db/migrations`로 설정. (동기 SQLAlchemy를 쓰므로 기본 템플릿. `-t async` 사용 ❌)

- [ ] **Step 8: `backend/app/db/migrations/env.py` 수정**

```python
"""Alembic 환경: app.settings 기반 URL + Base.metadata 자동 발견."""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.db.base import Base
from app.db.models import *  # noqa: F401,F403  -- register all models
from app.settings import get_settings

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata
config.set_main_option("sqlalchemy.url", get_settings().database_url)


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

- [ ] **Step 9: 초기 마이그레이션 생성**

로컬 Postgres가 없다면 docker로 임시:
```bash
docker run --rm -d --name pgtest -e POSTGRES_USER=app -e POSTGRES_PASSWORD=change_me -e POSTGRES_DB=word_templator -p 5432:5432 postgres:16
```

```bash
cd backend && DATABASE_URL=postgresql+psycopg://app:change_me@localhost:5432/word_templator alembic revision --autogenerate -m "initial"
```

생성된 파일을 `versions/0001_initial.py` 로 이름 변경.

- [ ] **Step 10: 마이그레이션 적용 + 모델 round-trip 테스트**

`backend/tests/test_db_models.py`:
```python
"""모델 INSERT/SELECT round-trip."""

import os
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.db.models import Job, Template, User


@pytest.fixture(scope="module")
def db_session():
    db_url = os.environ["DATABASE_URL"]
    engine = create_engine(db_url)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(engine)


def test_user_roundtrip(db_session):
    user = User(email="alice@example.com", password_hash="x")
    db_session.add(user)
    db_session.commit()
    fetched = db_session.query(User).filter_by(email="alice@example.com").one()
    assert fetched.id == user.id


def test_template_with_owner_null(db_session):
    tmpl = Template(name="builtin-test", is_builtin=True, spec={"k": "v"})
    db_session.add(tmpl)
    db_session.commit()
    assert tmpl.owner_id is None


def test_job_default_expires_at(db_session):
    user = User(email="bob@example.com", password_hash="x")
    db_session.add(user)
    db_session.commit()
    job = Job(
        user_id=user.id,
        original_filename="r.docx",
        source_path="/data/x.docx",
        outline_json={"blocks": []},
    )
    db_session.add(job)
    db_session.commit()
    assert job.expires_at is not None
```

```bash
cd backend && DATABASE_URL=postgresql+psycopg://app:change_me@localhost:5432/word_templator alembic upgrade head
DATABASE_URL=postgresql+psycopg://app:change_me@localhost:5432/test_wt pytest tests/test_db_models.py -v
```
Expected: 3 PASS

- [ ] **Step 11: Commit**

```bash
git add backend/alembic.ini backend/app/db/ backend/tests/test_db_models.py
git commit -m "feat(db): add SQLAlchemy models for users/templates/jobs with initial migration"
```

---

## Task 5: 빌트인 템플릿 시드

**Files:**
- Create: `backend/app/templates_seed/report.json`, `backend/app/db/seed.py`, `backend/tests/test_seed.py`
- Modify: `backend/app/main.py` (startup hook)

- [ ] **Step 1: `backend/app/templates_seed/report.json`**

```json
{
  "id_slug": "builtin-report",
  "name": "기본 보고서",
  "spec": {
    "fonts": {
      "body": { "korean": "맑은 고딕", "ascii": "Arial", "size_pt": 11 },
      "heading": {
        "h1": { "korean": "맑은 고딕", "ascii": "Arial", "size_pt": 16, "bold": true },
        "h2": { "korean": "맑은 고딕", "ascii": "Arial", "size_pt": 14, "bold": true },
        "h3": { "korean": "맑은 고딕", "ascii": "Arial", "size_pt": 12, "bold": true }
      }
    },
    "paragraph": {
      "line_spacing": 1.5,
      "alignment": "justify",
      "first_line_indent_pt": 0
    },
    "numbering": {
      "h1": "1.",
      "h2": "1.1.",
      "h3": "1.1.1.",
      "list": "decimal"
    },
    "table": {
      "border_color": "#000000",
      "border_width_pt": 0.5,
      "header_bg": "#D9D9D9",
      "header_bold": true,
      "cell_font_size_pt": 10
    },
    "page": {
      "margin_top_mm": 25, "margin_bottom_mm": 25,
      "margin_left_mm": 25, "margin_right_mm": 25
    }
  }
}
```

- [ ] **Step 2: 실패하는 시드 테스트 작성**

`backend/tests/test_seed.py`:
```python
"""빌트인 템플릿 시드는 한 번만 실행되며 기존 행을 덮어쓰지 않는다."""

import os

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.db.models import Template
from app.db.seed import seed_builtin_templates


@pytest.fixture
def db_session():
    db_url = os.environ["DATABASE_URL"]
    engine = create_engine(db_url)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(engine)


def test_seed_inserts_builtin_report(db_session):
    seed_builtin_templates(db_session)
    rows = db_session.query(Template).filter_by(is_builtin=True).all()
    assert len(rows) == 1
    assert rows[0].name == "기본 보고서"
    assert rows[0].owner_id is None
    assert "fonts" in rows[0].spec


def test_seed_is_idempotent(db_session):
    seed_builtin_templates(db_session)
    seed_builtin_templates(db_session)
    rows = db_session.query(Template).filter_by(is_builtin=True).all()
    assert len(rows) == 1
```

- [ ] **Step 3: 테스트 실패 확인**

```bash
cd backend && DATABASE_URL=postgresql+psycopg://app:change_me@localhost:5432/test_wt pytest tests/test_seed.py -v
```
Expected: `ImportError: cannot import name 'seed_builtin_templates'`

- [ ] **Step 4: `backend/app/db/seed.py`**

```python
"""빌트인 StyleSpec 시드 — idempotent."""

import json
from pathlib import Path

from sqlalchemy.orm import Session

from app.db.models import Template

SEED_DIR = Path(__file__).resolve().parent.parent / "templates_seed"


def seed_builtin_templates(db: Session) -> None:
    for path in sorted(SEED_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        existing = (
            db.query(Template)
            .filter_by(is_builtin=True, name=data["name"])
            .one_or_none()
        )
        if existing is None:
            db.add(Template(name=data["name"], is_builtin=True, spec=data["spec"]))
    db.commit()
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
pytest tests/test_seed.py -v
```
Expected: 2 PASS

- [ ] **Step 6: `app/main.py` startup에 시드 호출 등록**

`backend/app/main.py` 수정:
```python
"""FastAPI 앱 진입점."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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


@app.get("/health")
def get_health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 7: Commit**

```bash
git add backend/app/templates_seed/ backend/app/db/seed.py backend/app/main.py backend/tests/test_seed.py
git commit -m "feat(db): seed builtin '기본 보고서' template idempotently on startup"
```

---

## Task 6: 도메인 모델 (Outline + StyleSpec Pydantic)

**Files:**
- Create: `backend/app/domain/__init__.py`, `backend/app/domain/outline.py`, `backend/app/domain/style_spec.py`, `backend/tests/test_domain_models.py`

- [ ] **Step 1: 실패하는 도메인 모델 테스트**

`backend/tests/test_domain_models.py`:
```python
"""Outline / StyleSpec Pydantic 검증."""

import pytest
from pydantic import ValidationError

from app.domain.outline import Block, Outline
from app.domain.style_spec import StyleSpec


def test_paragraph_block_valid():
    b = Block(id="b-1", kind="paragraph", level=1, text="Intro", detected_by="word_style")
    assert b.level == 1


def test_paragraph_level_out_of_range():
    with pytest.raises(ValidationError):
        Block(id="b-1", kind="paragraph", level=4, text="x", detected_by="user")


def test_table_block_requires_markdown():
    b = Block(id="b-2", kind="table", level=0, markdown="| a |\n|---|\n| 1 |", caption="표 1", raw_ref="t-0")
    assert b.markdown.startswith("|")


def test_outline_minimal():
    o = Outline(
        job_id="j-1",
        source_filename="r.docx",
        blocks=[Block(id="b-1", kind="paragraph", level=0, text="hi", detected_by="word_style")],
    )
    assert len(o.blocks) == 1


def test_style_spec_minimal():
    spec = StyleSpec.model_validate({
        "fonts": {
            "body": {"korean": "맑은 고딕", "ascii": "Arial", "size_pt": 11},
            "heading": {
                "h1": {"korean": "맑은 고딕", "ascii": "Arial", "size_pt": 16, "bold": True},
                "h2": {"korean": "맑은 고딕", "ascii": "Arial", "size_pt": 14, "bold": True},
                "h3": {"korean": "맑은 고딕", "ascii": "Arial", "size_pt": 12, "bold": True},
            },
        },
        "paragraph": {"line_spacing": 1.5, "alignment": "justify", "first_line_indent_pt": 0},
        "numbering": {"h1": "1.", "h2": "1.1.", "h3": "1.1.1.", "list": "decimal"},
        "table": {"border_color": "#000000", "border_width_pt": 0.5, "header_bg": "#D9D9D9", "header_bold": True, "cell_font_size_pt": 10},
        "page": {"margin_top_mm": 25, "margin_bottom_mm": 25, "margin_left_mm": 25, "margin_right_mm": 25},
    })
    assert spec.fonts.body.korean == "맑은 고딕"
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pytest tests/test_domain_models.py -v
```
Expected: `ImportError`

- [ ] **Step 3: `backend/app/domain/outline.py`**

```python
"""Outline JSON — Backend ↔ Frontend 계약."""

from typing import Literal

from pydantic import BaseModel, Field

DetectedBy = Literal["word_style", "heuristic", "user"]
BlockKind = Literal["paragraph", "table", "image", "field"]
FieldKind = Literal["ref", "toc", "pageref"]


class Block(BaseModel):
    id: str
    kind: BlockKind
    level: int = Field(ge=0, le=3)

    # paragraph
    text: str | None = None
    detected_by: DetectedBy | None = None
    list_format: str | None = None

    # table / image
    markdown: str | None = None
    preview_url: str | None = None
    caption: str | None = None
    raw_ref: str | None = None

    # field (Phase 4 자리; Phase 1에서는 placeholder만 만듦)
    field_kind: FieldKind | None = None
    preview_text: str | None = None
    target_id: str | None = None
    raw_xml_ref: str | None = None


class Outline(BaseModel):
    job_id: str
    source_filename: str
    blocks: list[Block]
```

- [ ] **Step 4: `backend/app/domain/style_spec.py`**

```python
"""StyleSpec — 표준화 규칙 (변환 시 적용)."""

from typing import Literal

from pydantic import BaseModel, Field


class FontDef(BaseModel):
    korean: str
    ascii: str
    size_pt: float = Field(gt=0)
    bold: bool = False


class HeadingFonts(BaseModel):
    h1: FontDef
    h2: FontDef
    h3: FontDef


class FontsBlock(BaseModel):
    body: FontDef
    heading: HeadingFonts


class ParagraphBlock(BaseModel):
    line_spacing: float = Field(gt=0)
    alignment: Literal["left", "right", "center", "justify"]
    first_line_indent_pt: float = 0


class NumberingBlock(BaseModel):
    h1: str
    h2: str
    h3: str
    list: Literal["decimal", "bullet", "korean"]


class TableBlock(BaseModel):
    border_color: str
    border_width_pt: float
    header_bg: str
    header_bold: bool
    cell_font_size_pt: float


class PageBlock(BaseModel):
    margin_top_mm: float
    margin_bottom_mm: float
    margin_left_mm: float
    margin_right_mm: float


class StyleSpec(BaseModel):
    fonts: FontsBlock
    paragraph: ParagraphBlock
    numbering: NumberingBlock
    table: TableBlock
    page: PageBlock
```

- [ ] **Step 5: `backend/app/domain/__init__.py` 빈 파일**

- [ ] **Step 6: 테스트 통과 확인**

```bash
pytest tests/test_domain_models.py -v
```
Expected: 5 PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/domain/ backend/tests/test_domain_models.py
git commit -m "feat(domain): add Outline and StyleSpec Pydantic models"
```

---

## Task 7: 인증 (security 유틸 + auth 라우터 + deps)

**Files:**
- Create: `backend/app/core/__init__.py`, `backend/app/core/security.py`, `backend/app/api/__init__.py`, `backend/app/api/deps.py`, `backend/app/api/auth.py`, `backend/tests/test_security.py`, `backend/tests/test_auth.py`
- Modify: `backend/app/main.py` (라우터 등록), `backend/tests/conftest.py` (공용 fixture)

- [ ] **Step 1: 실패하는 security 단위 테스트**

`backend/tests/test_security.py`:
```python
"""bcrypt + JWT 헬퍼."""

import time
import uuid

import pytest

from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_password_hash_roundtrip():
    h = hash_password("s3cret!")
    assert verify_password("s3cret!", h)
    assert not verify_password("wrong", h)


def test_token_roundtrip():
    user_id = uuid.uuid4()
    token = create_access_token(str(user_id))
    payload = decode_access_token(token)
    assert payload["sub"] == str(user_id)


def test_token_invalid_raises():
    with pytest.raises(ValueError):
        decode_access_token("not.a.token")
```

- [ ] **Step 2: 실패 확인 → `backend/app/core/security.py`**

```python
"""bcrypt 패스워드 해시 + JWT 발급/디코드."""

from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.settings import get_settings

_settings = get_settings()
_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return _pwd.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd.verify(plain, hashed)


def create_access_token(subject: str) -> str:
    expire = datetime.now(tz=timezone.utc) + timedelta(hours=_settings.jwt_expires_hours)
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, _settings.jwt_secret, algorithm=_settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, _settings.jwt_secret, algorithms=[_settings.jwt_algorithm])
    except JWTError as e:
        raise ValueError(f"invalid token: {e}") from e
```

`backend/app/core/__init__.py` 빈 파일.

```bash
pytest tests/test_security.py -v
```
Expected: 3 PASS

- [ ] **Step 3: `backend/app/api/deps.py`**

```python
"""API 의존성 — DB 세션, 현재 사용자."""

import uuid
from collections.abc import Iterator

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.models import User
from app.db.session import SessionLocal

COOKIE_NAME = "access_token"


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    access_token: str | None = Cookie(default=None, alias=COOKIE_NAME),
    db: Session = Depends(get_db),
) -> User:
    if access_token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing token")
    try:
        payload = decode_access_token(access_token)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e)) from e
    user = db.query(User).filter_by(id=uuid.UUID(payload["sub"])).one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="user not found")
    return user
```

- [ ] **Step 4: 공용 conftest fixture (DB + TestClient)**

`backend/tests/conftest.py`:
```python
"""공용 fixture — 테스트용 DB + TestClient."""

import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.deps import get_db
from app.db.base import Base
from app.db.seed import seed_builtin_templates
from app.main import app


@pytest.fixture
def db_engine():
    db_url = os.environ["TEST_DATABASE_URL"]
    engine = create_engine(db_url)
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)


@pytest.fixture
def db_session(db_engine):
    Session = sessionmaker(bind=db_engine)
    session = Session()
    seed_builtin_templates(session)
    yield session
    session.close()


@pytest.fixture
def client(db_session):
    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

- [ ] **Step 5: 실패하는 auth 라우터 테스트**

`backend/tests/test_auth.py`:
```python
"""auth 엔드포인트 — signup → login → me → logout."""

def test_signup_then_login_then_me(client):
    # signup
    r = client.post("/auth/signup", json={"email": "a@b.com", "password": "pw1234"})
    assert r.status_code == 201

    # login (쿠키 발급)
    r = client.post("/auth/login", json={"email": "a@b.com", "password": "pw1234"})
    assert r.status_code == 200
    assert "access_token" in r.cookies

    # me
    r = client.get("/auth/me")
    assert r.status_code == 200
    assert r.json()["email"] == "a@b.com"


def test_signup_duplicate_email_409(client):
    client.post("/auth/signup", json={"email": "x@y.com", "password": "pw1234"})
    r = client.post("/auth/signup", json={"email": "x@y.com", "password": "pw1234"})
    assert r.status_code == 409


def test_login_wrong_password_401(client):
    client.post("/auth/signup", json={"email": "a@b.com", "password": "pw1234"})
    r = client.post("/auth/login", json={"email": "a@b.com", "password": "WRONG"})
    assert r.status_code == 401


def test_logout_clears_cookie(client):
    client.post("/auth/signup", json={"email": "a@b.com", "password": "pw1234"})
    client.post("/auth/login", json={"email": "a@b.com", "password": "pw1234"})
    r = client.post("/auth/logout")
    assert r.status_code == 204
```

- [ ] **Step 6: 실패 확인 → `backend/app/api/auth.py`**

```python
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
```

`backend/app/api/__init__.py` 빈 파일.

- [ ] **Step 7: `app/main.py`에 라우터 등록**

`app/main.py` 의 `app = FastAPI(...)` 다음에 추가:
```python
from app.api.auth import router as auth_router
app.include_router(auth_router)
```

- [ ] **Step 8: 테스트 통과 확인**

```bash
TEST_DATABASE_URL=postgresql+psycopg://app:change_me@localhost:5432/test_wt pytest tests/test_auth.py -v
```
Expected: 4 PASS

- [ ] **Step 9: Commit**

```bash
git add backend/app/core/ backend/app/api/ backend/app/main.py backend/tests/test_security.py backend/tests/test_auth.py backend/tests/conftest.py
git commit -m "feat(auth): add bcrypt+JWT auth with signup/login/logout/me endpoints"
```

---

## Task 8: 헤딩 감지 (R3 a+b)

**Files:**
- Create: `backend/app/parser/__init__.py`, `backend/app/parser/detect_heading.py`, `backend/tests/test_detect_heading.py`

- [ ] **Step 1: 실패하는 테스트**

`backend/tests/test_detect_heading.py`:
```python
"""헤딩 감지 단계적 폴백 (R3)."""

from dataclasses import dataclass

from app.parser.detect_heading import detect_level


@dataclass
class FakeRun:
    bold: bool = False
    font_size_pt: float | None = None


@dataclass
class FakeStyle:
    name: str = "Normal"


@dataclass
class FakeParagraph:
    text: str = ""
    style: FakeStyle = FakeStyle()
    runs: list[FakeRun] = None

    def __post_init__(self):
        if self.runs is None:
            self.runs = []


def test_word_heading_1():
    p = FakeParagraph(text="개요", style=FakeStyle(name="Heading 1"))
    assert detect_level(p) == (1, "word_style")


def test_korean_heading_2():
    p = FakeParagraph(text="배경", style=FakeStyle(name="제목 2"))
    assert detect_level(p) == (2, "word_style")


def test_heuristic_decimal_h1_with_bold():
    p = FakeParagraph(text="1. 개요", runs=[FakeRun(bold=True, font_size_pt=14)])
    assert detect_level(p) == (1, "heuristic")


def test_heuristic_dotted_h2():
    p = FakeParagraph(text="1.1. 배경")
    assert detect_level(p) == (2, "heuristic")


def test_heuristic_korean_h2():
    p = FakeParagraph(text="가. 항목")
    assert detect_level(p) == (2, "heuristic")


def test_fallback_body():
    p = FakeParagraph(text="본문 내용입니다.")
    assert detect_level(p) == (0, "heuristic")
```

- [ ] **Step 2: 실패 확인**

```bash
pytest tests/test_detect_heading.py -v
```
Expected: `ImportError`

- [ ] **Step 3: `backend/app/parser/detect_heading.py`**

```python
"""제목 레벨 감지 — (a) Word 스타일 → (b) 휴리스틱 → (c=0, body 폴백).

(c) 사용자 마킹은 프론트에서 처리되므로 파서 단계에선 noop.
"""

import re
from typing import Any, Literal

DetectedBy = Literal["word_style", "heuristic"]

_WORD_HEADING = {
    "Heading 1": 1, "제목 1": 1,
    "Heading 2": 2, "제목 2": 2,
    "Heading 3": 3, "제목 3": 3,
}

_RE_H1_DECIMAL = re.compile(r"^\d+\.\s")
_RE_H2_DECIMAL = re.compile(r"^\d+\.\d+\.\s")
_RE_H3_DECIMAL = re.compile(r"^\d+\.\d+\.\d+\.\s")
_RE_KOREAN_LETTER = re.compile(r"^[가-힣]\.\s")


def _is_bold_or_large(paragraph: Any) -> bool:
    runs = getattr(paragraph, "runs", []) or []
    for r in runs:
        if getattr(r, "bold", False):
            return True
        size = getattr(r, "font_size_pt", None)
        if size is not None and size >= 13:
            return True
    return False


def detect_level(paragraph: Any) -> tuple[int, DetectedBy]:
    style_name = getattr(paragraph.style, "name", "")
    if style_name in _WORD_HEADING:
        return _WORD_HEADING[style_name], "word_style"

    text = (paragraph.text or "").strip()
    if _RE_H3_DECIMAL.match(text):
        return 3, "heuristic"
    if _RE_H2_DECIMAL.match(text):
        return 2, "heuristic"
    if _RE_H1_DECIMAL.match(text) and _is_bold_or_large(paragraph):
        return 1, "heuristic"
    if _RE_KOREAN_LETTER.match(text):
        return 2, "heuristic"

    return 0, "heuristic"
```

`backend/app/parser/__init__.py` 빈 파일.

- [ ] **Step 4: 테스트 통과 확인**

```bash
pytest tests/test_detect_heading.py -v
```
Expected: 6 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/parser/ backend/tests/test_detect_heading.py
git commit -m "feat(parser): add cascading heading detector (Word style → heuristic → body)"
```

---

## Task 9: Parser (텍스트만, 표/이미지/필드 placeholder)

**Files:**
- Create: `backend/app/parser/parse_docx.py`, `backend/tests/test_parse.py`, `backend/tests/fixtures/build_fixtures.py`

- [ ] **Step 1: fixture 생성 스크립트**

`backend/tests/fixtures/build_fixtures.py`:
```python
"""테스트용 .docx fixture 생성. 실행: python tests/fixtures/build_fixtures.py"""

from pathlib import Path

from docx import Document
from docx.shared import Pt

OUT = Path(__file__).resolve().parent


def build_simple() -> None:
    """헤딩 + 본문만."""
    doc = Document()
    doc.add_heading("개요", level=1)
    doc.add_paragraph("본 문서는 샘플입니다.")
    doc.add_heading("배경", level=2)
    doc.add_paragraph("Lorem ipsum.")
    doc.save(OUT / "sample_simple.docx")


def build_heuristic() -> None:
    """Word 스타일이 안 적힌, 휴리스틱으로 H1을 잡아야 하는 문서."""
    doc = Document()
    p = doc.add_paragraph()
    r = p.add_run("1. 개요")
    r.bold = True
    r.font.size = Pt(14)
    doc.add_paragraph("본문.")
    p2 = doc.add_paragraph("1.1. 배경")  # H2 휴리스틱
    doc.add_paragraph("내용.")
    doc.save(OUT / "sample_heuristic.docx")


def build_with_table() -> None:
    """표가 섞인 문서 (Phase 1: placeholder block 출력 검증)."""
    doc = Document()
    doc.add_heading("결과", level=1)
    t = doc.add_table(rows=2, cols=2)
    t.cell(0, 0).text = "구분"
    t.cell(0, 1).text = "값"
    t.cell(1, 0).text = "A"
    t.cell(1, 1).text = "10"
    doc.add_paragraph("이상 결과 요약.")
    doc.save(OUT / "sample_with_table.docx")


if __name__ == "__main__":
    build_simple()
    build_heuristic()
    build_with_table()
    print("fixtures generated.")
```

```bash
cd backend && python tests/fixtures/build_fixtures.py
```

- [ ] **Step 2: 실패하는 파서 테스트**

`backend/tests/test_parse.py`:
```python
"""parse_docx: .docx → Outline."""

from pathlib import Path

from app.parser.parse_docx import parse_docx

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def test_parse_simple_headings_and_body():
    outline = parse_docx((FIXTURES / "sample_simple.docx").read_bytes(), filename="sample_simple.docx")
    kinds = [b.kind for b in outline.blocks]
    levels = [b.level for b in outline.blocks if b.kind == "paragraph"]
    assert kinds.count("paragraph") == 4
    # H1, body, H2, body
    assert levels == [1, 0, 2, 0]
    assert outline.blocks[0].detected_by == "word_style"


def test_parse_heuristic_headings():
    outline = parse_docx((FIXTURES / "sample_heuristic.docx").read_bytes(), filename="sample_heuristic.docx")
    paras = [b for b in outline.blocks if b.kind == "paragraph"]
    assert paras[0].level == 1 and paras[0].detected_by == "heuristic"
    assert paras[2].level == 2 and paras[2].detected_by == "heuristic"


def test_parse_table_emits_placeholder_block():
    outline = parse_docx((FIXTURES / "sample_with_table.docx").read_bytes(), filename="sample_with_table.docx")
    table_blocks = [b for b in outline.blocks if b.kind == "table"]
    assert len(table_blocks) == 1
    assert table_blocks[0].markdown is None  # Phase 1: 마크다운 미생성
    assert table_blocks[0].raw_ref is not None


def test_parse_block_ids_are_unique():
    outline = parse_docx((FIXTURES / "sample_simple.docx").read_bytes(), filename="x.docx")
    ids = [b.id for b in outline.blocks]
    assert len(ids) == len(set(ids))
```

- [ ] **Step 3: 실패 확인**

```bash
pytest tests/test_parse.py -v
```
Expected: `ImportError`

- [ ] **Step 4: `backend/app/parser/parse_docx.py`**

```python
"""`.docx` 바이트 → Outline (Phase 1: 텍스트/헤딩만, 표/이미지는 placeholder)."""

import io
import uuid
from typing import Iterator

from docx import Document
from docx.document import Document as DocxDocument
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

from app.domain.outline import Block, Outline
from app.parser.detect_heading import detect_level


def _iter_top_level(doc: DocxDocument) -> Iterator[object]:
    """문서 본문 자식을 표시 순서대로 순회."""
    body = doc.element.body
    for child in body.iterchildren():
        if child.tag == qn("w:p"):
            yield Paragraph(child, doc)
        elif child.tag == qn("w:tbl"):
            yield Table(child, doc)


def _new_id() -> str:
    return f"b-{uuid.uuid4().hex[:8]}"


def parse_docx(content: bytes, *, filename: str) -> Outline:
    doc = Document(io.BytesIO(content))
    blocks: list[Block] = []
    table_idx = 0
    for item in _iter_top_level(doc):
        if isinstance(item, Paragraph):
            level, detected_by = detect_level(item)
            blocks.append(
                Block(
                    id=_new_id(),
                    kind="paragraph",
                    level=level,
                    text=item.text,
                    detected_by=detected_by,
                )
            )
        elif isinstance(item, Table):
            blocks.append(
                Block(
                    id=_new_id(),
                    kind="table",
                    level=0,
                    raw_ref=f"table-{table_idx}",
                )
            )
            table_idx += 1

    return Outline(job_id="", source_filename=filename, blocks=blocks)
```

> `python-docx`의 `Paragraph` 객체에는 `runs` 가 있고 `font_size_pt` 라는 정확히 같은 속성은 없음. `detect_heading._is_bold_or_large` 가 호환되도록 `getattr(r, "font_size_pt", None)` 폴백을 두고 있으므로, 실제 `Run` 객체에서는 `r.font.size` 만 보고 휴리스틱이 동작 못 할 수 있음. 다음 단계에서 어댑터 추가.

- [ ] **Step 5: Run 어댑터 — `detect_heading._is_bold_or_large` 가 진짜 Run에도 동작하도록 보강**

`backend/app/parser/detect_heading.py` 의 `_is_bold_or_large` 를 다음으로 교체:

```python
def _is_bold_or_large(paragraph: Any) -> bool:
    runs = getattr(paragraph, "runs", []) or []
    for r in runs:
        if getattr(r, "bold", False):
            return True
        # 테스트용 FakeRun
        size = getattr(r, "font_size_pt", None)
        if size is not None and size >= 13:
            return True
        # 실제 docx.Run
        font = getattr(r, "font", None)
        real_size = getattr(font, "size", None) if font is not None else None
        if real_size is not None and real_size.pt >= 13:
            return True
    return False
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
pytest tests/test_parse.py tests/test_detect_heading.py -v
```
Expected: 4 + 6 PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/parser/parse_docx.py backend/app/parser/detect_heading.py backend/tests/fixtures/ backend/tests/test_parse.py
git commit -m "feat(parser): parse paragraphs to Outline; tables emit placeholder blocks"
```

---

## Task 10: Renderer (R2 한/영 폰트 폴백 포함)

**Files:**
- Create: `backend/app/renderer/__init__.py`, `backend/app/renderer/render_docx.py`, `backend/app/renderer/apply_style.py`, `backend/app/renderer/inject_numbering.py`, `backend/tests/test_render.py`

- [ ] **Step 1: 실패하는 렌더러 테스트**

`backend/tests/test_render.py`:
```python
"""Outline + StyleSpec → .docx round-trip."""

import io
import json
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn

from app.domain.outline import Block, Outline
from app.domain.style_spec import StyleSpec
from app.renderer.render_docx import render_docx

SEED = Path(__file__).resolve().parent.parent / "app" / "templates_seed" / "report.json"


def _load_default_spec() -> StyleSpec:
    raw = json.loads(SEED.read_text(encoding="utf-8"))
    return StyleSpec.model_validate(raw["spec"])


def _build_outline() -> Outline:
    return Outline(
        job_id="j-1",
        source_filename="x.docx",
        blocks=[
            Block(id="b-1", kind="paragraph", level=1, text="개요", detected_by="word_style"),
            Block(id="b-2", kind="paragraph", level=0, text="본문 sample.", detected_by="word_style"),
            Block(id="b-3", kind="table", level=0, raw_ref="table-0"),
        ],
    )


def test_render_emits_valid_docx():
    spec = _load_default_spec()
    data = render_docx(_build_outline(), spec)
    doc = Document(io.BytesIO(data))
    paras = [p.text for p in doc.paragraphs]
    assert "개요" in paras
    assert "본문 sample." in paras
    # 표 placeholder
    assert any("[표는" in t for t in paras)


def test_render_applies_eastasia_font_for_korean():
    spec = _load_default_spec()
    data = render_docx(_build_outline(), spec)
    doc = Document(io.BytesIO(data))
    p = doc.paragraphs[0]  # 첫 paragraph "개요"
    run_xml = p.runs[0]._element  # type: ignore[attr-defined]
    rfonts = run_xml.find(qn("w:rPr") + "/" + qn("w:rFonts"))
    assert rfonts is not None
    assert rfonts.get(qn("w:eastAsia")) == "맑은 고딕"
    assert rfonts.get(qn("w:ascii")) == "Arial"
```

- [ ] **Step 2: 실패 확인**

```bash
pytest tests/test_render.py -v
```
Expected: `ImportError`

- [ ] **Step 3: `backend/app/renderer/apply_style.py` (R2 폰트 폴백 포함)**

```python
"""StyleSpec을 docx 요소에 적용하는 헬퍼."""

from docx.oxml.ns import qn
from docx.shared import Pt
from docx.text.paragraph import Paragraph
from docx.text.run import Run
from lxml import etree

from app.domain.style_spec import FontDef, StyleSpec


def _set_run_fonts(run: Run, font: FontDef) -> None:
    """w:rFonts에 ascii/hAnsi/eastAsia 모두 설정 (R2)."""
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = etree.SubElement(rPr, qn("w:rFonts"))
    rFonts.set(qn("w:ascii"), font.ascii)
    rFonts.set(qn("w:hAnsi"), font.ascii)
    rFonts.set(qn("w:eastAsia"), font.korean)
    run.font.size = Pt(font.size_pt)
    if font.bold:
        run.font.bold = True


def _set_paragraph_spacing(para: Paragraph, line_spacing: float) -> None:
    para.paragraph_format.line_spacing = line_spacing


def apply_paragraph_style(para: Paragraph, level: int, spec: StyleSpec) -> None:
    if level == 0:
        font = spec.fonts.body
    elif level == 1:
        font = spec.fonts.heading.h1
    elif level == 2:
        font = spec.fonts.heading.h2
    elif level == 3:
        font = spec.fonts.heading.h3
    else:
        font = spec.fonts.body

    _set_paragraph_spacing(para, spec.paragraph.line_spacing)
    para.paragraph_format.first_line_indent = Pt(spec.paragraph.first_line_indent_pt)
    align_map = {
        "left": 0,  # WD_PARAGRAPH_ALIGNMENT.LEFT
        "right": 2,
        "center": 1,
        "justify": 3,
    }
    para.paragraph_format.alignment = align_map[spec.paragraph.alignment]

    for run in para.runs:
        _set_run_fonts(run, font)
```

- [ ] **Step 4: `backend/app/renderer/inject_numbering.py` (Phase 1: 최소 — heading 번호 prefix만)**

```python
"""Heading 번호 prefix를 텍스트에 직접 부여 (Phase 1 minimum).

진짜 numbering.xml 주입은 Phase 2에서 정밀화. Phase 1에서는
`numbering` 스펙의 prefix를 H1/H2/H3 텍스트 앞에 붙여 동일 효과.
"""

import re

from app.domain.outline import Block
from app.domain.style_spec import StyleSpec

_RE_LEADING_NUMBER = re.compile(r"^\d+(\.\d+)*\.\s*")


def renumber(blocks: list[Block], spec: StyleSpec) -> list[Block]:
    counters = {1: 0, 2: 0, 3: 0}
    out: list[Block] = []
    for b in blocks:
        if b.kind != "paragraph" or b.level == 0:
            out.append(b)
            continue
        counters[b.level] += 1
        # 하위 카운터 리셋
        for lvl in range(b.level + 1, 4):
            counters[lvl] = 0
        prefix_template = {1: spec.numbering.h1, 2: spec.numbering.h2, 3: spec.numbering.h3}[b.level]
        # `1.` / `1.1.` / `1.1.1.` 자리에 카운터 채우기
        if b.level == 1:
            prefix = prefix_template.replace("1", str(counters[1]), 1)
        elif b.level == 2:
            prefix = f"{counters[1]}.{counters[2]}."
        else:
            prefix = f"{counters[1]}.{counters[2]}.{counters[3]}."

        original = b.text or ""
        cleaned = _RE_LEADING_NUMBER.sub("", original)
        new_text = f"{prefix} {cleaned}".strip()
        out.append(b.model_copy(update={"text": new_text}))
    return out
```

- [ ] **Step 5: `backend/app/renderer/render_docx.py`**

```python
"""Outline + StyleSpec → .docx 바이트."""

import io

from docx import Document
from docx.shared import Mm

from app.domain.outline import Block, Outline
from app.domain.style_spec import StyleSpec
from app.renderer.apply_style import apply_paragraph_style
from app.renderer.inject_numbering import renumber

_PLACEHOLDER = {
    "table": "[표는 다음 Phase에서 지원 예정]",
    "image": "[이미지는 다음 Phase에서 지원 예정]",
    "field": "[참조는 다음 Phase에서 지원 예정]",
}


def _setup_page(doc, spec: StyleSpec) -> None:
    section = doc.sections[0]
    section.top_margin = Mm(spec.page.margin_top_mm)
    section.bottom_margin = Mm(spec.page.margin_bottom_mm)
    section.left_margin = Mm(spec.page.margin_left_mm)
    section.right_margin = Mm(spec.page.margin_right_mm)


def _add_paragraph(doc, block: Block, spec: StyleSpec) -> None:
    if block.kind == "paragraph":
        para = doc.add_paragraph(block.text or "")
        apply_paragraph_style(para, block.level, spec)
    else:
        text = _PLACEHOLDER.get(block.kind, "[unknown block]")
        if block.caption:
            text = f"{text} ({block.caption})"
        para = doc.add_paragraph(text)
        apply_paragraph_style(para, 0, spec)


def render_docx(outline: Outline, spec: StyleSpec) -> bytes:
    doc = Document()
    _setup_page(doc, spec)
    blocks = renumber(outline.blocks, spec)
    for b in blocks:
        _add_paragraph(doc, b, spec)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
```

`backend/app/renderer/__init__.py` 빈 파일.

- [ ] **Step 6: 테스트 통과 확인**

```bash
pytest tests/test_render.py -v
```
Expected: 2 PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/renderer/ backend/tests/test_render.py
git commit -m "feat(renderer): render Outline+StyleSpec to .docx with eastAsia font fallback"
```

---

## Task 11: Storage (파일 경로 헬퍼)

**Files:**
- Create: `backend/app/storage/__init__.py`, `backend/app/storage/files.py`, `backend/tests/test_storage.py`

- [ ] **Step 1: 실패하는 테스트**

`backend/tests/test_storage.py`:
```python
"""storage.files 경로 헬퍼."""

import uuid
from pathlib import Path

from app.storage.files import job_dir, source_path, result_path


def test_paths_are_under_data_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    user_id = uuid.uuid4()
    job_id = uuid.uuid4()
    d = job_dir(user_id, job_id)
    assert str(d).startswith(str(tmp_path))
    assert d.exists()


def test_source_and_result_paths_distinct(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    user_id = uuid.uuid4()
    job_id = uuid.uuid4()
    src = source_path(user_id, job_id, "report.docx")
    res = result_path(user_id, job_id)
    assert src != res
    assert src.suffix == ".docx"
    assert res.suffix == ".docx"
```

- [ ] **Step 2: `backend/app/storage/files.py`**

```python
"""파일 경로 헬퍼 — /data/{user_id}/{job_id}/."""

import os
import uuid
from pathlib import Path


def _data_dir() -> Path:
    return Path(os.environ.get("DATA_DIR", "/data"))


def job_dir(user_id: uuid.UUID, job_id: uuid.UUID) -> Path:
    d = _data_dir() / "docs" / str(user_id) / str(job_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def source_path(user_id: uuid.UUID, job_id: uuid.UUID, original_filename: str) -> Path:
    safe = original_filename.replace("/", "_").replace("\\", "_")
    return job_dir(user_id, job_id) / f"src_{safe}"


def result_path(user_id: uuid.UUID, job_id: uuid.UUID) -> Path:
    return job_dir(user_id, job_id) / "result.docx"
```

`backend/app/storage/__init__.py` 빈 파일.

- [ ] **Step 3: 테스트 통과**

```bash
pytest tests/test_storage.py -v
```
Expected: 2 PASS

- [ ] **Step 4: 주의 — `_data_dir()` 가 매 호출마다 ENV를 읽어야 monkeypatch가 동작**

이미 그렇게 작성됨 (settings 객체 캐시 안 함).

- [ ] **Step 5: Commit**

```bash
git add backend/app/storage/ backend/tests/test_storage.py
git commit -m "feat(storage): add path helpers under DATA_DIR"
```

---

## Task 12: Jobs/Templates API + 라우터 등록

**Files:**
- Create: `backend/app/api/jobs.py`, `backend/app/api/templates.py`, `backend/tests/test_api_jobs.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: 실패하는 통합 테스트**

`backend/tests/test_api_jobs.py`:
```python
"""Jobs API end-to-end: signup → upload → outline → render → download."""

from pathlib import Path

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def _login(client) -> None:
    client.post("/auth/signup", json={"email": "u@u.com", "password": "pw1234"})
    client.post("/auth/login", json={"email": "u@u.com", "password": "pw1234"})


def test_upload_returns_outline_with_blocks(client):
    _login(client)
    with (FIXTURES / "sample_simple.docx").open("rb") as f:
        r = client.post("/jobs/upload", files={"file": ("sample_simple.docx", f.read())})
    assert r.status_code == 201
    data = r.json()
    assert "job_id" in data
    assert len(data["outline"]["blocks"]) >= 4


def test_get_outline_returns_saved_outline(client):
    _login(client)
    with (FIXTURES / "sample_simple.docx").open("rb") as f:
        up = client.post("/jobs/upload", files={"file": ("sample_simple.docx", f.read())})
    job_id = up.json()["job_id"]
    r = client.get(f"/jobs/{job_id}/outline")
    assert r.status_code == 200
    assert r.json()["job_id"] == job_id


def test_put_outline_persists_level_change(client):
    _login(client)
    with (FIXTURES / "sample_simple.docx").open("rb") as f:
        up = client.post("/jobs/upload", files={"file": ("sample_simple.docx", f.read())})
    body = up.json()
    job_id = body["job_id"]
    outline = body["outline"]
    # 첫 paragraph block의 level을 바꿔서 PUT
    for blk in outline["blocks"]:
        if blk["kind"] == "paragraph":
            blk["level"] = 2
            break
    r = client.put(f"/jobs/{job_id}/outline", json=outline)
    assert r.status_code == 200
    g = client.get(f"/jobs/{job_id}/outline").json()
    first_para = next(b for b in g["blocks"] if b["kind"] == "paragraph")
    assert first_para["level"] == 2


def test_render_then_download(client):
    _login(client)
    with (FIXTURES / "sample_simple.docx").open("rb") as f:
        up = client.post("/jobs/upload", files={"file": ("sample_simple.docx", f.read())})
    job_id = up.json()["job_id"]
    tmpls = client.get("/templates").json()
    builtin = next(t for t in tmpls if t["is_builtin"])
    r = client.post(f"/jobs/{job_id}/render", json={"template_id": builtin["id"], "overrides": {}})
    assert r.status_code == 200
    dl = client.get(f"/jobs/{job_id}/download")
    assert dl.status_code == 200
    assert dl.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    assert len(dl.content) > 1000


def test_jobs_list_returns_user_history(client):
    _login(client)
    with (FIXTURES / "sample_simple.docx").open("rb") as f:
        client.post("/jobs/upload", files={"file": ("a.docx", f.read())})
    with (FIXTURES / "sample_simple.docx").open("rb") as f:
        client.post("/jobs/upload", files={"file": ("b.docx", f.read())})
    r = client.get("/jobs")
    assert r.status_code == 200
    assert len(r.json()) == 2
```

- [ ] **Step 2: 실패 확인**

```bash
TEST_DATABASE_URL=postgresql+psycopg://app:change_me@localhost:5432/test_wt pytest tests/test_api_jobs.py -v
```
Expected: 404 / ImportError

- [ ] **Step 3: `backend/app/api/templates.py`**

```python
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
def get_templates(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[TemplateOut]:
    rows = (
        db.query(Template)
        .filter((Template.is_builtin == True) | (Template.owner_id == user.id))  # noqa: E712
        .order_by(Template.is_builtin.desc(), Template.created_at.asc())
        .all()
    )
    return [TemplateOut(id=str(r.id), name=r.name, is_builtin=r.is_builtin, spec=r.spec) for r in rows]
```

- [ ] **Step 4: `backend/app/api/jobs.py`**

```python
"""Jobs 라우터 — 업로드, outline 조회/저장, 렌더, 다운로드, 히스토리."""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.db.models import Job, Template, User
from app.domain.outline import Outline
from app.domain.style_spec import StyleSpec
from app.parser.parse_docx import parse_docx
from app.renderer.render_docx import render_docx
from app.storage.files import result_path, source_path

router = APIRouter(prefix="/jobs", tags=["jobs"])


class UploadResponse(BaseModel):
    job_id: str
    outline: dict


class RenderRequest(BaseModel):
    template_id: str
    overrides: dict[str, Any] = {}


class JobSummary(BaseModel):
    id: str
    original_filename: str
    status: str
    created_at: str


def _get_user_job(db: Session, user: User, job_id: str) -> Job:
    job = db.query(Job).filter_by(id=uuid.UUID(job_id), user_id=user.id).one_or_none()
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return job


@router.post("/upload", status_code=201, response_model=UploadResponse)
async def post_upload(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UploadResponse:
    if not file.filename or not file.filename.lower().endswith(".docx"):
        raise HTTPException(status_code=400, detail="only .docx is supported")
    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="file too large (>50MB)")

    job = Job(
        user_id=user.id,
        original_filename=file.filename,
        status="parsed",
        source_path="",
        outline_json={},
    )
    db.add(job)
    db.flush()

    src = source_path(user.id, job.id, file.filename)
    src.write_bytes(content)
    job.source_path = str(src)

    outline = parse_docx(content, filename=file.filename)
    outline = outline.model_copy(update={"job_id": str(job.id)})
    job.outline_json = outline.model_dump()

    db.commit()
    db.refresh(job)
    return UploadResponse(job_id=str(job.id), outline=outline.model_dump())


@router.get("/{job_id}/outline")
def get_outline(job_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    job = _get_user_job(db, user, job_id)
    return job.outline_json


@router.put("/{job_id}/outline")
def put_outline(
    job_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    job = _get_user_job(db, user, job_id)
    # 검증: outline 형식 맞는지
    parsed = Outline.model_validate(body)
    job.outline_json = parsed.model_dump()
    db.commit()
    return {"status": "ok"}


@router.post("/{job_id}/render")
def post_render(
    job_id: str,
    body: RenderRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    job = _get_user_job(db, user, job_id)
    tmpl = db.query(Template).filter_by(id=uuid.UUID(body.template_id)).one_or_none()
    if tmpl is None:
        raise HTTPException(status_code=404, detail="template not found")
    spec_dict = {**tmpl.spec, **body.overrides}
    spec = StyleSpec.model_validate(spec_dict)
    outline = Outline.model_validate(job.outline_json)
    data = render_docx(outline, spec)

    out = result_path(user.id, job.id)
    out.write_bytes(data)
    job.result_path = str(out)
    job.applied_template_id = tmpl.id
    job.style_overrides = body.overrides
    job.status = "rendered"
    db.commit()
    return {"status": "ok"}


@router.get("/{job_id}/download")
def get_download(job_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> FileResponse:
    job = _get_user_job(db, user, job_id)
    if job.result_path is None:
        raise HTTPException(status_code=400, detail="not yet rendered")
    return FileResponse(
        path=job.result_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=f"standardized_{job.original_filename}",
    )


@router.get("", response_model=list[JobSummary])
def get_jobs(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[JobSummary]:
    rows = db.query(Job).filter_by(user_id=user.id).order_by(Job.created_at.desc()).all()
    return [
        JobSummary(
            id=str(r.id),
            original_filename=r.original_filename,
            status=r.status,
            created_at=r.created_at.isoformat(),
        )
        for r in rows
    ]
```

- [ ] **Step 5: `app/main.py` 라우터 등록**

```python
from app.api.auth import router as auth_router
from app.api.jobs import router as jobs_router
from app.api.templates import router as templates_router

app.include_router(auth_router)
app.include_router(jobs_router)
app.include_router(templates_router)
```

- [ ] **Step 6: 테스트 통과 확인 (DATA_DIR 임시 디렉터리 필요)**

`backend/tests/conftest.py` 끝에 fixture 추가:
```python
@pytest.fixture(autouse=True)
def _data_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    yield
```

```bash
TEST_DATABASE_URL=postgresql+psycopg://app:change_me@localhost:5432/test_wt pytest tests/test_api_jobs.py -v
```
Expected: 5 PASS

- [ ] **Step 7: 전체 백엔드 테스트 실행**

```bash
TEST_DATABASE_URL=postgresql+psycopg://app:change_me@localhost:5432/test_wt pytest -v
```
Expected: 모든 테스트 PASS (대략 25+개)

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/jobs.py backend/app/api/templates.py backend/app/main.py backend/tests/test_api_jobs.py backend/tests/conftest.py
git commit -m "feat(api): add jobs and templates endpoints with full upload→render flow"
```

---

## Task 13: Frontend 스캐폴드 (Next.js + Tailwind + design tokens)

**Files:**
- Create: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/next.config.ts`, `frontend/postcss.config.mjs`, `frontend/tailwind.config.ts`, `frontend/eslint.config.mjs`, `frontend/app/layout.tsx`, `frontend/app/page.tsx`, `frontend/app/globals.css`, `frontend/styles/design-tokens.css`, `frontend/components/providers.tsx`

- [ ] **Step 1: Next.js 앱 초기화 (수동, claude.md의 토큰 우선 원칙 준수)**

`frontend/package.json`:
```json
{
  "name": "word-templator-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "lint": "eslint",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "15.0.3",
    "react": "19.0.0-rc-1",
    "react-dom": "19.0.0-rc-1",
    "@tanstack/react-query": "5.59.20",
    "react-hook-form": "7.53.2",
    "zod": "3.23.8",
    "@hookform/resolvers": "3.9.1",
    "react-markdown": "9.0.1",
    "remark-gfm": "4.0.0",
    "clsx": "2.1.1"
  },
  "devDependencies": {
    "typescript": "5.6.3",
    "@types/node": "22.9.0",
    "@types/react": "19.0.0-rc.1",
    "@types/react-dom": "19.0.0-rc.1",
    "eslint": "9.14.0",
    "eslint-config-next": "15.0.3",
    "tailwindcss": "3.4.14",
    "postcss": "8.4.49",
    "autoprefixer": "10.4.20",
    "vitest": "2.1.4",
    "@testing-library/react": "16.0.1",
    "@testing-library/jest-dom": "6.6.3",
    "jsdom": "25.0.1"
  }
}
```

```bash
cd frontend && npm install
```

- [ ] **Step 2: `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: `frontend/next.config.ts`**

```ts
import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
};

export default config;
```

- [ ] **Step 4: `frontend/tailwind.config.ts` + `postcss.config.mjs`**

`tailwind.config.ts`:
```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};

export default config;
```

`postcss.config.mjs`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 5: design tokens 복사**

```bash
cp /Users/hyeonjin/Documents/word_templator/templates/design-tokens.css /Users/hyeonjin/Documents/word_templator/frontend/styles/design-tokens.css
```

- [ ] **Step 6: `frontend/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import "../styles/design-tokens.css";
```

- [ ] **Step 7: `frontend/components/providers.tsx`**

```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 8: `frontend/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Word Templator",
  description: "Word 문서를 표준 양식으로 변환",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 9: `frontend/app/page.tsx` (랜딩)**

```tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">Word Templator</h1>
      <p className="mt-2 text-sm text-gray-600">
        .docx 문서를 빌트인 템플릿으로 표준화합니다.
      </p>
      <div className="mt-6 flex gap-3">
        <Link href="/login" className="rounded border px-4 py-2">로그인</Link>
        <Link href="/signup" className="rounded border px-4 py-2">회원가입</Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 10: 빌드 검증**

```bash
cd frontend && npm run build
```
Expected: Build success.

- [ ] **Step 11: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): scaffold Next.js 15 app with Tailwind and design tokens"
```

---

## Task 14: Frontend 인증 페이지 + API 클라이언트

**Files:**
- Create: `frontend/lib/api.ts`, `frontend/lib/auth.ts`, `frontend/lib/types.ts`, `frontend/app/(auth)/login/page.tsx`, `frontend/app/(auth)/signup/page.tsx`

- [ ] **Step 1: `frontend/lib/types.ts`**

```ts
export type DetectedBy = "word_style" | "heuristic" | "user";
export type BlockKind = "paragraph" | "table" | "image" | "field";

export interface Block {
  id: string;
  kind: BlockKind;
  level: number;
  text?: string | null;
  detected_by?: DetectedBy | null;
  markdown?: string | null;
  preview_url?: string | null;
  caption?: string | null;
  raw_ref?: string | null;
  field_kind?: string | null;
  preview_text?: string | null;
}

export interface Outline {
  job_id: string;
  source_filename: string;
  blocks: Block[];
}

export interface Template {
  id: string;
  name: string;
  is_builtin: boolean;
  spec: Record<string, unknown>;
}

export interface JobSummary {
  id: string;
  original_filename: string;
  status: string;
  created_at: string;
}
```

- [ ] **Step 2: `frontend/lib/api.ts`**

```ts
const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": init.body instanceof FormData ? undefined as unknown as string : "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.blob()) as unknown as T;
}

export const api = {
  signup: (email: string, password: string) =>
    request<{ id: string; email: string }>("/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    request<{ status: string }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  me: () => request<{ id: string; email: string }>("/auth/me"),
  upload: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<{ job_id: string; outline: import("./types").Outline }>("/jobs/upload", { method: "POST", body: fd });
  },
  getOutline: (jobId: string) => request<import("./types").Outline>(`/jobs/${jobId}/outline`),
  putOutline: (jobId: string, outline: import("./types").Outline) =>
    request<{ status: string }>(`/jobs/${jobId}/outline`, { method: "PUT", body: JSON.stringify(outline) }),
  render: (jobId: string, templateId: string) =>
    request<{ status: string }>(`/jobs/${jobId}/render`, { method: "POST", body: JSON.stringify({ template_id: templateId, overrides: {} }) }),
  downloadUrl: (jobId: string) => `${BASE}/jobs/${jobId}/download`,
  listJobs: () => request<import("./types").JobSummary[]>("/jobs"),
  listTemplates: () => request<import("./types").Template[]>("/templates"),
};
```

- [ ] **Step 3: `frontend/lib/auth.ts` (Server Component용 me() helper)**

```ts
import { cookies } from "next/headers";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://backend:8000";

export async function fetchMe(): Promise<{ id: string; email: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;
  const res = await fetch(`${BASE}/auth/me`, {
    headers: { Cookie: `access_token=${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as { id: string; email: string };
}
```

- [ ] **Step 4: `frontend/app/(auth)/login/page.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="text-xl font-bold">로그인</h1>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
        <input
          type="email"
          placeholder="이메일"
          className="rounded border px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="비밀번호"
          className="rounded border px-3 py-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" className="rounded bg-black px-4 py-2 text-white">
          로그인
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>
    </main>
  );
}
```

- [ ] **Step 5: `frontend/app/(auth)/signup/page.tsx`**

(login 페이지와 동일 구조, `api.signup` 호출 후 `/login` 으로 라우팅)

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.signup(email, password);
      router.push("/login");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="text-xl font-bold">회원가입</h1>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
        <input type="email" placeholder="이메일" className="rounded border px-3 py-2"
          value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="비밀번호" className="rounded border px-3 py-2"
          value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button type="submit" className="rounded bg-black px-4 py-2 text-white">가입</button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>
    </main>
  );
}
```

- [ ] **Step 6: 빌드 + 수동 검증**

```bash
cd frontend && npm run build
```
Expected: 빌드 성공.

수동 검증은 Task 18 통합 단계에서.

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/ frontend/app/\(auth\)/
git commit -m "feat(frontend): add auth pages and API client with cookie session"
```

---

## Task 15: Frontend 업로드 + outline 에디터 + 다운로드

**Files:**
- Create: `frontend/components/outline-editor/{OutlineEditor,ParagraphBlock,TableBlock,ImageBlock,FieldBlock}.tsx`, `frontend/app/dashboard/page.tsx`, `frontend/app/editor/[jobId]/page.tsx`
- Modify: `frontend/app/page.tsx` (업로드 폼 추가)

- [ ] **Step 1: `frontend/components/outline-editor/ParagraphBlock.tsx`**

```tsx
"use client";

import clsx from "clsx";
import type { Block } from "@/lib/types";

interface Props {
  block: Block;
  onChangeLevel: (id: string, newLevel: number) => void;
}

const LEVEL_INDENT = ["pl-0", "pl-0", "pl-6", "pl-12"];

export function ParagraphBlock({ block, onChangeLevel }: Props) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      onChangeLevel(block.id, Math.min(3, block.level + 1));
    } else if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      onChangeLevel(block.id, Math.max(0, block.level - 1));
    }
  }

  const isHeading = block.level >= 1;
  const heuristic = block.detected_by === "heuristic";

  return (
    <div
      tabIndex={0}
      role="textbox"
      aria-label={`paragraph level ${block.level}`}
      onKeyDown={handleKeyDown}
      className={clsx(
        LEVEL_INDENT[block.level] ?? "pl-12",
        "rounded border-l-2 px-2 py-1 outline-none focus:bg-blue-50",
        isHeading ? "font-bold" : "font-normal",
        heuristic ? "border-yellow-400" : "border-gray-200",
      )}
    >
      <span className="mr-2 text-xs text-gray-400">
        {block.level === 0 ? "본문" : `H${block.level}`}
        {heuristic ? " ⚠️" : ""}
      </span>
      {block.text}
    </div>
  );
}
```

- [ ] **Step 2: `TableBlock.tsx`, `ImageBlock.tsx`, `FieldBlock.tsx` (Phase 1: placeholder 표시만)**

`TableBlock.tsx`:
```tsx
import type { Block } from "@/lib/types";

export function TableBlock({ block }: { block: Block }) {
  return (
    <div className="rounded bg-gray-50 px-3 py-2 text-sm text-gray-500 italic">
      [표 — 다음 Phase에서 마크다운 렌더] {block.caption ?? ""}
    </div>
  );
}
```

`ImageBlock.tsx`:
```tsx
import type { Block } from "@/lib/types";

export function ImageBlock({ block }: { block: Block }) {
  return (
    <div className="rounded bg-gray-50 px-3 py-2 text-sm text-gray-500 italic">
      [이미지 — 다음 Phase에서 미리보기] {block.caption ?? ""}
    </div>
  );
}
```

`FieldBlock.tsx`:
```tsx
import type { Block } from "@/lib/types";

export function FieldBlock({ block }: { block: Block }) {
  return (
    <div className="rounded bg-gray-50 px-3 py-2 text-sm text-gray-500 italic">
      [참조 — 다음 Phase에서 보존] {block.preview_text ?? ""}
    </div>
  );
}
```

- [ ] **Step 3: `OutlineEditor.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { Outline } from "@/lib/types";
import { ParagraphBlock } from "./ParagraphBlock";
import { TableBlock } from "./TableBlock";
import { ImageBlock } from "./ImageBlock";
import { FieldBlock } from "./FieldBlock";

interface Props {
  initial: Outline;
  onChange: (next: Outline) => void;
}

export function OutlineEditor({ initial, onChange }: Props) {
  const [outline, setOutline] = useState(initial);

  function updateLevel(id: string, level: number) {
    const next = {
      ...outline,
      blocks: outline.blocks.map((b) => (b.id === id ? { ...b, level, detected_by: "user" as const } : b)),
    };
    setOutline(next);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-1 rounded border bg-white p-4">
      {outline.blocks.map((b) => {
        if (b.kind === "paragraph") return <ParagraphBlock key={b.id} block={b} onChangeLevel={updateLevel} />;
        if (b.kind === "table") return <TableBlock key={b.id} block={b} />;
        if (b.kind === "image") return <ImageBlock key={b.id} block={b} />;
        return <FieldBlock key={b.id} block={b} />;
      })}
    </div>
  );
}
```

- [ ] **Step 4: 업로드 폼 — `frontend/app/page.tsx` 교체**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { job_id } = await api.upload(file);
      router.push(`/editor/${job_id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">Word Templator</h1>
      <p className="mt-2 text-sm text-gray-600">.docx 파일을 업로드해 표준화하세요.</p>
      <div className="mt-6 rounded border-2 border-dashed p-8 text-center">
        <input type="file" accept=".docx" onChange={handleUpload} disabled={busy} />
        {busy ? <p className="mt-2 text-sm">업로드 중...</p> : null}
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </div>
      <p className="mt-4 text-xs text-gray-500">
        로그인이 필요합니다. <a className="underline" href="/login">로그인</a> · <a className="underline" href="/dashboard">히스토리</a>
      </p>
    </main>
  );
}
```

- [ ] **Step 5: `editor/[jobId]/page.tsx`**

```tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Outline, Template } from "@/lib/types";
import { OutlineEditor } from "@/components/outline-editor/OutlineEditor";

export default function EditorPage() {
  const router = useRouter();
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;
  const [outline, setOutline] = useState<Outline | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTpl, setSelectedTpl] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getOutline(jobId), api.listTemplates()])
      .then(([o, t]) => {
        setOutline(o);
        setTemplates(t);
        const builtin = t.find((x) => x.is_builtin);
        if (builtin) setSelectedTpl(builtin.id);
      })
      .catch((e) => setError((e as Error).message));
  }, [jobId]);

  async function handleSave(next: Outline) {
    setOutline(next);
    try {
      await api.putOutline(jobId, next);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleRender() {
    if (!selectedTpl) return;
    setBusy(true);
    setError(null);
    try {
      await api.render(jobId, selectedTpl);
      window.location.href = api.downloadUrl(jobId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <main className="p-8 text-red-600">{error}</main>;
  if (!outline) return <main className="p-8">로딩 중...</main>;

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-xl font-bold">{outline.source_filename}</h1>
      <p className="mt-1 text-xs text-gray-500">
        Tab/Shift+Tab으로 문단 레벨을 조정하세요. ⚠️ 표시는 휴리스틱 추정 결과입니다.
      </p>

      <div className="mt-4 flex items-center gap-3">
        <select
          className="rounded border px-3 py-2"
          value={selectedTpl}
          onChange={(e) => setSelectedTpl(e.target.value)}
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}{t.is_builtin ? " (빌트인)" : ""}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleRender}
          disabled={busy || !selectedTpl}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {busy ? "변환 중..." : "변환 + 다운로드"}
        </button>
        <button type="button" onClick={() => router.push("/dashboard")} className="rounded border px-4 py-2">
          히스토리
        </button>
      </div>

      <div className="mt-6">
        <OutlineEditor initial={outline} onChange={handleSave} />
      </div>
    </main>
  );
}
```

- [ ] **Step 6: `dashboard/page.tsx` (히스토리, Server Component)**

```tsx
import Link from "next/link";
import { fetchMe } from "@/lib/auth";
import { redirect } from "next/navigation";

async function fetchJobs() {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const token = store.get("access_token")?.value;
  if (!token) return [];
  const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://backend:8000";
  const r = await fetch(`${BASE}/jobs`, {
    headers: { Cookie: `access_token=${token}` },
    cache: "no-store",
  });
  if (!r.ok) return [];
  return (await r.json()) as { id: string; original_filename: string; status: string; created_at: string }[];
}

export default async function DashboardPage() {
  const me = await fetchMe();
  if (!me) redirect("/login");
  const jobs = await fetchJobs();

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">히스토리</h1>
        <Link href="/" className="rounded border px-3 py-1 text-sm">새 변환</Link>
      </header>

      <ul className="mt-6 flex flex-col gap-2">
        {jobs.map((j) => (
          <li key={j.id} className="rounded border px-4 py-3">
            <Link href={`/editor/${j.id}`} className="block">
              <p className="font-medium">{j.original_filename}</p>
              <p className="text-xs text-gray-500">
                {j.status} · {new Date(j.created_at).toLocaleString("ko-KR")}
              </p>
            </Link>
          </li>
        ))}
        {jobs.length === 0 ? <p className="text-sm text-gray-500">변환 이력이 없습니다.</p> : null}
      </ul>
    </main>
  );
}
```

- [ ] **Step 7: 빌드 검증**

```bash
cd frontend && npm run build
```
Expected: 빌드 성공.

- [ ] **Step 8: Commit**

```bash
git add frontend/components/outline-editor/ frontend/app/page.tsx frontend/app/editor/ frontend/app/dashboard/
git commit -m "feat(frontend): add upload form, outline editor with Tab-indent levels, render/download"
```

---

## Task 16: Frontend Dockerfile

**Files:**
- Create: `frontend/Dockerfile`, `frontend/.dockerignore`

- [ ] **Step 1: `frontend/.dockerignore`**

```dockerignore
node_modules/
.next/
*.md
.env*
```

- [ ] **Step 2: `frontend/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --gid 1000 app && useradd --uid 1000 --gid app --shell /bin/bash --create-home app
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public
USER app
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 3: 빌드 검증**

```bash
cd frontend && DOCKER_BUILDKIT=1 docker build -t word-templator-frontend:test .
```
Expected: 빌드 성공.

- [ ] **Step 4: Commit**

```bash
git add frontend/Dockerfile frontend/.dockerignore
git commit -m "feat(frontend): add multi-stage standalone Dockerfile with non-root user"
```

---

## Task 17: Infra (docker-compose + nginx)

**Files:**
- Create: `infra/docker-compose.yml`, `infra/nginx/default.conf`
- Modify: `README.md`

- [ ] **Step 1: `infra/docker-compose.yml`**

```yaml
name: word-templator

services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER}"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped

  backend:
    build:
      context: ../backend
    env_file: ../.env
    environment:
      DATABASE_URL: postgresql+psycopg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
    volumes:
      - filedata:/data
    depends_on:
      db:
        condition: service_healthy
    command: ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
    restart: unless-stopped

  frontend:
    build:
      context: ../frontend
    env_file: ../.env
    depends_on:
      - backend
    restart: unless-stopped

  proxy:
    image: nginx:1.27-alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - frontend
      - backend
    restart: unless-stopped

volumes:
  pgdata:
  filedata:
```

- [ ] **Step 2: `infra/nginx/default.conf`**

```nginx
server {
    listen 80;
    server_name _;
    client_max_body_size 60M;

    location /api/ {
        rewrite ^/api/(.*)$ /$1 break;
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://frontend:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

- [ ] **Step 3: `.env` 생성 (커밋 ❌)**

```bash
cp .env.example .env
# 그 후 JWT_SECRET, POSTGRES_PASSWORD 등을 실제 값으로 채움
sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env && rm .env.bak
```

- [ ] **Step 4: `README.md` 업데이트 — 실행 절차**

`README.md` 에 섹션 추가:
```markdown
## 실행

```bash
# 1. 환경변수 채우기
cp .env.example .env
# JWT_SECRET, POSTGRES_PASSWORD 등을 채움

# 2. 도커 컴포즈 기동
docker compose -f infra/docker-compose.yml up -d --build

# 3. 접속
# http://localhost  (Nginx → Next.js)
# http://localhost/api/health  (FastAPI)
```

## 개발

```bash
# Backend
cd backend
uv pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev
```
```

- [ ] **Step 5: Commit**

```bash
git add infra/ README.md
git commit -m "feat(infra): add docker-compose with Nginx + backend + frontend + Postgres"
```

---

## Task 18: 통합 검증 (로컬 round-trip)

**Files:** (코드 변경 없음, 검증만)

- [ ] **Step 1: 전체 백엔드 테스트 통과 확인**

```bash
docker run --rm -d --name pgtest -e POSTGRES_USER=app -e POSTGRES_PASSWORD=change_me -e POSTGRES_DB=word_templator -p 5432:5432 postgres:16
cd backend
TEST_DATABASE_URL=postgresql+psycopg://app:change_me@localhost:5432/test_wt pytest -v
```
Expected: 전체 PASS.

- [ ] **Step 2: lint/format 통과**

```bash
cd backend && ruff check . && ruff format --check .
cd ../frontend && npm run lint
```
Expected: 통과.

- [ ] **Step 3: 도커 컴포즈 풀스택 기동**

```bash
docker compose -f infra/docker-compose.yml up -d --build
docker compose -f infra/docker-compose.yml ps
```
Expected: 4개 서비스 모두 healthy.

- [ ] **Step 4: 수동 round-trip 시나리오**

브라우저에서:
1. `http://localhost` → 회원가입 (`a@b.com` / `pw1234`)
2. 로그인 → 업로드 폼 노출
3. `backend/tests/fixtures/sample_simple.docx` 업로드 → outline 에디터 진입
4. 첫 H1을 `Tab` 으로 H2로 강등 → 자동 저장 확인
5. "기본 보고서" 선택 → "변환 + 다운로드" 클릭
6. 다운로드된 `.docx` 를 Word/Pages 에서 열기 → 헤딩이 새 폰트/크기로 적용되었는지 확인
7. 헤더 클릭 → "히스토리" → 방금 작업이 목록에 보임

- [ ] **Step 5: 검증 결과 기록**

`docs/superpowers/specs/2026-04-26-word-templator-design.md` 끝에 다음 추가:
```markdown
---
## Phase 1 완료 검증 — 2026-MM-DD
- 백엔드 테스트: NN/NN PASS
- 통합 round-trip: ✅
- 알려진 한계 (Phase 2~5에서 다룰 항목): 표/이미지/필드 placeholder, 빌트인 1개, 커스텀 폼 미구현
```

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-04-26-word-templator-design.md
git commit -m "docs(spec): record Phase 1 completion verification"
```

---

# 검증 / 자체 검토 결과

**Spec coverage 체크 (스펙 §8 Phase 1 항목):**
- 인증 ✅ Task 7
- DB 스키마 + 빌트인 1개 시드 ✅ Task 4 + 5
- .docx 업로드 → 본문/헤딩 파싱 (a+b) ✅ Task 8 + 9
- Outline 에디터 (Tab/Shift+Tab) ✅ Task 15
- 빌트인 적용 → 다운로드 ✅ Task 10 + 12 + 15
- 표/이미지/필드 placeholder ✅ Task 9 (parser) + Task 10 (renderer) + Task 15 (UI)
- R2 한/영 폰트 폴백 단위 테스트 ✅ Task 10
- 헤딩 샘플 round-trip 테스트 ✅ Task 12

**스펙 §3 (아키텍처):** 4-컨테이너 → Task 17 ✅
**스펙 §4 (데이터 모델):** Outline / StyleSpec / DB 스키마 → Task 4, 6 ✅
**스펙 §5 (처리 흐름):** API 13개 중 Phase 1 범위인 11개 → Task 7, 12 ✅
  - Phase 2+ 로 미룬 것: `POST /templates`, `PATCH /templates/{id}`, `DELETE /templates/{id}`, `GET /jobs/{id}/images/{idx}`
**스펙 §10 비기능:** 50MB 상한 ✅ Task 12, JWT httpOnly ✅ Task 7

**Type/이름 일관성 확인:**
- `Block`, `Outline`, `StyleSpec` 모델 — Task 6 정의, Task 9·10·12·15 사용 일치 ✅
- `seed_builtin_templates` — Task 5 정의, Task 5 lifespan + Task 7 conftest 사용 일치 ✅
- `_get_user_job` — Task 12 내부 헬퍼, 동일 파일 내 사용 ✅
- `COOKIE_NAME` — Task 7 정의, Task 7 + (필요시 Task 12) 사용 ✅
- `api.upload`, `api.render`, `api.downloadUrl` — Task 14 정의, Task 15 사용 일치 ✅

**Placeholder 스캔:** 코드 블록 내 TBD/TODO 없음. Phase 2~5로 미룬 부분은 명시적 placeholder 메시지로 표시.

---

# 실행 옵션 (Plan 완료 후)

**Plan complete and saved to `docs/superpowers/plans/2026-04-26-word-templator-phase-1.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Task 단위로 매번 새 서브에이전트 디스패치, 사이에 리뷰. 빠른 반복.

**2. Inline Execution** — 현 세션에서 executing-plans로 실행. 체크포인트마다 멈추고 검토.

**어느 방식으로 진행할까요?**
