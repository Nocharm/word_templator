# 회사 내부 SSH 서버 배포 준비 — 설계 문서

- **작성일**: 2026-04-28
- **상태**: 초안 (사용자 승인 대기)
- **대상 환경**: 회사 내부 망의 단일 Linux SSH 서버. `git pull && docker compose up -d` 1줄 배포.
- **상위 설계**: `2026-04-26-word-templator-design.md`

---

## 1. 목적

word_templator 를 회사 내부 SSH 호스트에 시범 배포하기 위해, 다음 5가지를 한 번에 정리한다.

1. Python 런타임을 회사 표준에 맞춰 **3.11** 로 통일
2. 인증은 **사내 SSO 도입 전 임시 로컬 인증을 유지**하되, SSO 자리만 명시적으로 만들어 둠. 시연용 계정 2개(admin, user) 자동 시드.
3. 별도 Postgres 컨테이너 → **백엔드 컨테이너 내부 SQLite** 로 단순화. 이후 외부 DB 도입 시 alembic + 데이터 dump 로 이전.
4. **Nginx 프록시 컨테이너는 현 구성 유지** (호스트 nginx 와의 통합 여부는 실배포 후 결정 — 본 스펙 범위 밖).
5. 회사망에서 .docx 업로드가 차단되는 상황을 가정해, **30페이지 분량 데모 SOP 문서를 자동 시드된 Job 으로 내장** — 로그인 즉시 편집기/미리보기 시연 가능.

비목표(이번 스펙에서 제외):

- 호스트 nginx 와 컨테이너 nginx 의 합치/분리 결정 (실배포 후 별도 스펙)
- HTTPS 종료 (사내 인증서 정책 확정 후)
- 실제 SSO/OIDC 구현 (자리만 마련)
- CI/CD 파이프라인 (수동 배포 절차만 정리)

---

## 2. 결정 요약

| # | 항목 | 결정 |
|---|------|------|
| 1 | Python | 3.11-slim (Dockerfile builder/runtime 둘 다) |
| 2 | 인증 | 현행 email/pw + JWT 쿠키 유지. `auth.py` 에 `# SSO insertion point` 주석. `AUTH_PROVIDER=local` 설정 추가 (현재 `local` 만 구현). |
| 3 | 시드 계정 | `admin@local.test / admin1234` (admin), `user@local.test / user1234` (user). 빈 DB 일 때만 생성 (idempotent). README/USAGE 에 명시 + 운영 시 즉시 변경 경고. |
| 4 | DB | SQLite. 파일 경로 `${DATA_DIR}/app.db` (기본 `/data/app.db`). compose `db` 서비스 + `pgdata` 볼륨 제거. |
| 5 | DB 마이그레이션 | 기존 0001 마이그레이션의 `sa.UUID()` / `JSONB` → SQLite 호환 타입으로 **0001 직접 수정** (회사 배포 전이므로 stamp 호환 신경 안 씀). 0002, 0003 도 같은 원칙. |
| 6 | Nginx | 현행 `proxy` 서비스 유지. 변경 없음. |
| 7 | 데모 SOP | `python-docx` 기반 빌드 스크립트로 30p `.docx` 결정론적 생성 → git 커밋. 부팅 시 `user@local.test` 소유 + `original_filename="Demo SOP (시연용 30p).docx"` 인 Job 없으면 자동 시드. |

---

## 3. 아키텍처 (변경 후)

```
┌─────────────────────────────────────────────────┐
│  사용자 브라우저                                  │
└────────────────┬────────────────────────────────┘
                 │ http://<server>/  (또는 도메인)
                 ▼
┌─────────────────────────────────────────────────┐
│  proxy (nginx:1.27-alpine)                      │
│   :80 →  /api/* → backend:8000                  │
│         /*     → frontend:3000                  │
└──────┬──────────────────────────────┬───────────┘
       │                              │
       ▼                              ▼
┌─────────────────────┐   ┌──────────────────────┐
│  backend (3.11)     │   │  frontend (Next.js)  │
│   uvicorn :8000     │   │   :3000              │
│   ├─ SQLite         │   │                      │
│   │   /data/app.db  │   └──────────────────────┘
│   └─ uploads/result │
│       /data/docs/   │
└─────────────────────┘

볼륨: filedata (단일) → /data 마운트. SQLite + 업로드 파일 같은 디렉터리.
```

비교: 컨테이너 4개 → **3개** (db 제거). 볼륨 2개 → **1개** (pgdata 제거).

---

## 4. 컴포넌트별 변경 사항

### 4.1 Python 3.11 다운그레이드

| 파일 | 변경 |
|------|------|
| `backend/Dockerfile` | `FROM python:3.12-slim` → `FROM python:3.11-slim` (builder, runtime 둘 다). `COPY --from=builder /usr/local/lib/python3.12/...` → `python3.11`. |
| `backend/pyproject.toml` | `target-version = "py312"` → `"py311"`. `[tool.mypy] python_version = "3.12"` → `"3.11"`. |
| `backend/requirements.txt` | 변경 없음 — 현행 패키지 모두 3.11 호환 (lxml 5.3, psycopg 3.2, pydantic 2.9, fastapi 0.115). |
| `backend/requirements-dev.txt` | 변경 없음. |
| 로컬 `.venv` | 개발자가 직접 `python3.11 -m venv .venv` 로 재생성 (자동화 안 함). README 에 명시. |

검증: `docker build` 성공 + `pytest` 전체 통과.

### 4.2 인증 — 시드 계정 + SSO 자리

**현행 유지**:
- `app/api/auth.py` 의 signup/login/logout/me/password 엔드포인트는 그대로 둠.
- `_LOOSE_EMAIL` 검증, `bcrypt` 해시, JWT 쿠키 설정 모두 유지.

**추가**:
- `app/settings.py` 에 `auth_provider: str = Field("local", alias="AUTH_PROVIDER")` 추가. 현재는 `local` 만 의미 있음. 향후 `oidc` 등 추가.
- `app/api/auth.py` 상단에 다음 한 줄 주석:
  ```python
  # NOTE: SSO insertion point — settings.auth_provider == "oidc" 분기는
  # 사내 IdP 결정 후 추가. 현재는 local 만 동작.
  ```
- `app/db/seed.py` 에 `seed_demo_accounts(db)` 추가. 빈 users 테이블일 때만 admin + user 1명씩 생성.

**시드 계정**:

| 이메일 | 비밀번호 | 역할 |
|--------|----------|------|
| `admin@local.test` | `admin1234` | admin |
| `user@local.test` | `user1234` | user |

비밀번호는 코드 상수로 **소스에 평문 노출** — 시연/QA 전용. README 에 운영 시 즉시 변경하라는 경고 명시.

### 4.3 DB — SQLite 전환

#### 4.3.1 모델 호환

`app/db/models/{user,job,template,feedback}.py` 의 `UUID(as_uuid=True)` 와 `JSONB` 가 SQLite 와 비호환.

**해결**: `app/db/types.py` 신설 — dialect-portable 타입 별칭.

```python
"""Dialect-portable column types — Postgres / SQLite 양쪽 지원."""

import json
import uuid
from typing import Any

from sqlalchemy import CHAR, TEXT, TypeDecorator
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID


class GUID(TypeDecorator):
    """Postgres: UUID native. SQLite: CHAR(36) 문자열."""
    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value
        return str(value) if isinstance(value, uuid.UUID) else value

    def process_result_value(self, value, dialect):
        if value is None or isinstance(value, uuid.UUID):
            return value
        return uuid.UUID(value)


class JSONPortable(TypeDecorator):
    """Postgres: JSONB. SQLite: TEXT(JSON 직렬화)."""
    impl = TEXT
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(JSONB())
        return dialect.type_descriptor(TEXT())

    def process_bind_param(self, value, dialect):
        if value is None or dialect.name == "postgresql":
            return value
        return json.dumps(value, ensure_ascii=False)

    def process_result_value(self, value, dialect):
        if value is None or dialect.name == "postgresql":
            return value
        return json.loads(value) if isinstance(value, str) else value
```

모델 파일에서 `UUID(as_uuid=True)` → `GUID()`, `JSONB` → `JSONPortable()` 로 교체.

#### 4.3.2 마이그레이션 호환

기존 0001/0002/0003 마이그레이션은 PG 전용 타입(`sa.UUID`, `postgresql.JSONB`) 사용 중. SQLite 에서는 alembic 이 fallback 으로 동작하지만 일부 케이스에서 깨짐. **회사 배포 전에 한 번도 prod 적용된 적 없으므로 직접 수정**.

원칙:
- `sa.UUID()` → `app.db.types.GUID()` (또는 단순화: `sa.String(36)`)
- `postgresql.JSONB(astext_type=sa.Text())` → `app.db.types.JSONPortable()` (또는 `sa.Text()` + Python 단에서 직렬화 — 모델은 이미 위에서 처리)
- `server_default=sa.text("now()")` → `sa.text("CURRENT_TIMESTAMP")` (SQLite/Postgres 모두 동작)
- CHECK 제약은 양쪽 호환.

마이그레이션 수정 후 `alembic upgrade head` 가 SQLite 빈 파일에서 끝까지 통과해야 함.

#### 4.3.3 세션 / 엔진

`app/db/session.py` 에서 SQLite 일 때 `connect_args={"check_same_thread": False}` + `pool_pre_ping=True` 추가 (FastAPI thread pool 호환).

#### 4.3.4 DATA_DIR 와 파일 경로

- 기본 `DATABASE_URL=sqlite:////data/app.db`  (슬래시 4개 = absolute path)
- DB 파일과 업로드 파일이 같은 볼륨에 공존. 백업 = `/data` 디렉터리 tar.

#### 4.3.5 테스트

- `backend/tests/conftest.py` 의 pgtest 컨테이너 의존 제거 검토. **선택 1**: SQLite in-memory 로 모든 테스트 실행 (가장 단순). **선택 2**: PG 호환 검증을 위해 PG 옵션 유지하고 기본만 SQLite. 

  **결정**: 우선 SQLite in-memory 로 통합. 기존 `_data_dir` autouse fixture 와 동일한 방식으로 `engine` fixture 도 in-memory SQLite 로 교체. PG 호환은 추후 CI 에서 별도 잡으로 검증 (스펙 외).

### 4.4 더미 SOP 데이터

#### 4.4.1 빌드 스크립트

`backend/scripts/build_demo_sop.py` — `python-docx` 로 30 페이지 분량 SOP 결정론적 생성.

문서 사양:
- **헤더**: "Demo SOP — Word Templator 시연용" (전 페이지 공통)
- **목차/장 구조**: H1 5개, 각각 H2 2~3개, 일부 H2 아래 H3 1~2개, 일부 H3 아래 H4 1개. 총 4단 헤딩.
- **본문 분량**: 약 30 페이지 (Lorem-style 한국어 placeholder + 영문 혼용).
- **표 4개**: 2개는 캡션 있음("표 1. 항목별 책임자"), 2개는 캡션 누락 — 캡션 누락 검출 UI 검증용.
- **그림 3개**: 1×1px 단색 PNG 임베드. 1개는 캡션 있음("그림 1. 프로세스 흐름"), 2개는 캡션 누락.
- **섹션 방향 전환**: 중간(예: 3장)에 **landscape 섹션** 1개 — 가로 표 1개 포함. 그 후 다시 portrait 로 복귀. (`feat/section-orientation` 에서 추가된 sectPr 처리 검증)
- **결정성**: 동일 입력으로 매번 동일 바이트 산출 (uuid/timestamp 사용 금지, 이미지 raw bytes 고정).

산출물: `backend/app/templates_seed/demo/sop_30p.docx` — git 커밋. 빌드 스크립트도 같이 커밋.

#### 4.4.2 시드 동작

`app/db/seed.py` 에 `seed_demo_job(db, user_id)` 추가:

1. `Job` 테이블에서 `user_id=<user@local.test 의 id>` & `original_filename="Demo SOP (시연용 30p).docx"` 로 조회.
2. 존재하면 skip.
3. 없으면:
   a. `templates_seed/demo/sop_30p.docx` → `${DATA_DIR}/docs/<job_uuid>/sop_30p.docx` 로 복사.
   b. 기존 파서(`app/parser/parse_docx.py`) 호출 → outline 추출.
   c. `Job` insert: `status="parsed"`, `original_filename="Demo SOP (시연용 30p).docx"`, `source_path`, `outline_json`, `original_outline_json` 채움. `applied_template_id`/`style_overrides` 는 기본값 (사용자가 UI 에서 선택).
4. 재시드 안전 (idempotent).

`app/main.py` 의 `lifespan` 에서 `seed_builtin_templates(db)` 다음에:
```python
seed_demo_accounts(db)
demo_user = db.query(User).filter_by(email="user@local.test").one_or_none()
if demo_user is not None:
    seed_demo_job(db, demo_user.id)
```

### 4.5 인프라 변경

#### 4.5.1 docker-compose.yml

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

변경점: `db` 서비스 제거, `pgdata` 볼륨 제거, `backend` 의 `depends_on: db`/`DATABASE_URL` 환경 변수 override 제거.

#### 4.5.2 .env.example

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

제거: `POSTGRES_*` 4줄.

#### 4.5.3 docker-entrypoint.sh

변경 없음. `/data` 권한 fix 가 SQLite 파일에도 그대로 적용됨.

### 4.6 문서 업데이트

#### 4.6.1 README.md

`## 실행` 섹션을 다음으로 교체:

```markdown
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

`user@local.test` 로 로그인하면 `Demo SOP` 라는 작업이 미리 등록되어 있습니다.
30페이지 분량의 SOP 샘플로, 4단 헤딩·표·그림·섹션 방향 전환을 포함합니다.
업로드가 차단된 환경에서도 편집기/미리보기/다운로드 전체 플로우를 시연할 수 있습니다.
```

`## 테스트` 섹션의 PG 컨테이너 안내는 제거하고 `cd backend && pytest -v` 한 줄로 단순화.

#### 4.6.2 USAGE.md

USAGE.md 는 현재 **CLAUDE.md 템플릿 문서**임 (word_templator 사용 가이드 아님). 이번 스펙에서는 건드리지 않음. 별도 사용자 매뉴얼이 필요해지면 추후 신규 파일로 작성.

#### 4.6.3 CLAUDE.md (Commands 섹션)

`pgtest_p2` 컨테이너 띄우는 안내 제거. 다음으로 단순화:

```bash
# Backend (cd backend)
uv pip install -r requirements-dev.txt
pytest                                        # SQLite in-memory
pytest tests/test_parse.py::test_xxx -v       # single test
ruff check . && ruff format .
uvicorn app.main:app --reload --port 8000     # dev (DATABASE_URL=sqlite:///./dev.db)
```

---

## 5. 마이그레이션 / 롤백 전략

회사 서버에 처음 배포하므로 **prod 데이터 보존 의무 없음**. 따라서:

- 롤백 시나리오: 이전 커밋으로 되돌리고 `docker compose down -v && docker compose up -d --build`. 시드가 다시 채워짐.
- 향후 외부 DB 도입 시: `alembic upgrade` 가 PG dialect 에서도 동작 (GUID/JSONPortable 이 양방향 호환). 데이터 이전은 `pg_dump` 가 아닌 application-level dump (Job/Template/User/Feedback select → bulk insert) 권장 — 별도 스크립트는 그때 작성.

---

## 6. 위험 / 미해결 항목

| # | 위험 | 완화 |
|---|------|------|
| 1 | SQLite 동시 쓰기 락 (multi-worker uvicorn) | uvicorn `--workers 1` 유지 (운영 가정 = 동접 ~10명, Job 처리는 단발적). 본 스펙에서는 건드리지 않음. |
| 2 | `python-docx` 가 결정론적 .docx 를 보장하지 않을 수 있음 (xml 직렬화 순서, zip metadata) | 빌드 스크립트 산출물을 `git diff` 로 검증. 비결정적이면 zip 재패킹 단계에서 timestamp 고정 helper 추가. |
| 3 | 사내 nginx 와 컨테이너 nginx 의 :80 포트 충돌 | 본 스펙 범위 외. 실배포 시 충돌 발생하면 `proxy` 의 `ports: ["8080:80"]` 로 임시 우회 가능. |
| 4 | 시드 계정의 평문 비밀번호가 git 에 박힘 | 의도된 것 — QA 편의 우선. README 경고로 보완. 운영 정책 강화 시 `DEMO_ACCOUNT_PASSWORD` 환경 변수로 주입하도록 후속 변경. |
| 5 | 데모 Job 시드가 매 부팅마다 파서 호출 | idempotent 체크가 먼저 → 두 번째 부팅부터는 파서 안 돌림. 첫 부팅 1회만 비용 발생. |

---

## 7. 변경 파일 체크리스트

| 파일 | 변경 종류 |
|------|-----------|
| `backend/Dockerfile` | python 3.12 → 3.11 |
| `backend/pyproject.toml` | ruff target / mypy 3.12 → 3.11 |
| `backend/app/db/types.py` | **신규** — GUID, JSONPortable |
| `backend/app/db/models/{user,job,template,feedback}.py` | UUID/JSONB → GUID/JSONPortable |
| `backend/app/db/migrations/versions/0001_initial.py` | UUID/JSONB/now() 호환 타입으로 수정 |
| `backend/app/db/migrations/versions/0002_original_outline.py` | JSONB → JSONPortable |
| `backend/app/db/migrations/versions/0003_feedback_and_role.py` | UUID/now() 호환 타입으로 수정 |
| `backend/app/db/session.py` | SQLite connect_args 분기 |
| `backend/app/db/seed.py` | seed_demo_accounts, seed_demo_job 추가 |
| `backend/app/api/auth.py` | SSO insertion point 주석 |
| `backend/app/main.py` | lifespan 에서 데모 시드 호출 |
| `backend/app/settings.py` | auth_provider 필드 추가 |
| `backend/scripts/build_demo_sop.py` | **신규** — 30p docx 빌드 |
| `backend/app/templates_seed/demo/sop_30p.docx` | **신규** — 빌드 산출물 (커밋) |
| `backend/tests/conftest.py` | SQLite in-memory engine 으로 교체 |
| `infra/docker-compose.yml` | db 서비스 + pgdata 볼륨 제거 |
| `.env.example` | POSTGRES_* 제거, DATABASE_URL 기본값 SQLite, AUTH_PROVIDER 추가 |
| `README.md` | 실행/계정/데모 안내 갱신, PG 테스트 안내 제거 |
| `CLAUDE.md` | Commands 섹션 PG 안내 제거 |

---

## 8. 검증 (Definition of Done)

1. `docker build backend/` 성공 (Python 3.11)
2. `cd backend && pytest -v` 전체 통과 (SQLite in-memory)
3. `docker compose -f infra/docker-compose.yml up -d --build` 후:
   - `curl http://localhost/api/health` → `{"status":"ok"}`
   - `admin@local.test` / `admin1234` 로 로그인 성공
   - `user@local.test` / `user1234` 로 로그인 → `Demo SOP (시연용 30p).docx` Job 1개 보임
   - Demo SOP 편집기 진입 → 4단 헤딩 + 표 4개 + 그림 3개 + landscape 섹션 1개 모두 렌더
   - Demo SOP 미리보기 → before/after 정상
   - Demo SOP 결과 다운로드 → 정상 .docx 파일
4. `docker compose down && docker compose up -d` (볼륨 보존) 시 시드 중복 생성 없음 (idempotent)
5. `docker compose down -v && docker compose up -d` (볼륨 삭제) 시 빈 상태에서 자동 시드 정상

---

## 9. 다음 단계

본 스펙 사용자 승인 → `writing-plans` 스킬로 구현 계획(Phase 별 task 분해) 작성.
