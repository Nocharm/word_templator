# SSH 온프레 배포 준비 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** word_templator 를 회사 SSH 호스트에 `git pull && docker compose up -d` 한 줄로 배포할 수 있는 상태로 정리한다 — Python 3.11 통일, SQLite 임베드, 데모 계정/SOP 자동 시드, 인프라 단순화.

**Architecture:** Postgres 컨테이너 제거 → 백엔드 컨테이너 안 SQLite 파일 (`/data/app.db`) 로 통합. 모델/마이그레이션은 dialect-portable 타입(`GUID`, `JSONPortable`)을 거쳐 PG/SQLite 양쪽 호환. 부팅 시 빈 DB 면 admin/user 시드 + 30 페이지 데모 SOP `.docx` 를 user@local.test 의 Job 으로 자동 등록. Nginx 프록시 컨테이너는 현행 유지.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy 2.0 + Alembic, SQLite (운영), Postgres (호환 유지), python-docx, Docker Compose, Next.js, nginx 1.27.

**상위 스펙:** `docs/superpowers/specs/2026-04-28-ssh-onprem-deploy-prep-design.md`

---

## File Structure

### 신규 파일

| 경로 | 책임 |
|------|------|
| `backend/app/db/types.py` | dialect-portable 컬럼 타입(`GUID`, `JSONPortable`) — Postgres 와 SQLite 양쪽에서 같은 모델 코드로 동작 |
| `backend/scripts/__init__.py` | 빈 패키지 마커 (pytest 가 scripts/ 를 import 가능하게) |
| `backend/scripts/build_demo_sop.py` | 30 페이지 데모 SOP `.docx` 결정론적 빌드 (라이브러리 함수 + CLI) |
| `backend/app/templates_seed/demo/__init__.py` | 빈 패키지 마커 (Python 자원 디렉터리 인식용) |
| `backend/app/templates_seed/demo/sop_30p.docx` | 빌드 산출물 — git 에 커밋 |
| `backend/tests/test_db_types.py` | GUID / JSONPortable round-trip 단위 테스트 (SQLite in-memory) |
| `backend/tests/test_seed_demo.py` | 시드 함수(`seed_demo_accounts`, `seed_demo_job`) 단위 + idempotency |
| `backend/tests/test_build_demo_sop.py` | 빌드 스크립트 산출물 검증 (헤딩/표/그림/landscape 섹션 카운트 + 결정성) |

### 수정 파일

| 경로 | 변경 요지 |
|------|-----------|
| `backend/Dockerfile` | python 3.12 → 3.11 |
| `backend/pyproject.toml` | ruff target / mypy 3.12 → 3.11 |
| `backend/app/db/models/user.py` | UUID → GUID |
| `backend/app/db/models/job.py` | UUID → GUID, JSONB → JSONPortable |
| `backend/app/db/models/template.py` | UUID → GUID, JSONB → JSONPortable |
| `backend/app/db/models/feedback.py` | UUID → GUID |
| `backend/app/db/migrations/versions/0001_initial.py` | UUID/JSONB/now() → 호환 타입 |
| `backend/app/db/migrations/versions/0002_original_outline.py` | JSONB → JSONPortable |
| `backend/app/db/migrations/versions/0003_feedback_and_role.py` | UUID/now() → 호환 타입 |
| `backend/app/db/session.py` | SQLite 일 때 `check_same_thread=False` 분기 |
| `backend/app/db/seed.py` | `seed_demo_accounts`, `seed_demo_job` 추가 |
| `backend/app/api/auth.py` | SSO insertion point 주석 |
| `backend/app/main.py` | lifespan 에서 데모 시드 호출 |
| `backend/app/settings.py` | `auth_provider` 필드 추가 |
| `backend/tests/conftest.py` | PG 의존 제거 → SQLite in-memory |
| `infra/docker-compose.yml` | `db` 서비스 + `pgdata` 볼륨 제거 |
| `.env.example` | POSTGRES_* 제거, DATABASE_URL 기본값 SQLite, AUTH_PROVIDER 추가 |
| `README.md` | 실행/계정/데모 안내 갱신, PG 테스트 안내 제거 |
| `CLAUDE.md` | Commands 섹션 PG 안내 제거 |

---

## Phase A — DB Portability Foundation (Tasks 1–5)

PG / SQLite 호환 타입을 도입하고 모델·마이그레이션·세션을 정리. 이 Phase 가 끝나면 PG 와 SQLite 양쪽에서 부팅+pytest 가 통과.

### Task 1: dialect-portable 타입 도입

**Files:**
- Create: `backend/app/db/types.py`
- Test: `backend/tests/test_db_types.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_db_types.py`:

```python
"""GUID / JSONPortable 단위 테스트 — SQLite in-memory."""

import uuid

import pytest
from sqlalchemy import Column, Integer, create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.db.types import GUID, JSONPortable


class _Base(DeclarativeBase):
    pass


class _Sample(_Base):
    __tablename__ = "sample"
    id = Column(Integer, primary_key=True)
    uid = Column(GUID(), nullable=False)
    payload = Column(JSONPortable(), nullable=True)


@pytest.fixture
def session():
    engine = create_engine("sqlite:///:memory:")
    _Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    s = Session()
    yield s
    s.close()


def test_guid_round_trip_uuid(session):
    u = uuid.uuid4()
    session.add(_Sample(uid=u, payload={"x": 1}))
    session.commit()
    row = session.query(_Sample).one()
    assert isinstance(row.uid, uuid.UUID)
    assert row.uid == u


def test_guid_accepts_string_form(session):
    u = uuid.uuid4()
    session.add(_Sample(uid=str(u), payload={}))
    session.commit()
    row = session.query(_Sample).one()
    assert row.uid == u


def test_jsonportable_round_trip_dict(session):
    payload = {"a": 1, "b": [2, 3], "c": {"nested": True}}
    session.add(_Sample(uid=uuid.uuid4(), payload=payload))
    session.commit()
    row = session.query(_Sample).one()
    assert row.payload == payload


def test_jsonportable_unicode(session):
    payload = {"제목": "한글", "items": ["가", "나", "다"]}
    session.add(_Sample(uid=uuid.uuid4(), payload=payload))
    session.commit()
    row = session.query(_Sample).one()
    assert row.payload == payload


def test_jsonportable_none(session):
    session.add(_Sample(uid=uuid.uuid4(), payload=None))
    session.commit()
    row = session.query(_Sample).one()
    assert row.payload is None
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pytest tests/test_db_types.py -v
```

Expected: collection error or import error — `app.db.types` 모듈 없음.

- [ ] **Step 3: Implement the types module**

`backend/app/db/types.py`:

```python
"""Dialect-portable 컬럼 타입 — Postgres / SQLite 양쪽 동일 모델 코드 지원."""

import json
import uuid
from typing import Any

from sqlalchemy import CHAR, TEXT, Dialect, TypeDecorator
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID


class GUID(TypeDecorator):
    """Postgres: native UUID. SQLite: CHAR(36) 문자열."""

    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect: Dialect) -> Any:
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value: Any, dialect: Dialect) -> Any:
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value
        if isinstance(value, uuid.UUID):
            return str(value)
        return value

    def process_result_value(self, value: Any, dialect: Dialect) -> uuid.UUID | None:
        if value is None or isinstance(value, uuid.UUID):
            return value
        return uuid.UUID(value)


class JSONPortable(TypeDecorator):
    """Postgres: JSONB. SQLite: TEXT (JSON 직렬화)."""

    impl = TEXT
    cache_ok = True

    def load_dialect_impl(self, dialect: Dialect) -> Any:
        if dialect.name == "postgresql":
            return dialect.type_descriptor(JSONB())
        return dialect.type_descriptor(TEXT())

    def process_bind_param(self, value: Any, dialect: Dialect) -> Any:
        if value is None or dialect.name == "postgresql":
            return value
        return json.dumps(value, ensure_ascii=False)

    def process_result_value(self, value: Any, dialect: Dialect) -> Any:
        if value is None or dialect.name == "postgresql":
            return value
        if isinstance(value, str):
            return json.loads(value)
        return value
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && pytest tests/test_db_types.py -v
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/db/types.py backend/tests/test_db_types.py
git commit -m "feat(db): GUID / JSONPortable dialect-portable types

Postgres↔SQLite 양쪽 동일한 모델 코드를 쓰기 위한 TypeDecorator.
Postgres 에선 native UUID/JSONB, SQLite 에선 CHAR(36)/TEXT(JSON)."
```

---

### Task 2: 모델 4개를 portable 타입으로 마이그레이션

**Files:**
- Modify: `backend/app/db/models/user.py`
- Modify: `backend/app/db/models/job.py`
- Modify: `backend/app/db/models/template.py`
- Modify: `backend/app/db/models/feedback.py`

기존 PG 테스트 (`tests/test_db_models.py` 등) 가 그대로 통과해야 함 — TypeDecorator 가 PG dialect 에서는 native UUID/JSONB 로 위임하므로 동작 동일.

- [ ] **Step 1: Replace user.py imports + column types**

`backend/app/db/models/user.py` 전체:

```python
"""User 모델 — 인증 단일 출처."""

import uuid
from datetime import datetime
from typing import Literal

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import GUID

# string enum (DB CHECK 제약 — Alembic 마이그레이션 참고).
# DB-level enum 대신 VARCHAR + CHECK 로 둠 — 추후 role 추가가 단순함.
Role = Literal["user", "admin"]


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False, server_default="user")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 2: Replace job.py imports + column types**

`backend/app/db/models/job.py` 전체:

```python
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
```

- [ ] **Step 3: Replace template.py imports + column types**

`backend/app/db/models/template.py` 전체:

```python
"""Template 모델 — 빌트인 + 사용자 커스텀 StyleSpec."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import GUID, JSONPortable


class Template(Base):
    __tablename__ = "templates"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("users.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_builtin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    spec: Mapped[dict] = mapped_column(JSONPortable(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 4: Replace feedback.py imports + column types**

`backend/app/db/models/feedback.py` 전체:

```python
"""Feedback 모델 — 사용자 피드백 (버그/기능요청/기타)."""

import uuid
from datetime import datetime
from typing import Literal

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import GUID

FeedbackCategory = Literal["bug", "feature", "other"]
FeedbackStatus = Literal["open", "in_progress", "closed"]


class Feedback(Base):
    __tablename__ = "feedbacks"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category: Mapped[str] = mapped_column(String(16), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="open")
    admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
```

- [ ] **Step 5: Run full test suite (still on PG via conftest)**

```bash
# Postgres 테스트 컨테이너가 떠있어야 함 (CLAUDE.md 안내 참조)
cd backend && pytest -v
```

Expected: 모든 기존 테스트 통과 (PG dialect 에서는 GUID/JSONPortable 이 native UUID/JSONB 로 위임).

- [ ] **Step 6: Commit**

```bash
git add backend/app/db/models/user.py backend/app/db/models/job.py \
        backend/app/db/models/template.py backend/app/db/models/feedback.py
git commit -m "refactor(db): models use GUID/JSONPortable

PG dialect 에선 그대로 native UUID/JSONB. SQLite 지원 준비 단계.
이 커밋만으로는 동작 변화 없음 (PG 테스트 그대로 통과)."
```

---

### Task 3: Alembic 마이그레이션 3개를 portable 타입으로 수정

**Files:**
- Modify: `backend/app/db/migrations/versions/0001_initial.py`
- Modify: `backend/app/db/migrations/versions/0002_original_outline.py`
- Modify: `backend/app/db/migrations/versions/0003_feedback_and_role.py`

원칙:
- `sa.UUID()` → `app.db.types.GUID()`
- `postgresql.JSONB(astext_type=sa.Text())` → `app.db.types.JSONPortable()`
- `server_default=sa.text("now()")` → `server_default=sa.text("CURRENT_TIMESTAMP")` (양쪽 호환)

- [ ] **Step 1: Rewrite 0001_initial.py**

`backend/app/db/migrations/versions/0001_initial.py` 전체:

```python
"""initial

Revision ID: 0001_initial
Revises:
Create Date: 2026-04-26 18:03:26.761204

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import GUID, JSONPortable

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_table(
        "templates",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("owner_id", GUID(), nullable=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("is_builtin", sa.Boolean(), nullable=False),
        sa.Column("spec", JSONPortable(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "jobs",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("user_id", GUID(), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("source_path", sa.String(length=500), nullable=False),
        sa.Column("result_path", sa.String(length=500), nullable=True),
        sa.Column("applied_template_id", GUID(), nullable=True),
        sa.Column("style_overrides", JSONPortable(), nullable=False),
        sa.Column("outline_json", JSONPortable(), nullable=False),
        sa.Column("error_message", sa.String(length=2000), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["applied_template_id"], ["templates.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("jobs")
    op.drop_table("templates")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
```

- [ ] **Step 2: Rewrite 0002_original_outline.py**

`backend/app/db/migrations/versions/0002_original_outline.py` 전체:

```python
"""add original_outline_json to jobs

Revision ID: 0002_original_outline
Revises: 0001_initial
Create Date: 2026-04-27

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import JSONPortable

revision: str = "0002_original_outline"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "jobs",
        sa.Column("original_outline_json", JSONPortable(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("jobs", "original_outline_json")
```

- [ ] **Step 3: Rewrite 0003_feedback_and_role.py**

`backend/app/db/migrations/versions/0003_feedback_and_role.py` 전체:

```python
"""add users.role and feedbacks table

Revision ID: 0003_feedback_and_role
Revises: 0002_original_outline
Create Date: 2026-04-27

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import GUID

revision: str = "0003_feedback_and_role"
down_revision: str | None = "0002_original_outline"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("role", sa.String(length=16), nullable=False, server_default="user"),
    )
    op.create_check_constraint(
        "ck_users_role", "users", "role IN ('user', 'admin')"
    )

    op.create_table(
        "feedbacks",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("user_id", GUID(), nullable=False),
        sa.Column("category", sa.String(length=16), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="open"),
        sa.Column("admin_note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "category IN ('bug', 'feature', 'other')", name="ck_feedbacks_category"
        ),
        sa.CheckConstraint(
            "status IN ('open', 'in_progress', 'closed')", name="ck_feedbacks_status"
        ),
    )
    op.create_index("ix_feedbacks_user_id", "feedbacks", ["user_id"])
    op.create_index("ix_feedbacks_created_at", "feedbacks", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_feedbacks_created_at", table_name="feedbacks")
    op.drop_index("ix_feedbacks_user_id", table_name="feedbacks")
    op.drop_table("feedbacks")
    op.drop_constraint("ck_users_role", "users", type_="check")
    op.drop_column("users", "role")
```

- [ ] **Step 4: Verify migrations apply cleanly to a fresh SQLite file**

```bash
cd backend && rm -f /tmp/wt_check.db && \
  DATABASE_URL=sqlite:////tmp/wt_check.db JWT_SECRET=test_secret_64_chars_a alembic upgrade head && \
  DATABASE_URL=sqlite:////tmp/wt_check.db JWT_SECRET=test_secret_64_chars_a python -c "
import sqlite3
con = sqlite3.connect('/tmp/wt_check.db')
tables = [r[0] for r in con.execute('select name from sqlite_master where type=\"table\" order by name')]
print(tables)
assert 'users' in tables and 'templates' in tables and 'jobs' in tables and 'feedbacks' in tables
"
```

Expected: alembic 출력 마지막 줄에 `Running upgrade  -> 0001_initial`, `0001_initial -> 0002_original_outline`, `0002_original_outline -> 0003_feedback_and_role`. Python 한 줄 스크립트가 4개 테이블 print + AssertError 없이 종료.

- [ ] **Step 5: Verify migrations still apply cleanly to a fresh Postgres**

```bash
docker exec word-templator-db-1 psql -U app -d word_templator -c "DROP DATABASE IF EXISTS wt_check;"
docker exec word-templator-db-1 psql -U app -d word_templator -c "CREATE DATABASE wt_check OWNER app;"
cd backend && DATABASE_URL=postgresql+psycopg://app:change_me@localhost:5432/wt_check JWT_SECRET=test_secret_64_chars_a alembic upgrade head
```

Expected: 동일하게 3개 revision 적용 완료. (포트는 docker-compose 의 db 가 호스트에 노출되지 않으므로 호스트에서 실행이 어려우면 컨테이너 내부 실행으로 대체 가능 — 핵심은 PG dialect 에서도 깨지지 않음을 확인하는 것.)

- [ ] **Step 6: Commit**

```bash
git add backend/app/db/migrations/versions/0001_initial.py \
        backend/app/db/migrations/versions/0002_original_outline.py \
        backend/app/db/migrations/versions/0003_feedback_and_role.py
git commit -m "refactor(db/migrations): GUID/JSONPortable + CURRENT_TIMESTAMP

마이그레이션 0001~0003 을 PG/SQLite 양쪽 호환 타입으로 수정.
회사 배포 전이라 stamp 호환은 신경쓰지 않음."
```

---

### Task 4: db/session.py 에 SQLite-specific connect_args 분기

**Files:**
- Modify: `backend/app/db/session.py`

- [ ] **Step 1: Replace session.py**

`backend/app/db/session.py` 전체:

```python
"""DB 엔진 + sessionmaker."""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.settings import get_settings

_settings = get_settings()

# SQLite 는 기본으로 동일 연결을 다른 스레드에서 못 쓰게 막음.
# FastAPI 가 Depends(get_db) 를 thread pool 에서 호출하므로 풀어줘야 함.
_connect_args: dict = {}
if _settings.database_url.startswith("sqlite"):
    _connect_args["check_same_thread"] = False

engine = create_engine(_settings.database_url, pool_pre_ping=True, connect_args=_connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 2: Verify import doesn't crash on either dialect**

```bash
cd backend && \
  DATABASE_URL=sqlite:///:memory: JWT_SECRET=test_secret_64_chars_a python -c "from app.db.session import engine; print(engine.dialect.name)" && \
  DATABASE_URL=postgresql+psycopg://app:change_me@localhost:5432/word_templator JWT_SECRET=test_secret_64_chars_a python -c "from app.db.session import engine; print(engine.dialect.name)"
```

Expected: `sqlite` 첫 줄, `postgresql` 둘째 줄.

- [ ] **Step 3: Commit**

```bash
git add backend/app/db/session.py
git commit -m "fix(db/session): SQLite check_same_thread=False 분기

FastAPI 가 dependency 를 thread pool 에서 실행 → SQLite 기본 격리는
SameThread 체크에 막힘. Postgres 동작은 변경 없음."
```

---

### Task 5: conftest.py 를 SQLite in-memory 로 전환

**Files:**
- Modify: `backend/tests/conftest.py`

- [ ] **Step 1: Replace conftest.py**

`backend/tests/conftest.py` 전체:

```python
"""공용 fixture — 테스트용 DB + TestClient.

⚠️ 환경 설정은 다른 import 보다 먼저 실행되어야 한다 (`app.db.session` 이 모듈 로드 시
`get_settings()` 를 호출하면서 `Settings(database_url=...)` 가 lru_cache 로 고정됨).
"""

import os

# 테스트는 항상 SQLite in-memory — PG 컨테이너 의존 제거.
# CI 에서 PG 호환을 검증하려면 별도 잡으로 TEST_DATABASE_URL=postgresql+... 주입.
_DEFAULT_TEST_DB = "sqlite+pysqlite:///:memory:"
_DEFAULT_JWT_SECRET = "test_secret_64_chars_for_dev_only_change_me_not_for_prod_a"

os.environ.setdefault("TEST_DATABASE_URL", _DEFAULT_TEST_DB)
# DATABASE_URL 은 항상 TEST_DATABASE_URL 로 강제 — .env 의 운영 DB 가
# pydantic-settings 로 새어 들어가는 것 방지.
os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
os.environ.setdefault("JWT_SECRET", _DEFAULT_JWT_SECRET)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.api.deps import get_db  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.seed import seed_builtin_templates  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture
def db_engine():
    db_url = os.environ["TEST_DATABASE_URL"]
    # SQLite in-memory 에선 매 connect 마다 새 DB → 같은 메모리 DB 유지하려면 StaticPool
    # + check_same_thread=False (FastAPI thread pool 호환).
    is_sqlite = db_url.startswith("sqlite")
    kwargs: dict = {}
    if is_sqlite:
        kwargs["connect_args"] = {"check_same_thread": False}
        kwargs["poolclass"] = StaticPool
    engine = create_engine(db_url, **kwargs)
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)
    engine.dispose()


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


@pytest.fixture(autouse=True)
def _data_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    yield
```

- [ ] **Step 2: Run full test suite on SQLite**

```bash
cd backend && pytest -v
```

Expected: 기존 모든 테스트 통과. 만약 깨지는 테스트가 있다면 PG-only SQL (예: `CAST AS JSONB`, raw `now()` SQL) 을 사용하는 곳 — 케이스별로 portable 형태로 수정. (현재 코드 베이스에 그런 곳이 있는지 보장은 못 하므로 발견 시 별도 fix-step 추가.)

- [ ] **Step 3: Commit**

```bash
git add backend/tests/conftest.py
git commit -m "test(conftest): SQLite in-memory 로 전환 — pgtest 컨테이너 의존 제거

TEST_DATABASE_URL 을 set 하면 PG 로 회귀 가능 (CI 호환 검증용).
StaticPool + check_same_thread=False 로 in-memory DB 가 fixture 내내 유지."
```

---

## Phase B — Python 3.11 (Tasks 6–7)

### Task 6: Dockerfile python 3.12 → 3.11

**Files:**
- Modify: `backend/Dockerfile`

- [ ] **Step 1: Replace Dockerfile**

`backend/Dockerfile` 전체:

```dockerfile
# syntax=docker/dockerfile:1
FROM python:3.11-slim AS builder

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

FROM python:3.11-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends libxml2 libxslt1.1 gosu

COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

RUN groupadd --gid 1000 app && useradd --uid 1000 --gid app --shell /bin/bash --create-home app
WORKDIR /app
COPY --chown=app:app app ./app
COPY --chown=app:app alembic.ini ./

# Entrypoint: fix /data ownership (volume is root-owned on first start), then drop to app
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Build the image and verify Python version**

```bash
docker build -t word-templator-backend:py311 backend/ && \
  docker run --rm word-templator-backend:py311 python --version
```

Expected: `Python 3.11.x` (마지막 줄).

- [ ] **Step 3: Commit**

```bash
git add backend/Dockerfile
git commit -m "build(backend): Python 3.12 → 3.11 (회사 표준 런타임)"
```

---

### Task 7: pyproject.toml 의 ruff/mypy target 3.12 → 3.11

**Files:**
- Modify: `backend/pyproject.toml`

- [ ] **Step 1: Replace pyproject.toml**

`backend/pyproject.toml` 전체:

```toml
[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP", "W"]
ignore = ["B008"]  # FastAPI uses Depends/File in argument defaults by design

[tool.mypy]
python_version = "3.11"
strict = true
plugins = ["pydantic.mypy"]

[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"

[tool.pyright]
venvPath = "."
venv = ".venv"
include = ["app", "tests"]
extraPaths = ["."]
```

- [ ] **Step 2: Verify ruff still passes**

```bash
cd backend && ruff check . && ruff format --check .
```

Expected: `All checks passed!` 등.

- [ ] **Step 3: Commit**

```bash
git add backend/pyproject.toml
git commit -m "build(backend): ruff/mypy target Python 3.11"
```

---

## Phase C — Settings · Auth · Demo Accounts (Tasks 8–11)

### Task 8: Settings 에 AUTH_PROVIDER 필드 추가

**Files:**
- Modify: `backend/app/settings.py`

- [ ] **Step 1: Add field to Settings**

`backend/app/settings.py` — `admin_emails` 필드 바로 다음 줄에 추가:

```python
    # 콤마 구분 이메일 목록 — signup 시 자동 admin 권한 부여.
    admin_emails: str = Field("", alias="ADMIN_EMAILS")
    # 인증 공급자 — "local" 만 구현. 사내 SSO/OIDC 도입 시 분기 추가.
    auth_provider: str = Field("local", alias="AUTH_PROVIDER")
```

- [ ] **Step 2: Verify import works**

```bash
cd backend && AUTH_PROVIDER=local DATABASE_URL=sqlite:///:memory: JWT_SECRET=test_secret_64_chars_a python -c "from app.settings import get_settings; print(get_settings().auth_provider)"
```

Expected: `local`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/settings.py
git commit -m "feat(settings): AUTH_PROVIDER 필드 (local 만 구현)"
```

---

### Task 9: auth.py 에 SSO insertion point 주석

**Files:**
- Modify: `backend/app/api/auth.py`

- [ ] **Step 1: Insert comment after settings import**

`backend/app/api/auth.py` 의 `_settings = get_settings()` 다음 줄에 주석 추가:

```python
router = APIRouter(prefix="/auth", tags=["auth"])
_settings = get_settings()

# NOTE: SSO insertion point — settings.auth_provider == "oidc" 분기는
# 사내 IdP 결정 후 추가. 현재는 "local" (email/pw + JWT 쿠키) 만 동작.
```

- [ ] **Step 2: Verify auth tests still pass**

```bash
cd backend && pytest tests/test_auth.py -v
```

Expected: 모두 통과.

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/auth.py
git commit -m "docs(auth): SSO insertion point 주석"
```

---

### Task 10: seed_demo_accounts 추가 (TDD)

**Files:**
- Modify: `backend/app/db/seed.py`
- Test: `backend/tests/test_seed_demo.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_seed_demo.py` 신규:

```python
"""seed_demo_accounts / seed_demo_job 단위 + idempotency."""

from app.db.models import User
from app.db.seed import (
    DEMO_ADMIN_EMAIL,
    DEMO_ADMIN_PASSWORD,
    DEMO_USER_EMAIL,
    DEMO_USER_PASSWORD,
    seed_demo_accounts,
)
from app.core.security import verify_password


def test_seed_demo_accounts_creates_admin_and_user(db_session):
    seed_demo_accounts(db_session)
    admin = db_session.query(User).filter_by(email=DEMO_ADMIN_EMAIL).one()
    user = db_session.query(User).filter_by(email=DEMO_USER_EMAIL).one()
    assert admin.role == "admin"
    assert user.role == "user"
    assert verify_password(DEMO_ADMIN_PASSWORD, admin.password_hash)
    assert verify_password(DEMO_USER_PASSWORD, user.password_hash)


def test_seed_demo_accounts_is_idempotent(db_session):
    seed_demo_accounts(db_session)
    seed_demo_accounts(db_session)
    seed_demo_accounts(db_session)
    assert db_session.query(User).filter_by(email=DEMO_ADMIN_EMAIL).count() == 1
    assert db_session.query(User).filter_by(email=DEMO_USER_EMAIL).count() == 1


def test_seed_demo_accounts_skips_when_user_already_exists(db_session):
    # 사용자가 이미 admin@local.test 로 가입한 상태를 가정 — 비밀번호 덮어쓰지 않음
    from app.core.security import hash_password
    db_session.add(User(
        email=DEMO_ADMIN_EMAIL,
        password_hash=hash_password("custom_password"),
        role="admin",
    ))
    db_session.commit()
    seed_demo_accounts(db_session)
    admin = db_session.query(User).filter_by(email=DEMO_ADMIN_EMAIL).one()
    assert verify_password("custom_password", admin.password_hash)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pytest tests/test_seed_demo.py -v
```

Expected: ImportError — `DEMO_ADMIN_EMAIL` 등이 `app.db.seed` 에 없음.

- [ ] **Step 3: Add seed_demo_accounts to seed.py**

`backend/app/db/seed.py` — 기존 `seed_builtin_templates` 다음에 추가:

```python
"""빌트인 StyleSpec 시드 + 시연용 계정/Job 시드 — idempotent."""

import json
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.models import Template, User

SEED_DIR = Path(__file__).resolve().parent.parent / "templates_seed"

# 시연/QA 전용 계정 — README 에 노출. 운영 환경에서는 즉시 비밀번호 변경.
DEMO_ADMIN_EMAIL = "admin@local.test"
DEMO_ADMIN_PASSWORD = "admin1234"
DEMO_USER_EMAIL = "user@local.test"
DEMO_USER_PASSWORD = "user1234"


def seed_builtin_templates(db: Session) -> None:
    for path in sorted(SEED_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        existing = db.query(Template).filter_by(is_builtin=True, name=data["name"]).one_or_none()
        if existing is None:
            db.add(Template(name=data["name"], is_builtin=True, spec=data["spec"]))
        else:
            # 빌트인은 시드 JSON을 단일 출처로 — 매 부팅 시 spec 갱신
            existing.spec = data["spec"]
    db.commit()


def seed_demo_accounts(db: Session) -> None:
    """admin/user 시연 계정을 빈 DB 에 1회 생성. 이미 존재하면 건드리지 않음."""
    _ensure_user(db, DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD, role="admin")
    _ensure_user(db, DEMO_USER_EMAIL, DEMO_USER_PASSWORD, role="user")
    db.commit()


def _ensure_user(db: Session, email: str, password: str, *, role: str) -> None:
    if db.query(User).filter_by(email=email).one_or_none() is not None:
        return
    db.add(User(email=email, password_hash=hash_password(password), role=role))
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && pytest tests/test_seed_demo.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/db/seed.py backend/tests/test_seed_demo.py
git commit -m "feat(seed): seed_demo_accounts (admin + user)

빈 DB 일 때만 admin@local.test / user@local.test 1명씩 생성.
README 에 비밀번호 노출 — 시연/QA 전용."
```

---

### Task 11: lifespan 에서 seed_demo_accounts 호출

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Wire seed_demo_accounts**

`backend/app/main.py` 전체:

```python
"""FastAPI 앱 진입점."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.feedback import router as feedback_router
from app.api.images import router as images_router
from app.api.jobs import router as jobs_router
from app.api.templates import router as templates_router
from app.db.seed import seed_builtin_templates, seed_demo_accounts
from app.db.session import SessionLocal
from app.settings import get_settings

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    db = SessionLocal()
    try:
        seed_builtin_templates(db)
        seed_demo_accounts(db)
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
```

- [ ] **Step 2: Smoke-test the lifespan against SQLite**

```bash
cd backend && DATABASE_URL=sqlite:///:memory: JWT_SECRET=test_secret_64_chars_a python -c "
from fastapi.testclient import TestClient
from app.main import app
with TestClient(app) as c:
    r = c.post('/auth/login', json={'email': 'admin@local.test', 'password': 'admin1234'})
    print(r.status_code, r.json())
    assert r.status_code == 200
"
```

Expected: `200 {'status': 'ok'}`.

- [ ] **Step 3: Run full test suite**

```bash
cd backend && pytest -v
```

Expected: 모두 통과 (lifespan 변경이 다른 테스트 깨뜨리지 않음 확인).

- [ ] **Step 4: Commit**

```bash
git add backend/app/main.py
git commit -m "feat(main): lifespan 에서 seed_demo_accounts 호출"
```

---

## Phase D — 데모 SOP (Tasks 12–15)

### Task 12: build_demo_sop.py — 결정론적 30p .docx 빌드

**Files:**
- Create: `backend/scripts/__init__.py`
- Create: `backend/scripts/build_demo_sop.py`
- Create: `backend/tests/test_build_demo_sop.py`

문서 구조 (스펙 4.4.1 기준):
- 헤더 "Demo SOP — Word Templator 시연용" (전 페이지)
- H1×5 — 각 H1 아래 H2×2~3, 일부 H2 아래 H3×1~2, 일부 H3 아래 H4×1
- 표 4개 (caption: 1·3 번만, 2·4 번 누락)
- 그림 3개 (caption: 1 번만, 2·3 번 누락)
- 3장 본문 중간에 landscape 섹션 1개 + 가로 표 1개, 이후 portrait 복귀
- 약 30 페이지 (paragraph 분량으로 채움)

- [ ] **Step 1: Write the failing test**

`backend/tests/test_build_demo_sop.py`:

```python
"""build_demo_sop — 산출물 검증 + 결정성."""

from pathlib import Path

import pytest
from docx import Document
from docx.enum.section import WD_ORIENT

from scripts.build_demo_sop import OUTPUT_PATH, build_demo_sop_bytes


@pytest.fixture
def doc_bytes() -> bytes:
    return build_demo_sop_bytes()


@pytest.fixture
def doc(doc_bytes, tmp_path) -> Document:
    p = tmp_path / "demo.docx"
    p.write_bytes(doc_bytes)
    return Document(str(p))


def _heading_levels(doc: Document) -> list[int]:
    levels: list[int] = []
    for p in doc.paragraphs:
        style = (p.style.name or "").strip()
        if style.startswith("Heading "):
            try:
                levels.append(int(style.split()[1]))
            except (IndexError, ValueError):
                continue
    return levels


def test_has_4_levels_of_headings(doc: Document) -> None:
    levels = _heading_levels(doc)
    assert 1 in levels
    assert 2 in levels
    assert 3 in levels
    assert 4 in levels


def test_h1_count_is_5(doc: Document) -> None:
    levels = _heading_levels(doc)
    assert sum(1 for x in levels if x == 1) == 5


def test_table_count_is_5(doc: Document) -> None:
    # 본문 4개 + landscape 섹션 가로 표 1개
    assert len(doc.tables) == 5


def test_image_count_is_3(doc: Document) -> None:
    drawings = doc.element.body.findall(
        ".//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}drawing"
    )
    assert len(drawings) == 3


def test_has_landscape_section(doc: Document) -> None:
    orientations = [s.orientation for s in doc.sections]
    assert WD_ORIENT.LANDSCAPE in orientations
    assert WD_ORIENT.PORTRAIT in orientations


def test_has_header_text(doc: Document) -> None:
    for section in doc.sections:
        header_text = "\n".join(p.text for p in section.header.paragraphs)
        if "Demo SOP" in header_text and "시연용" in header_text:
            return
    raise AssertionError("expected 'Demo SOP — Word Templator 시연용' header on at least one section")


def test_deterministic_bytes() -> None:
    a = build_demo_sop_bytes()
    b = build_demo_sop_bytes()
    assert a == b, "build_demo_sop_bytes 가 동일 호출에 동일 바이트를 산출해야 함"


def test_output_path_constant_points_under_templates_seed_demo() -> None:
    assert OUTPUT_PATH.name == "sop_30p.docx"
    assert OUTPUT_PATH.parent.name == "demo"
    assert OUTPUT_PATH.parent.parent.name == "templates_seed"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pytest tests/test_build_demo_sop.py -v
```

Expected: ImportError — `scripts.build_demo_sop` 모듈 없음.

- [ ] **Step 3: Implement scripts/__init__.py**

`backend/scripts/__init__.py`:

```python
"""run-once 빌드 스크립트 모음 (예: 데모 .docx 생성). 런타임 import 용 아님."""
```

- [ ] **Step 4: Implement build_demo_sop.py**

`backend/scripts/build_demo_sop.py`:

```python
"""30 페이지 분량 데모 SOP `.docx` 결정론적 빌드.

실행:
    cd backend && python -m scripts.build_demo_sop

산출물: backend/app/templates_seed/demo/sop_30p.docx
"""

import io
import struct
import sys
import zipfile
import zlib
from datetime import datetime
from pathlib import Path

from docx import Document
from docx.document import Document as DocxDocument
from docx.enum.section import WD_ORIENT, WD_SECTION
from docx.shared import Cm, Inches, Pt

# 프로젝트 루트(backend/) 기준 산출물 경로.
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = _BACKEND_ROOT / "app" / "templates_seed" / "demo" / "sop_30p.docx"

# 결정성을 위해 zip entry timestamp 를 고정 (1980-01-01 00:00:00 = zip epoch).
_FIXED_ZIP_DT = (1980, 1, 1, 0, 0, 0)
_FIXED_DOC_DT = datetime(2026, 1, 1, 0, 0, 0)

# 1×1 단색 PNG (회색) — 결정성을 위해 raw bytes 고정.
# https://en.wikipedia.org/wiki/Portable_Network_Graphics 의 최소 PNG 구조.
def _make_solid_png(rgb: tuple[int, int, int]) -> bytes:
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = b"IHDR" + struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    ihdr_chunk = struct.pack(">I", len(ihdr) - 4) + ihdr + struct.pack(">I", zlib.crc32(ihdr))
    raw = b"\x00" + bytes(rgb)
    idat_data = zlib.compress(raw, 9)
    idat = b"IDAT" + idat_data
    idat_chunk = struct.pack(">I", len(idat) - 4) + idat + struct.pack(">I", zlib.crc32(idat))
    iend = b"IEND"
    iend_chunk = struct.pack(">I", 0) + iend + struct.pack(">I", zlib.crc32(iend))
    return sig + ihdr_chunk + idat_chunk + iend_chunk


_PNG_GRAY = _make_solid_png((180, 180, 180))
_PNG_BLUE = _make_solid_png((90, 130, 200))
_PNG_GREEN = _make_solid_png((130, 180, 130))
_IMAGES = [_PNG_GRAY, _PNG_BLUE, _PNG_GREEN]

# 헤딩 트리 — 4단계까지. 결정적 — 동일 코드, 동일 산출.
_CHAPTERS = [
    ("1. 목적과 적용 범위", [
        ("1.1 목적", []),
        ("1.2 적용 범위", [
            ("1.2.1 포함되는 업무", []),
            ("1.2.2 제외되는 업무", []),
        ]),
    ]),
    ("2. 정의와 약어", [
        ("2.1 용어 정의", [
            ("2.1.1 일반 용어", [("2.1.1.1 핵심 약어", [])]),
            ("2.1.2 시스템 용어", []),
        ]),
        ("2.2 참조 문서", []),
    ]),
    ("3. 책임과 권한", [
        ("3.1 부서별 책임", [
            ("3.1.1 운영팀", []),
            ("3.1.2 품질팀", [("3.1.2.1 검토 절차", [])]),
        ]),
        ("3.2 권한 위임", []),
        ("3.3 비상 권한", []),
    ]),
    ("4. 절차 상세", [
        ("4.1 사전 준비", []),
        ("4.2 실행 단계", [
            ("4.2.1 1 단계 — 입력 검증", []),
            ("4.2.2 2 단계 — 처리", [("4.2.2.1 예외 처리", [])]),
            ("4.2.3 3 단계 — 산출물 검수", []),
        ]),
        ("4.3 사후 검토", []),
    ]),
    ("5. 기록 관리", [
        ("5.1 보존 기간", []),
        ("5.2 폐기 절차", []),
    ]),
]

_LOREM = (
    "본 절차는 표준화된 워크플로우를 정의하며 모든 관련 업무에 일관되게 적용된다. "
    "수행자는 각 단계에서 입력·산출물·책임자를 명확히 식별하고, 이상 발견 시 즉시 보고한다. "
    "본 문서는 분기마다 검토되며, 조직 변경·법규 변경·시스템 변경 시 즉시 개정한다. "
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor "
    "incididunt ut labore et dolore magna aliqua."
)

# landscape 섹션 안에 들어갈 가로 표 (5 컬럼 × 6 행).
_LANDSCAPE_TABLE = [
    ["단계", "담당", "입력", "처리", "산출물", "검토"],
    ["1", "운영팀", "신청서", "검증", "검증 보고", "품질팀"],
    ["2", "품질팀", "검증 보고", "분석", "분석 결과", "관리책임자"],
    ["3", "운영팀", "분석 결과", "조치", "조치 기록", "품질팀"],
    ["4", "관리팀", "조치 기록", "승인", "승인 문서", "경영자"],
    ["5", "전사", "승인 문서", "배포", "배포 확인", "내부감사"],
]

# 본문 표 4개. 일부만 캡션.
_TABLES = [
    {
        "caption": "표 1. 항목별 책임자",
        "rows": [
            ["항목", "주관", "지원"],
            ["입력 검증", "운영팀", "품질팀"],
            ["처리", "운영팀", "시스템팀"],
            ["검수", "품질팀", "관리팀"],
        ],
    },
    {
        "caption": None,  # 캡션 누락
        "rows": [
            ["문서 ID", "버전", "제정일"],
            ["SOP-001", "v1.0", "2026-01-15"],
            ["SOP-002", "v2.1", "2026-03-02"],
        ],
    },
    {
        "caption": "표 3. 검토 주기",
        "rows": [
            ["문서 종류", "검토 주기", "승인자"],
            ["1급", "분기", "경영자"],
            ["2급", "반기", "관리책임자"],
            ["3급", "연간", "팀장"],
        ],
    },
    {
        "caption": None,  # 캡션 누락
        "rows": [
            ["KPI", "목표", "측정 주기"],
            ["불량률", "<0.5%", "월간"],
            ["처리 시간", "<24h", "주간"],
        ],
    },
]


def _add_image(doc: DocxDocument, png_bytes: bytes, *, caption: str | None) -> None:
    para = doc.add_paragraph()
    run = para.add_run()
    run.add_picture(io.BytesIO(png_bytes), width=Inches(2.0))
    if caption:
        cap = doc.add_paragraph(caption)
        cap.runs[0].font.size = Pt(9)


def _add_table(doc: DocxDocument, rows: list[list[str]], *, caption: str | None) -> None:
    if caption:
        cap = doc.add_paragraph(caption)
        cap.runs[0].font.size = Pt(9)
    table = doc.add_table(rows=len(rows), cols=len(rows[0]))
    table.style = "Table Grid"
    for ri, row in enumerate(rows):
        for ci, cell_text in enumerate(row):
            table.rows[ri].cells[ci].text = cell_text


def _add_paragraph_block(doc: DocxDocument, lines: int) -> None:
    for _ in range(lines):
        doc.add_paragraph(_LOREM)


def _set_landscape(section) -> None:
    section.orientation = WD_ORIENT.LANDSCAPE
    # 가로 / 세로를 swap
    new_w, new_h = section.page_height, section.page_width
    section.page_width = new_w
    section.page_height = new_h
    section.left_margin = Cm(2.0)
    section.right_margin = Cm(2.0)


def _set_portrait(section) -> None:
    section.orientation = WD_ORIENT.PORTRAIT
    new_w, new_h = section.page_height, section.page_width
    section.page_width = new_w
    section.page_height = new_h


def _add_header(section, text: str) -> None:
    para = section.header.paragraphs[0]
    para.text = text


def _build_document() -> DocxDocument:
    doc = Document()

    # 첫 섹션 portrait + 헤더.
    section = doc.sections[0]
    _add_header(section, "Demo SOP — Word Templator 시연용")

    # 표지/소개
    title = doc.add_heading("표준 운영 절차 (Demo SOP)", level=0)
    doc.add_paragraph("문서 번호: SOP-DEMO-001 / 개정일: 2026-01-01 / 작성: Word Templator")
    _add_paragraph_block(doc, 2)

    table_iter = iter(_TABLES)
    image_iter = iter(_IMAGES)
    image_caption_iter = iter(["그림 1. 프로세스 흐름", None, None])
    landscape_inserted = False

    def _emit_heading_subtree(items, table_iter, image_iter, image_caption_iter):
        nonlocal landscape_inserted
        for title_text, children in items:
            level = title_text.count(".") + 1  # "1." → 1, "1.1" → 2 …
            doc.add_heading(title_text, level=min(level, 4))
            _add_paragraph_block(doc, 4)
            # 표/그림은 H1 단위로 1개씩 분배
            if level == 1:
                try:
                    t = next(table_iter)
                    _add_table(doc, t["rows"], caption=t["caption"])
                    _add_paragraph_block(doc, 2)
                except StopIteration:
                    pass
                try:
                    img = next(image_iter)
                    cap = next(image_caption_iter)
                    _add_image(doc, img, caption=cap)
                    _add_paragraph_block(doc, 2)
                except StopIteration:
                    pass
            # 3 장 끝에서 landscape 섹션 삽입
            if level == 1 and title_text.startswith("3.") and not landscape_inserted:
                landscape_section = doc.add_section(WD_SECTION.NEW_PAGE)
                _set_landscape(landscape_section)
                _add_header(landscape_section, "Demo SOP — Word Templator 시연용")
                doc.add_paragraph("부록 A. 가로 페이지 — 단계별 책임 매트릭스").runs[0].font.size = Pt(11)
                _add_table(doc, _LANDSCAPE_TABLE, caption=None)
                _add_paragraph_block(doc, 2)
                portrait_section = doc.add_section(WD_SECTION.NEW_PAGE)
                _set_portrait(portrait_section)
                _add_header(portrait_section, "Demo SOP — Word Templator 시연용")
                landscape_inserted = True
            _emit_heading_subtree(children, table_iter, image_iter, image_caption_iter)

    _emit_heading_subtree(_CHAPTERS, table_iter, image_iter, image_caption_iter)

    # 30 페이지 분량을 채우기 위한 마무리 본문.
    doc.add_heading("부록 B. 추가 참고", level=1)
    _add_paragraph_block(doc, 30)

    # core properties 고정 (timestamp 결정성).
    doc.core_properties.author = "Word Templator"
    doc.core_properties.title = "Demo SOP"
    doc.core_properties.created = _FIXED_DOC_DT
    doc.core_properties.modified = _FIXED_DOC_DT
    doc.core_properties.last_modified_by = ""
    return doc


def _normalize_zip_bytes(blob: bytes) -> bytes:
    """zip entry 의 timestamp 와 외부 attr 을 고정해 결정성 확보."""
    src = zipfile.ZipFile(io.BytesIO(blob))
    out = io.BytesIO()
    dst = zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED)
    try:
        for info in sorted(src.infolist(), key=lambda i: i.filename):
            data = src.read(info.filename)
            new_info = zipfile.ZipInfo(filename=info.filename, date_time=_FIXED_ZIP_DT)
            new_info.compress_type = zipfile.ZIP_DEFLATED
            new_info.external_attr = info.external_attr
            dst.writestr(new_info, data)
    finally:
        dst.close()
        src.close()
    return out.getvalue()


def build_demo_sop_bytes() -> bytes:
    """결정론적으로 동일한 .docx 바이트를 반환."""
    doc = _build_document()
    buf = io.BytesIO()
    doc.save(buf)
    return _normalize_zip_bytes(buf.getvalue())


def main() -> int:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_bytes(build_demo_sop_bytes())
    print(f"wrote {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_build_demo_sop.py -v
```

Expected: 8 passed. 만약 한두 어서션이 정확한 카운트와 어긋나면 (예: 표 5개 vs 6개) — 빌더가 의도와 정확히 일치하도록 `_TABLES` / `_LANDSCAPE_TABLE` 또는 `_IMAGES` 길이를 조정. 어서션은 스펙의 "of-record" 사양이므로 빌더 쪽을 맞춤.

- [ ] **Step 6: Commit**

```bash
git add backend/scripts/__init__.py backend/scripts/build_demo_sop.py \
        backend/tests/test_build_demo_sop.py
git commit -m "feat(scripts): build_demo_sop — 30p 결정론적 .docx 빌더

H1×5 + 4단 헤딩, 표 5개(2개 캡션 누락), 그림 3개(2개 캡션 누락),
중간 landscape 섹션 1개. zip entry timestamp 고정으로 동일 호출 동일 바이트."
```

---

### Task 13: sop_30p.docx 산출물 생성 + git 커밋

**Files:**
- Create: `backend/app/templates_seed/demo/__init__.py`
- Create: `backend/app/templates_seed/demo/sop_30p.docx`

- [ ] **Step 1: Create demo package marker**

`backend/app/templates_seed/demo/__init__.py`:

```python
"""데모 시연용 자원 (현재는 sop_30p.docx 만)."""
```

- [ ] **Step 2: Run the build script**

```bash
cd backend && python -m scripts.build_demo_sop
```

Expected: `wrote .../app/templates_seed/demo/sop_30p.docx (XXXXX bytes)`.

- [ ] **Step 3: Verify the file is non-trivial size**

```bash
ls -lh backend/app/templates_seed/demo/sop_30p.docx
```

Expected: 30~150 KB 범위 (PNG 압축 + 텍스트).

- [ ] **Step 4: Re-run build and verify byte-identical (determinism)**

```bash
cd backend && \
  cp app/templates_seed/demo/sop_30p.docx /tmp/wt_first.docx && \
  python -m scripts.build_demo_sop && \
  diff -q /tmp/wt_first.docx app/templates_seed/demo/sop_30p.docx
```

Expected: `diff` 출력 없음 (= identical). 만약 다르다면 zip normalization 누락 — `_normalize_zip_bytes` 의 entry 정렬/timestamp/external_attr 검토.

- [ ] **Step 5: Commit (binary 포함)**

```bash
git add backend/app/templates_seed/demo/__init__.py backend/app/templates_seed/demo/sop_30p.docx
git commit -m "data(demo): 30 페이지 데모 SOP .docx 산출물 커밋

build_demo_sop 의 1회 빌드 결과물. 부팅 시 자동 시드되는 Job 의 원본 파일."
```

---

### Task 14: seed_demo_job 추가 (TDD)

**Files:**
- Modify: `backend/app/db/seed.py`
- Modify: `backend/tests/test_seed_demo.py`

- [ ] **Step 1: Append failing tests to test_seed_demo.py**

`backend/tests/test_seed_demo.py` 끝에 추가 (User 는 Task 10 의 top-level import 를 그대로 사용):

```python
from pathlib import Path

from app.db.models import Job
from app.db.seed import DEMO_JOB_FILENAME, seed_demo_job


def test_seed_demo_job_creates_job_for_user(db_session):
    seed_demo_accounts(db_session)
    user = db_session.query(User).filter_by(email=DEMO_USER_EMAIL).one()
    seed_demo_job(db_session, user.id)
    job = db_session.query(Job).filter_by(user_id=user.id).one()
    assert job.original_filename == DEMO_JOB_FILENAME
    assert job.status == "parsed"
    assert isinstance(job.outline_json, dict)
    assert "blocks" in job.outline_json
    # 원본 파일이 디스크에 복사됐는지 — DATA_DIR 은 conftest 의 _data_dir fixture 가 tmp_path 로 픽스
    src = Path(job.source_path)
    assert src.exists() and src.stat().st_size > 1000


def test_seed_demo_job_is_idempotent(db_session):
    seed_demo_accounts(db_session)
    user = db_session.query(User).filter_by(email=DEMO_USER_EMAIL).one()
    seed_demo_job(db_session, user.id)
    seed_demo_job(db_session, user.id)
    seed_demo_job(db_session, user.id)
    assert db_session.query(Job).filter_by(user_id=user.id).count() == 1


def test_seed_demo_job_outline_has_landscape_section(db_session):
    seed_demo_accounts(db_session)
    user = db_session.query(User).filter_by(email=DEMO_USER_EMAIL).one()
    seed_demo_job(db_session, user.id)
    job = db_session.query(Job).filter_by(user_id=user.id).one()
    sections = job.outline_json.get("sections", [])
    assert len(sections) >= 2  # portrait + landscape (+ portrait 복귀)
    orientations = {s.get("orientation") for s in sections}
    assert "landscape" in orientations
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_seed_demo.py::test_seed_demo_job_creates_job_for_user -v
```

Expected: ImportError — `DEMO_JOB_FILENAME` / `seed_demo_job` 없음.

- [ ] **Step 3: Implement seed_demo_job**

`backend/app/db/seed.py` — 기존 함수 다음에 추가:

```python
import shutil
import uuid
from datetime import UTC, datetime, timedelta

from app.db.models import Job
from app.parser.parse_docx import parse_docx
from app.settings import get_settings

DEMO_JOB_FILENAME = "Demo SOP (시연용 30p).docx"
_DEMO_SOURCE = SEED_DIR / "demo" / "sop_30p.docx"


def seed_demo_job(db: Session, user_id: uuid.UUID) -> None:
    """user 소유 데모 SOP Job 1 개를 빈 상태에서 1회 생성. 이미 있으면 skip."""
    existing = (
        db.query(Job)
        .filter_by(user_id=user_id, original_filename=DEMO_JOB_FILENAME)
        .one_or_none()
    )
    if existing is not None:
        return

    if not _DEMO_SOURCE.exists():
        raise FileNotFoundError(
            f"데모 .docx 원본 누락: {_DEMO_SOURCE} — `python -m scripts.build_demo_sop` 로 생성 필요"
        )

    settings = get_settings()
    job_id = uuid.uuid4()
    docs_dir = Path(settings.data_dir) / "docs" / str(job_id)
    docs_dir.mkdir(parents=True, exist_ok=True)
    dest = docs_dir / "sop_30p.docx"
    shutil.copyfile(_DEMO_SOURCE, dest)

    content = dest.read_bytes()
    outline = parse_docx(content, filename=DEMO_JOB_FILENAME, user_id=user_id, job_id=job_id)
    # mode="json" 으로 UUID/datetime 등을 JSON-safe primitive 로 직렬화
    outline_dict = outline.model_dump(mode="json")

    db.add(Job(
        id=job_id,
        user_id=user_id,
        original_filename=DEMO_JOB_FILENAME,
        status="parsed",
        source_path=str(dest),
        result_path=None,
        applied_template_id=None,
        style_overrides={},
        outline_json=outline_dict,
        original_outline_json=outline_dict,
        error_message=None,
        expires_at=datetime.now(tz=UTC) + timedelta(days=365 * 10),  # 데모는 사실상 무기한
    ))
    db.commit()
```

`seed.py` 상단 imports 정리:

```python
"""빌트인 StyleSpec 시드 + 시연용 계정/Job 시드 — idempotent."""

import json
import shutil
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.models import Job, Template, User
from app.parser.parse_docx import parse_docx
from app.settings import get_settings
```

- [ ] **Step 4: Run all seed tests**

```bash
cd backend && pytest tests/test_seed_demo.py -v
```

Expected: 6 passed. 만약 outline_dict 직렬화 문제(예: UUID 직렬화) 가 발견되면 `Outline` 모델의 `model_dump(mode="json")` 을 사용해 JSON-safe 변환.

- [ ] **Step 5: Commit**

```bash
git add backend/app/db/seed.py backend/tests/test_seed_demo.py
git commit -m "feat(seed): seed_demo_job — 30p 데모 SOP 를 user 의 Job 으로 시드

idempotent. 첫 호출만 파일 복사 + parser 실행.
landscape 섹션이 outline.sections 에 보존됨을 테스트로 검증."
```

---

### Task 15: lifespan 에서 seed_demo_job 호출

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Wire seed_demo_job into lifespan**

`backend/app/main.py` 의 `lifespan` 함수만 교체:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    db = SessionLocal()
    try:
        seed_builtin_templates(db)
        seed_demo_accounts(db)
        from app.db.models import User as _User  # 지역 import 로 lifespan 외 영향 0
        from app.db.seed import DEMO_USER_EMAIL, seed_demo_job
        demo_user = db.query(_User).filter_by(email=DEMO_USER_EMAIL).one_or_none()
        if demo_user is not None:
            seed_demo_job(db, demo_user.id)
    finally:
        db.close()
    yield
```

- [ ] **Step 2: Smoke test lifespan + login + jobs list**

```bash
cd backend && DATA_DIR=/tmp/wt_smoke DATABASE_URL=sqlite:////tmp/wt_smoke.db JWT_SECRET=test_secret_64_chars_a python -c "
import os, shutil
shutil.rmtree('/tmp/wt_smoke', ignore_errors=True)
os.remove('/tmp/wt_smoke.db') if os.path.exists('/tmp/wt_smoke.db') else None
os.makedirs('/tmp/wt_smoke', exist_ok=True)
# 마이그레이션 실행
from alembic.config import Config
from alembic import command
cfg = Config('alembic.ini')
command.upgrade(cfg, 'head')
# 라이프사이클 + jobs 조회
from fastapi.testclient import TestClient
from app.main import app
with TestClient(app) as c:
    r = c.post('/auth/login', json={'email': 'user@local.test', 'password': 'user1234'})
    assert r.status_code == 200, r.text
    r = c.get('/jobs')
    print(r.status_code, r.json())
    assert r.status_code == 200
    items = r.json().get('items', r.json())
    assert any('Demo SOP' in (j.get('original_filename') or '') for j in items)
"
```

Expected: `200 [...]` 출력, AssertError 없음. (이 스모크는 일회성 — git 커밋 안 함.)

- [ ] **Step 3: Run full test suite**

```bash
cd backend && pytest -v
```

Expected: 모두 통과. 만약 기존 테스트(`test_api_jobs.py` 등) 가 user 가 시드되지 않은 빈 DB 를 가정한다면, 데모 시드는 user@local.test 라는 특정 계정에만 영향 → 기존 테스트들은 별도 random user 로 가입하므로 영향 없음. 깨지면 그 케이스만 분석.

- [ ] **Step 4: Commit**

```bash
git add backend/app/main.py
git commit -m "feat(main): lifespan 이 user@local.test 에 데모 SOP Job 자동 시드"
```

---

## Phase E — 인프라 단순화 (Tasks 16–17)

### Task 16: docker-compose.yml 에서 db 서비스 제거

**Files:**
- Modify: `infra/docker-compose.yml`

- [ ] **Step 1: Replace docker-compose.yml**

`infra/docker-compose.yml` 전체:

```yaml
name: word-templator

services:
  backend:
    build:
      context: ../backend
    env_file: ../.env
    volumes:
      - filedata:/data
    command: ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
    restart: unless-stopped

  frontend:
    build:
      context: ../frontend
    env_file: ../.env
    environment:
      INTERNAL_API_BASE: http://backend:8000
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
  filedata:
```

- [ ] **Step 2: Validate compose file**

```bash
docker compose -f infra/docker-compose.yml config --quiet
```

Expected: 출력 없음 (validation 통과).

- [ ] **Step 3: Commit**

```bash
git add infra/docker-compose.yml
git commit -m "build(infra): db 서비스 + pgdata 볼륨 제거 (SQLite 임베드 전환)"
```

---

### Task 17: .env.example 갱신

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Replace .env.example**

`.env.example` 전체:

```env
# Backend
DATABASE_URL=sqlite:////data/app.db
JWT_SECRET=change_me_64_chars             # `openssl rand -hex 32`
JWT_ALGORITHM=HS256
JWT_EXPIRES_HOURS=72
DATA_DIR=/data
FILE_RETENTION_DAYS=30
CORS_ORIGINS=http://localhost:3000
AUTH_PROVIDER=local
# 콤마 구분 — 해당 이메일로 signup 시 자동 admin 권한 부여
ADMIN_EMAILS=

# Frontend (NEXT_PUBLIC_* 만 클라이언트 노출)
NEXT_PUBLIC_API_BASE=http://localhost/api
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "build(env): SQLite 기본값 + AUTH_PROVIDER 추가, POSTGRES_* 제거"
```

---

## Phase F — Documentation (Tasks 18–19)

### Task 18: README.md — 실행/계정/데모 안내

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace `## 실행` and `## 테스트` sections**

`README.md` 의 `## 실행` 섹션부터 `## 테스트` 섹션 끝까지를 다음으로 교체:

````markdown
## 실행

```bash
# 1. 환경변수 채우기
cp .env.example .env
# JWT_SECRET 을 실제 값으로 채움 — openssl rand -hex 32

# 2. 도커 컴포즈 기동
docker compose -f infra/docker-compose.yml up -d --build

# 3. 접속
# http://localhost           — Nginx → Next.js (UI)
# http://localhost/api/health — FastAPI (백엔드 헬스체크)
```

### 초기 로그인 계정 (시연용)

부팅 시 자동으로 생성됩니다. **운영 환경에서는 즉시 비밀번호를 변경하세요.**

| 역할 | 이메일 | 비밀번호 |
|------|--------|----------|
| 관리자 | `admin@local.test` | `admin1234` |
| 일반 사용자 | `user@local.test` | `user1234` |

### 데모 SOP 문서

`user@local.test` 로 로그인하면 `Demo SOP (시연용 30p).docx` 라는 작업이 미리 등록되어 있습니다.
30 페이지 분량의 SOP 샘플로, 4단 헤딩 · 표 · 그림 · 섹션 방향 전환을 포함합니다.
업로드가 차단된 환경에서도 편집기 / 미리보기 / 다운로드 전체 플로우를 시연할 수 있습니다.

## 개발

```bash
# Backend
cd backend
python3.11 -m venv .venv && . .venv/bin/activate
uv pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install --legacy-peer-deps
npm run dev   # http://localhost:3000
```

## 테스트

```bash
# Backend (SQLite in-memory — 외부 DB 불필요)
cd backend && pytest -v

# Frontend
cd frontend && npm run lint && npm run build
```
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(README): SQLite 단순화 + 데모 계정/Job 안내 + PG 테스트 안내 제거"
```

---

### Task 19: CLAUDE.md Commands 섹션 정리

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Replace Commands block**

`CLAUDE.md` 의 `## Commands` 블록 전체 (` ```bash` 부터 ` ``` ` 까지) 를 다음으로 교체:

````markdown
## Commands

```bash
# Backend (cd backend)
uv pip install -r requirements-dev.txt        # deps
pytest                                        # full suite (SQLite in-memory)
pytest tests/test_parse.py::test_xxx -v       # single test
ruff check . && ruff format .                 # lint + format
uvicorn app.main:app --reload --port 8000     # dev server

# 데모 SOP .docx 재빌드 (코드/구조 변경 시)
python -m scripts.build_demo_sop

# Frontend (cd frontend)
npm install
npm test
npm run lint
npm run dev                                   # http://localhost:3000

# Compose (전체 스택)
cp .env.example .env && $EDITOR .env          # 시크릿 채우기
docker compose -f infra/docker-compose.yml up -d
```
````

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(CLAUDE): Commands — pgtest 안내 제거, 데모 빌드 스크립트 추가"
```

---

## Phase G — End-to-end 검증 (Task 20)

### Task 20: 전체 스택 통합 검증

이 task 는 코드 변경 없음 — DoD(스펙 §8) 의 모든 항목을 한 번에 돌려본다. 깨지는 항목이 있으면 그 task 로 돌아가서 수정.

- [ ] **Step 1: Clean rebuild + boot**

```bash
docker compose -f infra/docker-compose.yml down -v
docker compose -f infra/docker-compose.yml up -d --build
docker compose -f infra/docker-compose.yml ps
```

Expected: backend, frontend, proxy 3개 컨테이너가 `running` (healthy 가 없는 서비스도 OK).

- [ ] **Step 2: Health endpoint**

```bash
sleep 5 && curl -sS http://localhost/api/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 3: Admin login**

```bash
curl -sS -i -X POST http://localhost/api/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"admin@local.test","password":"admin1234"}' | head -20
```

Expected: `HTTP/1.1 200 OK`, `Set-Cookie: wt_session=...`, body `{"status":"ok"}`.

- [ ] **Step 4: User login + jobs list shows Demo SOP**

```bash
curl -sS -c /tmp/wt_cookies.txt -X POST http://localhost/api/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"user@local.test","password":"user1234"}' && echo
curl -sS -b /tmp/wt_cookies.txt http://localhost/api/jobs | head -200
```

Expected: 두 번째 출력에 `"original_filename":"Demo SOP (시연용 30p).docx"` 포함, `"status":"parsed"`.

- [ ] **Step 5: Idempotency — restart preserves data, no dup seed**

```bash
docker compose -f infra/docker-compose.yml restart backend
sleep 5
curl -sS -b /tmp/wt_cookies.txt http://localhost/api/jobs | python3 -c "import json,sys; d=json.load(sys.stdin); items=d if isinstance(d,list) else d.get('items',[]); print(len([j for j in items if 'Demo SOP' in j.get('original_filename','')]))"
```

Expected: `1` (중복 시드 없음).

- [ ] **Step 6: Volume reset → 빈 상태에서 자동 시드 정상**

```bash
docker compose -f infra/docker-compose.yml down -v
docker compose -f infra/docker-compose.yml up -d --build
sleep 8
curl -sS -X POST http://localhost/api/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"user@local.test","password":"user1234"}' && echo
```

Expected: `{"status":"ok"}` (계정이 자동 재시드 되어 로그인 성공).

- [ ] **Step 7: Browser smoke (manual)**

브라우저에서 `http://localhost/` 접속:
- [ ] 로그인 화면이 한국어/영어 토글 정상 작동
- [ ] `user@local.test` / `user1234` 로 로그인
- [ ] 작업 목록에 `Demo SOP (시연용 30p).docx` 가 1개 보임
- [ ] 편집기 진입 → 4단 헤딩 + 표 + 그림 + 섹션 방향 전환 모두 렌더
- [ ] 미리보기 → before/after 정상 표시
- [ ] 결과 다운로드 → .docx 파일이 다운로드되고 Word/Pages 에서 정상 열림 (landscape 섹션이 가로로 보임)

UI 검증은 자동화되지 않으므로 모든 항목 통과 확인 후 다음 단계로.

- [ ] **Step 8: Final cleanup commit (없으면 skip)**

검증 중 발견된 자잘한 수정만 모아 커밋. 새로운 기능 추가 금지.

```bash
git status   # 변경 없으면 skip
# 변경 있으면:
# git add <files> && git commit -m "fix: 검증 중 발견한 잔여 이슈 정리"
```

- [ ] **Step 9: Push (선택)**

회사 저장소가 별도 remote 라면 push 정책에 맞게:

```bash
git push origin main   # 또는 PR 정책상 feature branch
```

---

## 부록: 실행 순서 요약

| Phase | Tasks | 결과 |
|-------|-------|------|
| A | 1–5 | DB 가 PG/SQLite 양쪽 동작. 테스트는 SQLite in-memory. |
| B | 6–7 | Python 3.11 통일. |
| C | 8–11 | AUTH_PROVIDER 자리 + admin/user 시드. |
| D | 12–15 | 30p 데모 SOP .docx + 자동 Job 시드. |
| E | 16–17 | docker-compose 단순화 + .env.example. |
| F | 18–19 | README + CLAUDE.md 정리. |
| G | 20 | DoD 통과. |

각 task 끝에 commit 1개 — 순서 역순으로 revert 가능.
