# Word Templator

Word(.docx) 문서를 빌트인 템플릿(StyleSpec) 기준으로 표·문단·번호·폰트를 표준화해 다시 .docx로 출력하는 풀스택 웹 도구. 사용자 인증·히스토리·커스텀 템플릿·캡션 자동 번호·Word SEQ/REF 필드 emit 지원.

## 빠른 시작 (Docker Compose)

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

운영용 SQLite 파일은 `filedata` 볼륨에 영속. 외부 DB 의존 없음.

## 초기 로그인 계정 (시연용)

부팅 시 자동으로 생성됩니다. **운영 환경에서는 즉시 비밀번호를 변경하세요.**

| 역할 | 이메일 | 비밀번호 |
|------|--------|----------|
| 관리자 | `admin@local.test` | `admin1234` |
| 일반 사용자 | `user@local.test` | `user1234` |

## 데모 SOP 문서

`user@local.test` 로 로그인하면 `Demo SOP (시연용 30p).docx` 작업이 미리 등록되어 있습니다. 30 페이지 분량의 SOP 샘플로 4단 헤딩·표·그림·섹션 방향 전환을 포함하며, 업로드가 차단된 환경에서도 편집기/미리보기/다운로드 전체 플로우를 시연할 수 있습니다.

## 주요 기능

- **첫 파싱 정보 보존** — Word 빌트인 스타일(`Heading 1..5`/`제목 1..5`/`Title`/`Subtitle`), `w:outlineLvl`, 사용자 정의 스타일의 `basedOn` 체인을 모두 추적해 회사 커스텀 스타일도 헤딩으로 인식
- **헤딩 위계 검증** — 직전 헤딩보다 2단계 이상 깊은 단락에 경고 표시(노란 좌측 줄 + 한 단계 끌어올리기 버튼). 새로 편집할 때 Tab 으로 위계를 어기는 것은 차단
- **본문/노트 단축키** — 에디터에서 단락 선택 후 `p` (본문) / `n` (노트). 노트는 시각적으로 구분(이탤릭 + 들여쓰기 + 좌측 줄)
- **캡션 자동 번호 + Word 참조 필드** — 표/이미지에 캡션이 누락되면 위에서 순서대로 `그림 N`/`표 N` 자동 부여. 본문에 적힌 `그림 1`/`표 2` 같은 참조는 출력 시 Word `REF` 필드로 emit. 사용자가 다운로드한 .docx 를 Word 에서 열고 `F9` 누르면 모든 캡션·본문 참조가 자동 갱신
- **다국어 라벨** — `StyleSpec.caption.figure_label`/`table_label`/`separator` 로 `Figure 1: ...` 같은 영문 캡션 형식도 지원

## 개발

```bash
# Backend (Python 3.11) — 루트 .env 를 자동 인식 (../.env / .env 다중 경로)
cd backend
python3.11 -m venv .venv && . .venv/bin/activate
uv pip install -r requirements-dev.txt        # fallback: pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000

# Frontend (Next.js 15 + React 19) — 백엔드를 :8000 로 직접 호출하려면 frontend/.env.local 작성
cd frontend
echo 'NEXT_PUBLIC_API_BASE=http://localhost:8000' > .env.local   # nginx 프록시 미사용 시
npm install --legacy-peer-deps
npm run dev                                    # http://localhost:3000
```

## 테스트

```bash
# Backend (SQLite in-memory — 외부 DB 불필요)
cd backend && .venv/bin/pytest -v

# Frontend (vitest + jsdom + @testing-library/react)
cd frontend && npm test && npm run lint && npx tsc --noEmit
```

## 프로젝트 구조

```
backend/                  # FastAPI + SQLAlchemy + python-docx
  app/
    api/                  # 인증·Job·Template·Feedback·Batch·Image 라우터
    domain/               # Pydantic Outline / StyleSpec 모델
    parser/               # .docx → Outline (heading 검출, 캡션 번호, 본문 ref 탐지)
    renderer/             # Outline + StyleSpec → .docx (SEQ/REF 필드 emit)
    db/                   # SQLAlchemy 모델·세션·마이그레이션·시드
  tests/                  # pytest (190+)
frontend/                 # Next.js 15 App Router + Tailwind
  app/                    # 페이지(login, dashboard, batch, editor, feedback, settings, admin)
  components/             # AppShell, OutlineEditor (ParagraphBlock, TableBlock, ImageBlock)
  lib/                    # API 클라이언트, i18n, 타입
infra/
  docker-compose.yml      # backend + frontend + nginx
  nginx/                  # 리버스 프록시 설정
docs/superpowers/         # 스펙 + 구현 계획 (브레인스토밍 → 설계 → 단계별 task)
rules/                    # Claude Code 코딩 규칙 (테스트·Git·보안·언어별)
CLAUDE.md                 # Claude Code 허브 (Commands + 규칙 @import)
```

## 기술 스택

- **Backend** Python 3.11, FastAPI, SQLAlchemy 2.0 + Alembic, SQLite, python-docx, Pydantic v2, pytest, ruff, mypy
- **Frontend** Next.js 15, React 19, TypeScript, Tailwind CSS, vitest 2 + @testing-library/react, ESLint
- **Infra** Docker Compose, nginx 1.27

## 관련 문서

- 실제 사용법 (에디터 단축키, 캡션 자동 번호 동작, 다운로드 후 Word F9 갱신) → `USAGE.md`
- Claude Code 로 작업 시 → `CLAUDE.md`
- 설계 스펙 / 구현 계획 → `docs/superpowers/`
