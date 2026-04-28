# Word Templator — 설계 문서

- **작성일**: 2026-04-26
- **상태**: 초안 (구현 계획 수립 전)
- **다음 단계**: `writing-plans` 스킬로 Phase 1 구현 계획 작성

---

## 1. 목적

`.docx` 문서를 업로드하면, 사용자가 선택한 빌트인 템플릿(StyleSpec)과 일부 오버라이드를 기반으로 **표·문단·번호·폰트를 표준화**해 다시 `.docx`로 출력하는 웹 도구.

"사람마다 다른 포맷" → "일관된 양식"으로 정리하는 것이 핵심 가치.

---

## 2. 범위 (Scope)

### 포함

- **A 모드**: 단일 `.docx` 입력 → 단일 표준화 `.docx` 출력
- **문단 순서 보존** — 사용자는 레벨(H1/H2/H3/body)만 수정 가능
- **사용자 인증**(자체 회원가입/로그인) + 사용자별 히스토리 + 커스텀 StyleSpec 저장
- 빌트인 템플릿 3개: `기본 보고서`, `공문 양식`, `학술 논문`
- 출력 포맷: `.docx`만

### 향후 옵션 (Phase 5)

- **B 모드**: 다중 `.docx` 결정론적 병합 (LLM 미사용)

### 명시적 제외

- LLM 기반 의미 정리 (요약, 재배치, 중복 제거)
- PDF 출력
- 텍스트 내용 편집 (오타 수정 등)
- OAuth / 결제 / 쿼터

### 운영 가정

- 사용자 ~2,000명, 동접 ~10명. 수익 목적 아님.
- 단일 SSH 호스트, Docker Compose. 큐/Redis/수평 확장 없음.

---

## 3. 아키텍처

### 컨테이너 구성 (총 4개)

```
┌────────────────────────────────────────────────┐
│  SSH 호스트 (Docker)                            │
│                                                 │
│   [Nginx]  ←── HTTPS                            │
│      │                                          │
│      ├─→ [Next.js]   :3000  (App Router)        │
│      │                                          │
│      └─→ [FastAPI]   :8000  ──┬─→ [Postgres]    │
│                                │                │
│                                └─→ [Volume]     │
│                                   /data/docs    │
│                                   /data/images  │
└────────────────────────────────────────────────┘
```

| 컨테이너 | 역할 |
|---|---|
| `proxy` | Nginx — HTTPS 종료(certbot 사이드카), 라우팅 |
| `frontend` | Next.js 15 App Router |
| `backend` | FastAPI |
| `db` | Postgres 16 |

### 인증

- **JWT (httpOnly Secure 쿠키)**, 자체 가입(이메일+비번, bcrypt)
- Next.js Server Component에서 쿠키 읽어 보호 라우트 처리

### 파일 저장

- 큰 바이너리는 디스크 볼륨 (`/data/docs/{user_id}/{job_id}/`, `/data/images/{job_id}/`)
- DB에는 메타데이터만
- raw `.docx` 는 **30일 후 자동 삭제** (메타는 영구)

---

## 4. 데이터 모델

### 4.1 Outline JSON (Backend ↔ Frontend 계약)

```jsonc
{
  "job_id": "uuid",
  "source_filename": "report.docx",
  "blocks": [
    {
      "id": "b-001",
      "kind": "paragraph",
      "level": 1,                      // 0=body, 1=H1, 2=H2, 3=H3
      "text": "1. 개요",
      "detected_by": "word_style",     // word_style | heuristic | user
      "list_format": null
    },
    {
      "id": "b-003",
      "kind": "table",
      "level": 0,
      "markdown": "| 구분 | 값 |\n|---|---|\n| A | 10 |",
      "caption": "표 1. 결과 요약",
      "raw_ref": "table-0"
    },
    {
      "id": "b-004",
      "kind": "image",
      "level": 0,
      "preview_url": "/api/jobs/{job_id}/images/0",
      "caption": "그림 1. 시스템 구조도",
      "raw_ref": "image-0"
    },
    {
      "id": "b-005",
      "kind": "field",
      "level": 0,
      "field_kind": "ref",             // ref | toc | pageref
      "preview_text": "→ 3.1절 참조",
      "target_id": "b-001",
      "raw_xml_ref": "field-0"
    }
  ]
}
```

**가변/불변 규칙**

| 속성 | 사용자 편집 가능 |
|---|---|
| `level` (paragraph만) | ✅ — 들여쓰기 조작 |
| `kind`, `text`, `markdown`, `caption`, `raw_ref`, `raw_xml_ref` | ❌ |
| `blocks` 배열 순서 | ❌ — 문서 순서 = 배열 순서, 변경 불가 |

`raw_ref` / `raw_xml_ref`: 표/이미지/필드의 OOXML 원본을 디스크에 보관해두고, 렌더링 시 그대로 다시 끼워넣기 위한 핸들. 프론트는 노출만, 편집 안 함.

### 4.2 StyleSpec (변환 규칙)

```jsonc
{
  "id": "tmpl-default-report",
  "name": "기본 보고서",
  "is_builtin": true,
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

빌트인 3개: `기본 보고서`, `공문 양식`, `학술 논문`. 사용자는 어느 빌트인 위에서든 일부 필드 오버라이드해 본인 템플릿으로 저장 가능.

### 4.3 DB 스키마 (Postgres)

```sql
-- users: 인증의 단일 출처
users (
  id              UUID PK,
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL
);

-- templates: 빌트인(owner_id=NULL) + 사용자 커스텀
templates (
  id          UUID PK,
  owner_id    UUID NULL REFERENCES users(id),
  name        TEXT NOT NULL,
  is_builtin  BOOLEAN NOT NULL,
  spec        JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL
);

-- jobs: 변환 작업 메타 + 편집된 outline
jobs (
  id                   UUID PK,
  user_id              UUID NOT NULL REFERENCES users(id),
  original_filename    TEXT NOT NULL,
  status               TEXT NOT NULL,         -- 'parsed' | 'rendered' | 'failed'
  source_path          TEXT NOT NULL,
  result_path          TEXT NULL,
  applied_template_id  UUID NULL REFERENCES templates(id),
  style_overrides      JSONB NOT NULL DEFAULT '{}',
  outline_json         JSONB NOT NULL,
  error_message        TEXT NULL,
  created_at           TIMESTAMPTZ NOT NULL,
  expires_at           TIMESTAMPTZ NOT NULL    -- 30일 후 raw 파일 삭제 기준
);
```

**왜 outline_json까지 DB에 두나?** 사용자가 편집 도중 브라우저를 닫고 돌아와도 이어서 편집 가능. "다시 변환" 시 같은 outline 재사용.

**큰 바이너리 미저장 원칙**: 원본 `.docx`, 추출된 이미지, 보존된 OOXML 조각은 전부 디스크. DB는 메타·관계·구조화된 JSON만.

---

## 5. 처리 흐름

```
[사용자]            [Frontend]            [Backend]               [DB / Disk]

1. .docx 업로드 ───→ POST /jobs/upload ──→ parse_docx()
                                            ├─ Outline JSON 생성
                                            ├─ 이미지 추출 → /data/images/
                                            └─ INSERT jobs (status='parsed')
                                                                    ↓
2. ←──────── { job_id, outline } ←────── 응답
3. outline 에디터 표시 (마크다운 + 들여쓰기)
4. 사용자가 Tab/Shift+Tab으로 level 수정
5. (자동/수동 저장) ─→ PUT /jobs/{id}/outline → UPDATE jobs.outline_json
6. 변환 클릭 ────→ POST /jobs/{id}/render ──→ apply_style()
                    { template_id, overrides }  ├─ template + override 병합 → final StyleSpec
                                                ├─ Outline + StyleSpec → 새 .docx
                                                └─ /data/docs/ 저장, status='rendered'
                                                                    ↓
7. ←──── { download_url } ←─────────── 응답
8. GET /jobs/{id}/download → .docx
```

### API 엔드포인트

| Method | Path | 설명 |
|---|---|---|
| POST | `/auth/signup` | 회원가입 |
| POST | `/auth/login` | 로그인 (쿠키 발급) |
| POST | `/auth/logout` | 로그아웃 |
| POST | `/jobs/upload` | `.docx` 업로드 + 파싱 → Outline 반환 |
| GET | `/jobs` | 사용자 변환 히스토리 |
| GET | `/jobs/{id}/outline` | 저장된 outline 조회 |
| PUT | `/jobs/{id}/outline` | 편집 저장 (level 변경) |
| POST | `/jobs/{id}/render` | StyleSpec 적용 → `.docx` 생성 |
| GET | `/jobs/{id}/download` | 결과 다운로드 |
| GET | `/jobs/{id}/images/{idx}` | 이미지 미리보기 |
| GET | `/templates` | 빌트인 + 본인 커스텀 목록 |
| POST | `/templates` | 커스텀 생성 |
| PATCH | `/templates/{id}` | 커스텀 수정 |
| DELETE | `/templates/{id}` | 커스텀 삭제 |

---

## 6. 헤딩 감지 — 단계적 폴백 (R3)

```python
def detect_level(paragraph) -> tuple[int, str]:
    # (a) Word 빌트인 스타일
    if paragraph.style.name in ("Heading 1", "제목 1"): return 1, "word_style"
    if paragraph.style.name in ("Heading 2", "제목 2"): return 2, "word_style"
    if paragraph.style.name in ("Heading 3", "제목 3"): return 3, "word_style"

    # (b) 휴리스틱
    text = paragraph.text.strip()
    if re.match(r"^\d+\.\s", text) and is_bold_or_large(paragraph):
        return 1, "heuristic"
    if re.match(r"^\d+\.\d+\.\s", text):
        return 2, "heuristic"
    if re.match(r"^[가-힣]\.\s", text):
        return 2, "heuristic"

    # (c) 폴백 = body, UI에서 사용자가 마킹
    return 0, "heuristic"
```

블록의 `detected_by` 필드로 출처 노출 → UI에서 휴리스틱 결과는 시각 표시(예: 노란 배지)해 사용자 검수 유도.

---

## 7. 기술 리스크 & 처리 전략

### R1. 상대 참조 (TOC / REF / PAGEREF) — Phase 4

**문제**: `python-docx`는 필드 코드를 텍스트로 평탄화하는 경향. TOC 자동 갱신 필드 사라짐.

**전략**:
- 읽기: `lxml`로 `<w:fldSimple>`, `<w:fldChar>` ~ end 영역 통째 보존, `raw_xml_ref` 매핑
- 쓰기: outline 재조립 시 필드 블록은 원본 OOXML을 그대로 재삽입, TOC는 `\* MERGEFORMAT` 유지
- 북마크 ↔ outline block 매핑 유지
- 복잡 케이스(IF/SEQ 중첩)는 best-effort + UI 경고 표시

### R2. 한글/영문 폰트 분리 (eastAsia)

**문제**: Word `<w:rFonts>`는 `w:ascii`, `w:hAnsi`, `w:eastAsia` 분리.

**전략**: StyleSpec에 `korean`/`ascii` 분리 필드. 렌더 시 `w:eastAsia=korean`, `w:ascii=w:hAnsi=ascii` 일관 적용.

### R3. 헤딩 감지 — 6장 참조

### R4. 표 → 마크다운 (단방향)

**문제**: 병합셀(`gridSpan`/`vMerge`)/중첩표는 마크다운 표현 한계.

**전략**: 마크다운은 미리보기용 read-only. 실제 렌더는 원본 OOXML 보존 후 표 스타일만 덮어씀. 병합셀/중첩은 `[병합셀]` 표시 + 원본은 절대 깨지지 않음.

### R5. 리스트 번호 (`numbering.xml`)

**전략**: 빌트인 템플릿마다 미리 만든 `numbering.xml` 조각 보유 → 새 docx에 주입.

---

## 8. Phase 분할

각 Phase는 **그 자체로 배포 가능한 단위**.

### Phase 1 — MVP (텍스트 전용)

- 인증 (회원가입/로그인, JWT 쿠키)
- DB 스키마 + 빌트인 템플릿 1개 시드 (`기본 보고서`)
- `.docx` 업로드 → 본문/헤딩만 파싱 (R3의 a+b 단계)
- Outline 에디터: 마크다운 렌더 + Tab/Shift+Tab으로 level 수정
- 빌트인 템플릿 적용 → `.docx` 다운로드
- 표/이미지/필드는 만나면 placeholder 출력
- **테스트**: 헤딩 샘플 5개 round-trip + 한/영 폰트 폴백(R2) 단위 테스트

### Phase 2 — 템플릿 확장 & 커스터마이즈

- 빌트인 +2개 (`공문 양식`, `학술 논문`)
- StyleSpec 오버라이드 UI 폼
- 사용자별 커스텀 StyleSpec 저장·수정·삭제
- 히스토리 페이지

### Phase 3 — 표 & 이미지 & 캡션

- 표 마크다운 read-only 렌더 + `raw_ref` 보존
- 이미지 추출 + placeholder + 클릭/호버 미리보기
- 표/이미지 캡션 추출 → outline blocks에 포함
- 병합셀/중첩표는 placeholder + 원본 보존

### Phase 4 — 상대 참조 (R1)

- `lxml`로 `<w:fldChar>` 영역 보존
- 북마크 ↔ outline block 매핑
- TOC 자동 갱신 플래그 유지
- UI에 "필드 N개 보존, M개 검토 필요" 표시

### Phase 5 — (Optional) 다중 파일 병합 (B 모드)

- N개 `.docx` 순서 유지하며 outline 이어붙임
- 단일 StyleSpec 일괄 적용
- 헤딩 충돌 정책: 사용자 선택 (병렬 / 강등)

---

## 9. 디렉터리 구조 / 의존성 / 도커

### 최상위

```
word_templator/
├── backend/                  # FastAPI
├── frontend/                 # Next.js App Router
├── infra/
│   ├── nginx/default.conf
│   └── docker-compose.yml
├── docs/superpowers/specs/
├── .env.example              # 모든 ENV + 주석 (커밋)
├── .gitignore
├── CLAUDE.md ✅ 유지
├── rules/    ✅ 유지
└── templates/ ✅ 유지 (design tokens)
```

### Backend

```
app/
├── main.py
├── settings.py               # Pydantic Settings (.env 로드)
├── api/
│   ├── deps.py
│   ├── auth.py               # /auth/{login,signup,logout}
│   ├── jobs.py
│   ├── templates.py
│   └── images.py
├── core/{security,logging}.py
├── db/
│   ├── base.py, session.py
│   ├── models/{user,template,job}.py
│   └── migrations/           # Alembic
├── domain/{outline,style_spec}.py
├── parser/                   # .docx → Outline
│   ├── parse_docx.py
│   ├── detect_heading.py     # R3
│   ├── extract_table.py
│   ├── extract_image.py
│   └── extract_field.py      # Phase 4
├── renderer/                 # Outline + StyleSpec → .docx
│   ├── render_docx.py
│   ├── apply_style.py
│   ├── inject_numbering.py
│   └── reembed_raw.py
├── templates_seed/{report,official,academic}.json
└── storage/files.py          # /data 경로 관리
tests/
├── fixtures/                 # 샘플 .docx
└── test_{parse,render,api_jobs}.py
requirements.txt              # 프로덕션
requirements-dev.txt          # -r requirements.txt + dev 도구
pyproject.toml                # ruff/mypy/pytest 설정
Dockerfile
```

### Frontend

```
app/
├── (auth)/{login,signup}/page.tsx
├── dashboard/page.tsx        # 히스토리
├── editor/[jobId]/page.tsx   # outline 에디터
├── templates/page.tsx        # 템플릿 관리
├── layout.tsx
└── page.tsx                  # 랜딩 / 업로드
components/
├── outline-editor/
│   ├── OutlineEditor.tsx
│   ├── ParagraphBlock.tsx
│   ├── TableBlock.tsx
│   ├── ImageBlock.tsx
│   └── FieldBlock.tsx
├── template-form/StyleSpecForm.tsx
└── ui/
lib/{api,auth,types}.ts
styles/{design-tokens,globals}.css
```

### 기술 스택

| 영역 | 라이브러리 |
|---|---|
| Backend 웹 | FastAPI + Uvicorn |
| docx 파싱·생성 | `python-docx`, `lxml` |
| ORM / 마이그레이션 | SQLAlchemy 2.x + Alembic |
| DB 드라이버 | `psycopg[binary]` |
| 설정·검증 | `pydantic-settings`, `pydantic` v2 |
| 인증 | `python-jose` (JWT), `passlib[bcrypt]` |
| 백엔드 테스트 | `pytest`, `pytest-asyncio`, `httpx` |
| Lint/Format | `ruff` |
| 타입 | `mypy` strict |
| 의존성 도구 | `uv` |
| Frontend | Next.js 15 + React 19 + TS strict |
| 스타일 | Tailwind + design-tokens.css |
| API 상태 | TanStack Query |
| 폼 | react-hook-form + zod |
| 마크다운 렌더 | `react-markdown` + `remark-gfm` |
| 프론트 테스트 | Vitest + Testing Library (Phase 2부터) |

### `.env.example`

```bash
# Postgres
POSTGRES_USER=app
POSTGRES_PASSWORD=change_me
POSTGRES_DB=word_templator
DATABASE_URL=postgresql+psycopg://app:change_me@db:5432/word_templator

# Backend
JWT_SECRET=change_me_64_chars         # `openssl rand -hex 32` 권장
JWT_ALGORITHM=HS256
JWT_EXPIRES_HOURS=72
DATA_DIR=/data
FILE_RETENTION_DAYS=30

# Frontend (NEXT_PUBLIC_* 만 클라이언트 노출)
NEXT_PUBLIC_API_BASE=https://api.example.com
```

### Docker 정책 (`rules/docker.md` 준수)

- BuildKit 활성 (`# syntax=docker/dockerfile:1`)
- Backend: Python 3.12-slim, multi-stage, `--mount=type=cache` for `uv`
- Frontend: Next.js standalone output, `--mount=type=cache` for npm
- 모든 컨테이너 **non-root** 유저
- `.env` 는 호스트에 두고 `env_file`로 로드, 이미지에 미포함

### CLAUDE.md `## Commands` 채울 내용

```bash
# Backend (cd backend)
uv pip install -r requirements-dev.txt
pytest                                     # full suite
pytest tests/test_parse.py::test_x         # single test
ruff check . && ruff format .
uvicorn app.main:app --reload

# Frontend (cd frontend)
npm install
npm test
npm run lint
npm run dev

# 통합 (도커 컴포즈)
docker compose -f infra/docker-compose.yml up -d
```

---

## 10. 비기능 요구사항

| 항목 | 값 |
|---|---|
| 단일 `.docx` 파일 크기 상한 | 50 MB |
| raw 파일 보존 | 30일 후 자동 삭제 |
| 메타데이터 보존 | 영구 |
| 인스턴스 수 | 1 (단일 VPS) |
| HTTPS | 필수 |
| 쿠키 정책 | httpOnly + Secure + SameSite=Lax |
| 비밀번호 해시 | bcrypt (cost=12) |

---

## 11. 보류 / 향후 결정

- OAuth (Google/GitHub) — Phase 4 이후 검토
- LLM 기반 의미 정리 — 도입 시 별도 의사결정 필요
- PDF 출력 — 현재 미지원, 요청 누적 시 LibreOffice headless 컨테이너 추가 검토
- 다중 파일 병합(B) — Phase 5 옵션, 헤딩 충돌 정책은 그때 다시 논의

---

## Phase 1 완료 검증 — 2026-04-26

- 백엔드 테스트: 37/37 PASS
- 프론트 빌드: 성공 (0 errors, 2 warnings — config 파일 스타일 경고)
- 통합 round-trip (docker-compose 4 서비스):
  - GET /api/health: ✅
  - 회원가입/로그인/me: ✅
  - 업로드 → outline (4 blocks) → 렌더 → 다운로드: ✅ (결과 파일 크기: 36K bytes, Microsoft OOXML)
  - 프론트 랜딩 (`/`): ✅
- 인프라 수정 사항 (검증 중 발견):
  - `infra/docker-compose.yml` — `db` 서비스에 `env_file: ../.env` 추가 (compose 변수 치환용 `.env`가 infra/ 디렉터리 기준이라 미동작)
  - `infra/.env` 심볼릭 링크 추가 (`../.env` 가리킴) — `docker compose up` 시 `--env-file` 없이 실행 가능
  - `backend/Dockerfile` — `gosu` 설치 및 `docker-entrypoint.sh` 추가 (Docker volume이 root 소유로 마운트되어 `app` 유저가 `/data/docs` 쓰기 불가 → 엔트리포인트에서 chown 후 gosu로 권한 강등)
- 알려진 한계 (Phase 2~5에서 해결할 항목):
  - 표/이미지/필드는 placeholder만 출력
  - 빌트인 템플릿 1개 (`기본 보고서`)만 시드, 사용자 커스텀 폼 미구현
  - 상대 참조 (TOC/REF/PAGEREF) 미지원
  - 다중 파일 병합 미구현

---

## Phase 2 완료 검증 — 2026-04-26

- 백엔드 테스트: 61/61 PASS
- 프론트 빌드: 성공 (라우트 확장: `/templates` 추가, 모든 페이지 Apple iOS 토큰 적용)
- 통합 라운드트립 (docker-compose 4 서비스, messy 샘플):
  - 빌트인 3개 (`기본 보고서`, `공문 양식`, `학술 논문`) ✅
  - 커스텀 템플릿 생성·적용·삭제 (CRUD) ✅
  - 빌트인 보호 (DELETE → 403) ✅
  - 업로드: 42 blocks 추출 (Phase 1 대비 빈 문단 1개 축약), 헤딩 14개 감지 (Phase 1: 5개 → 2.1: +9 from `(1)`/`①`/`*** ***`/표지 휴리스틱)
  - 커스텀 템플릿으로 렌더링 + 다운로드 (.docx 200) ✅
  - 히스토리에 적용 템플릿 이름 노출 ✅
  - 작업/템플릿 삭제 + UI에서 즉시 갱신 ✅
- 추가 구현 (사용자 요청):
  - **다중 선택 outline 에디터** — 단일/Shift/⌘·Ctrl 클릭 + Tab 일괄 레벨 변경 ✅
  - 정렬 정보(가운데/오른쪽) 보존 → 재렌더 시 유지 ✅
  - 로그인 페이지에서 회원가입 동선 축소 (OAuth 도입 예고)
  - 이메일 검증 완화 (RFC strict → 도메인 모양만 확인 — 임시)
  - 비로그인 랜딩에서 업로드 차단 + 로그인 CTA
- 알려진 한계 (Phase 3~5에서 해결할 항목):
  - 표/이미지/필드는 여전히 placeholder만 (Phase 3)
  - 상대 참조 (TOC/REF/PAGEREF) 미지원 (Phase 4)
  - 다중 파일 병합 미지원 (Phase 5)
  - StyleSpec 폼은 부분 필드만 (번호 형식·표 스타일은 빌트인 값 그대로) — 향후 확장

---

## Phase 2.3 완료 검증 — 2026-04-26

사용자 요청 추가 기능 묶음:

- **H4 / H5 헤딩 지원** — Block.level 0..5, StyleSpec heading.h4/h5 추가, 빌트인 3종 모두 h4/h5 폰트 시드 확장 (`기본 보고서` 11/10pt, `공문 양식` 11/10pt 바탕, `학술 논문` 11/10pt Cambria) ✅
  - 빌트인 spec은 매 부팅 시 JSON에서 재시드 (idempotent overwrite, 커스텀 미터치)
  - 파서: `Heading 4/5`, `제목 4/5`, `\d+\.\d+\.\d+\.\d+\.` (H4 휴리스틱), `\d+\.\d+\.\d+\.\d+\.\d+\.` (H5)
- **outline 본문 추가/삭제** — 각 블록 hover 시 "+ 본문 추가" 버튼, ✕ 단일 삭제, 더블클릭 인라인 텍스트 편집 (Enter/blur 저장, Esc 취소) ✅
- **outline 다중 일괄 삭제** — 선택된 N개에 대해 `Delete`/`Backspace` + 확인 다이얼로그로 한 번에 제거 ✅
- **히스토리 일괄 삭제** — 체크박스 + 전체선택(indeterminate) + "선택 삭제 (N)" 버튼, `Promise.all` 병렬 DELETE ✅
- **템플릿 일괄 삭제** — 커스텀만 체크박스 노출 (빌트인은 보호), 동일 패턴 ✅
- 검증 결과:
  - 백엔드 테스트 65/65 PASS (4 신규 H4/H5 테스트)
  - 통합 라운드트립: 빌트인 3개에 h4/h5 자동 반영 (h4/h5: true), level=4 PUT 정상 (200), 새 블록 삽입 PUT 정상, render 200, docx 36KB, 일괄 삭제 (3 → 1) 정상 동작

---

## Phase 3 완료 검증 — 2026-04-27

- 표 → 마크다운 read-only 렌더 완료 (react-markdown + remark-gfm) — `TableBlock`
- 표 OOXML clone 디스크 보존 + 렌더 시 reembed — `clone_table_xml`, `reembed_table`
- 표 스타일(보더 색·굵기, 헤더 배경/볼드, 셀 폰트 사이즈) override 적용 — `apply_table_style`
- 이미지 추출(`<a:blip r:embed>`) → /data/images/<job_id>/image-N.<ext> — `iter_image_blobs`
- 이미지 미리보기 라우트 `GET /jobs/{id}/images/{idx}` (인증, 본인 job 만)
- 이미지 hover 미리보기 + placeholder + 캡션 — `ImageBlock`
- 캡션 휴리스틱(표 N./그림 N./Table N./Figure N./[그림 N]) — `extract_caption`
- 표/이미지 직전·직후 캡션 흡수 → outline 에서 해당 paragraph 빠짐
- 병합셀(`gridSpan`/`vMerge`)은 `[병합셀]` 마커, 원본 OOXML 은 그대로 보존(R4)
- 손상된 OOXML 조각은 `[표 원본 누락 — raw_ref]` placeholder 로 graceful degradation

알려진 한계 (Phase 4~5 에서 해결):
- 필드(TOC/REF/PAGEREF) 는 여전히 placeholder
- 이미지 OOXML 자체의 reembed 는 미구현 — 현재는 placeholder 문단으로 보존
- 중첩표는 마크다운에서 평탄화 표시(원본은 보존)
- `test_api_*.py` 는 `TEST_DATABASE_URL` env 가 필요 (Phase 1 부터 알려진 환경 의존성)

---

## Phase 4 완료 검증 — 2026-04-27

- 필드 검출 — `<w:fldSimple>` + `<w:fldChar>` 영역, `w:instr`/`<w:instrText>` 내용으로 종류(toc/ref/pageref/unknown) 분류 (`extract_field.detect_field_kind`)
- 북마크 검출 — `<w:bookmarkStart>` 의 name/id 매핑 (`extract_field.extract_bookmarks`)
- 필드 미리보기 — `<w:fldSimple>` 자식까지 walk 해서 display 텍스트 추출 (python-docx `paragraph.text` 의 fldSimple skip 우회)
- 필드/북마크가 있는 문단은 통째로 `<w:p>` deepcopy → `raw_ooxml_path(...)/field-N.xml` 디스크 보존 (`clone_paragraph_xml`)
- 렌더 시 paragraph 의 `raw_xml_ref` 가 있고 ids 가 있으면 새 paragraph 생성 대신 원본 `<w:p>` 그대로 본문에 삽입 (`reembed_paragraph`)
- 라운드트립 무결성: TOC 의 `\o "1-3" \h \z \u` instr 텍스트 + 북마크 `w:id` 페어링 보존 검증 PASS
- 손상/누락된 fragment 는 `[원본 누락 — {raw_ref}]` placeholder 로 graceful degradation
- 프론트: 보존된 문단에 `📎` 배지 (필드 종류 tooltip), 에디터 상단에 "필드/북마크 N개 보존됨, M개 검토 필요" 요약
- 디스크 정리: `delete_job` 의 `<jobdir>/raw/` recursive cleanup 이 `field-N.xml` 도 포함 (Phase 3 인프라 그대로 활용)

알려진 한계 (Phase 5 후보):
- 필드 보존 문단은 **원본 스타일이 유지** — 새 StyleSpec 의 헤딩 폰트/사이즈가 reembed 된 문단에는 적용되지 않음 (R1 trade-off, 코드 + spec 양쪽에 명시)
- 북마크만 있는 헤딩 문단도 동일하게 원본 보존 — 향후 "북마크만 추출해 새 헤딩에 주입" 으로 개선 가능
- IF/SEQ 같은 중첩 필드는 best-effort: 원본 OOXML 그대로 보존되므로 깨지지 않지만 분류는 `unknown` (UI 에서 검토 필요로 표시)

---

## Phase 5 완료 검증 — 2026-04-27

> spec 의 원래 Phase 5 (다중 파일 **병합** B 모드) 와 다른 방향. 사용자 의도에 맞춰 **다중 파일 루프 + 병렬 처리** 로 재정의 (각 파일 독립 변환, 한 문서로 합치지 않음).

- 신규 엔드포인트 3개 (`backend/app/api/jobs.py`):
  - `POST /jobs/batch/upload` — multipart 다파일, `asyncio.to_thread(parse_docx, ...)` + `asyncio.Semaphore(MAX_BATCH_PARALLEL)` 로 병렬 파싱, 파일 단위 검증/실패 격리
  - `POST /jobs/batch/render` — `{job_ids, template_id, overrides}`, 동일 동시성 패턴으로 `render_docx` 병렬
  - `GET /jobs/batch/download?ids=a,b,c` — `zipfile.ZIP_DEFLATED` 로 result_path 들을 ZIP 스트림 응답
- `Settings.max_batch_parallel` (기본 4, env `MAX_BATCH_PARALLEL`)
- 동시성 단위 테스트 — `tests/test_batch_concurrency.py`: parse/render 의 병렬 실행이 직렬 대비 느려지지 않음 (회귀 가드)
- 프론트 `/batch` 페이지: 다파일 input → 템플릿 선택 → "전체 변환" → 파일별 진행 상태 (⏳/🟢/✅/❌) → "전체 다운로드 (zip)"
- 랜딩 헤더에 "일괄 변환" 링크 추가 (인증된 경우만)
- 단일 파일 플로우 (`/`, `/editor/[jobId]`, `/editor/[jobId]/preview`) 와 검토 페이지는 변경 없음

알려진 한계:
- batch 모드는 outline 에디터 / 검토 페이지를 거치지 않음 (속도/UX 단순화 우선) — 검토 필요 시 단일 모드 사용
- 동시성 한계는 `MAX_BATCH_PARALLEL` 로 조정 (CPU-bound 한계로 GIL 영향 — lxml/zipfile 의 C 확장 부분만 병렬화 효과)
- 50 파일 / 50 MB-per-file 상한 (메모리 + 요청 시간 보호)
- spec 의 원래 의미의 다중 파일 병합 (B 모드) 은 향후 옵션으로 남겨둠 — 헤딩 충돌 정책(병렬/강등) 디자인은 미정
