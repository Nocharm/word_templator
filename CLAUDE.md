# CLAUDE.md

허브 파일. 프로젝트 설명과 명령어는 이 파일에 직접 적고, 일반 규칙은 `rules/` 하위 파일을 `@import` 로 불러온다.

---

## Project

Word(.docx) 문서를 빌트인 템플릿(StyleSpec) 기준으로 표·문단·번호·폰트를 표준화해 다시 .docx로 출력하는 풀스택 웹 도구. 사용자 인증·히스토리·커스텀 템플릿 지원.

---

## Commands

```bash
# Backend (cd backend)
python3.11 -m venv .venv && . .venv/bin/activate
uv pip install -r requirements-dev.txt        # deps (fallback: pip install)
.venv/bin/pytest                              # full suite (SQLite in-memory) — 시스템 pytest 사용 X
.venv/bin/pytest tests/test_parse.py::test_xxx -v   # single test
.venv/bin/ruff check . && .venv/bin/ruff format .   # lint + format
.venv/bin/mypy app                            # 타입 체크 (strict)
uvicorn app.main:app --reload --port 8000     # dev server

# 데모 SOP .docx 재빌드 (코드/구조 변경 시)
python -m scripts.build_demo_sop

# Frontend (cd frontend)
npm install --legacy-peer-deps
npm test                                      # vitest run (jsdom + @testing-library/react)
npm run lint
npx tsc --noEmit                              # 타입 체크 (커밋 전)
npm run dev                                   # http://localhost:3000

# Compose (전체 스택)
cp .env.example .env && $EDITOR .env          # 시크릿 채우기
docker compose -f infra/docker-compose.yml up -d
```

---

## Rules

@rules/comments.md
@rules/config.md
@rules/docker.md
@rules/testing.md
@rules/git.md
@rules/security.md
@rules/dependencies.md
@rules/sync-checklist.md
@rules/error-handling.md

---

## Language-Specific Rules

프로젝트에서 사용하는 언어만 남기고 나머지 줄은 삭제한다.

@rules/languages/python.md
@rules/languages/typescript.md

---

## Frontend Rules (프론트엔드 프로젝트만)

프론트엔드 프로젝트가 아니면 이 섹션을 통째로 삭제한다.
CSS 사용 시 `templates/` 의 디자인 토큰 템플릿을 먼저 채우고 시작한다 (`rules/styling/css.md` 참조).

@rules/languages/nextjs.md
@rules/styling/css.md
