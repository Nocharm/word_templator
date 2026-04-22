# Claude Code 템플릿 사용 가이드

이 가이드는 `CLAUDE.md` + `rules/*.md` 허브 구조 템플릿을 새 프로젝트에서 사용하는 방법을 설명한다.

---

## 파일 구성

```
CLAUDE.md                       # 허브. Project 설명 + Commands + @import 목록
rules/
  comments.md                   # 주석 규칙
  config.md                     # 설정 관리
  docker.md                     # Docker
  testing.md                    # 테스트
  git.md                        # Git 컨벤션
  security.md                   # 보안
  dependencies.md               # 의존성 관리
  sync-checklist.md             # 코드 변경 동기화 체크리스트
  error-handling.md             # 에러 처리
  languages/
    python.md                   # Python 전용 규칙
    typescript.md               # TypeScript/JavaScript 전용 규칙
```

**관계:**
- `CLAUDE.md` 하단에 `@rules/<file>.md` 형식의 줄이 있다.
- 이것은 Claude Code 의 import 기능으로, 해당 파일의 내용을 자동으로 읽어온다.
- 일반 규칙은 `rules/` 직속, 언어별 규칙은 `rules/languages/` 에 있다.

---

## Step 1. 파일 복사

새 프로젝트 폴더에 템플릿 전체를 복사한다.

```bash
# Python 백엔드 프로젝트
cp    /path/to/template/CLAUDE.md     ~/new-project/CLAUDE.md
cp -r /path/to/template/rules         ~/new-project/rules
cp    /path/to/template/.gitignore    ~/new-project/.gitignore

# TypeScript 프론트엔드 프로젝트 — 동일한 방식으로 복사
# Python + TypeScript 풀스택 프로젝트 — 동일한 방식으로 복사
```

또는 템플릿 레포를 통째로 clone 해도 된다.

```bash
git clone <template-repo-url> ~/new-project
cd ~/new-project
rm -rf .git                      # 템플릿의 git 이력 제거
git init                         # 새 프로젝트의 git 시작
```

> **중요:** 허브 파일은 반드시 `CLAUDE.md` 라는 이름이어야 한다. Claude Code 는 프로젝트 루트의 `CLAUDE.md` 를 자동으로 읽는다.

---

## Step 2. 사용하지 않는 언어 import 제거

`CLAUDE.md` 맨 아래를 확인한다.

```markdown
## Language-Specific Rules

프로젝트에서 사용하는 언어만 남기고 나머지 줄은 삭제한다.

@rules/languages/python.md
@rules/languages/typescript.md
```

- **Python 만 쓰는 프로젝트:** `@rules/languages/typescript.md` 줄을 삭제한다.
- **TypeScript 만 쓰는 프로젝트:** `@rules/languages/python.md` 줄을 삭제한다.
- **둘 다 쓰는 프로젝트:** 두 줄 모두 유지한다.

삭제하지 않아도 에러는 나지 않지만, 해당 파일을 실제로 쓰지 않는다면 불필요한 규칙이 컨텍스트를 차지한다.

> 언어 규칙 파일 자체를 지울 필요는 없다. `@import` 줄만 제거하면 Claude 컨텍스트에서 빠진다.

---

## Step 3. Commands 섹션 채우기

`CLAUDE.md` 의 `Commands` 섹션에 `<placeholder>` 가 있다. 프로젝트의 실제 명령어로 교체한다.

**교체 전:**
```bash
# Build
<your build command here>

# Test
<your test command here>              # full suite
<your single test command here>       # single test

# Lint / Format
<your lint command here>
<your format command here>

# Dev server
<your dev server command here>
```

**교체 후 예시 — Python FastAPI:**
```bash
# Build
uv pip install -r requirements.txt            # fallback: pip install -r requirements.txt

# Test
pytest tests/ -v                              # full suite
pytest tests/test_api.py::test_health -v      # single test

# Lint / Format
ruff check .
black .

# Dev server
uvicorn app.main:app --reload
```

**교체 후 예시 — Next.js:**
```bash
# Build
npm install && npm run build

# Test
npm test                              # full suite
npm test -- --testPathPattern=auth    # single test

# Lint / Format
npm run lint
npx prettier --write .

# Dev server
npm run dev
```

**교체 후 예시 — Python + Docker:**
```bash
# Build
uv pip install -r requirements.txt            # fallback: pip install -r requirements.txt
docker-compose build

# Test
pytest tests/ -v

# Lint / Format
ruff check .
black .

# Dev server (로컬)
uvicorn app.main:app --reload

# Dev server (Docker)
docker-compose up --build
```

**이 섹션이 중요한 이유:** Claude Code 는 이 명령어를 보고 테스트 실행·빌드 확인 등을 수행한다. 올바른 명령어가 없으면 Claude 가 잘못된 명령어를 추측해 실행할 수 있다.

---

## Step 4. 프로젝트 특화 규칙 추가 (선택)

범용 규칙 외에 프로젝트에만 해당하는 규칙이 있다면 두 가지 방법이 있다.

**방법 A — `CLAUDE.md` 에 직접 추가:**

`## Rules` 블록 위쪽에 프로젝트 전용 섹션을 만든다.

```markdown
## Project Structure

```
src/
├── api/          # API 라우터. 비즈니스 로직 금지.
├── services/     # 비즈니스 로직 담당.
├── models/       # DB 모델 정의.
└── utils/        # 공용 유틸리티.
```

## Naming Conventions
- API 엔드포인트 함수: get_*, create_*, update_*, delete_*
- 서비스 함수: process_*, validate_*, calculate_*

## Gotchas
- Redis 연결은 반드시 connection pool 을 사용할 것
- 파일 업로드 크기 제한: 50MB (nginx 와 앱 양쪽에서 설정)
```

**방법 B — `rules/` 에 새 파일 생성:**

규칙이 길거나 여러 개라면 `rules/project-structure.md` 같은 파일을 만들고, `CLAUDE.md` 의 `## Rules` 목록에 `@rules/project-structure.md` 를 추가한다.

프로젝트별로 계속 커지는 규칙은 B 방법이 낫다. 허브가 계속 얇게 유지된다.

---

## Step 5. git 에 커밋

`CLAUDE.md`, `rules/`, `.gitignore` 는 git 에 커밋한다. 팀원들도 같은 규칙을 적용받을 수 있도록 공유하는 것이 권장된다.

```bash
git add CLAUDE.md rules/ .gitignore
git commit -m "docs: add Claude Code project rules"
```

본인만 사용하고 팀과 공유하지 않을 규칙이 있다면 `CLAUDE.local.md` 파일에 작성한다. `.gitignore` 에 이미 포함되어 있다.

---

## 전체 체크리스트

- [ ] 1. 템플릿 파일(`CLAUDE.md`, `rules/`, `.gitignore`)을 프로젝트 루트에 복사
- [ ] 2. 사용하지 않는 언어의 `@rules/languages/*.md` 줄 삭제
- [ ] 3. `CLAUDE.md` 의 `Commands` 섹션을 실제 명령어로 교체
- [ ] 4. (선택) 프로젝트 특화 규칙 추가 (`CLAUDE.md` 직접 또는 `rules/` 새 파일)
- [ ] 5. git 에 커밋

---

## FAQ

**Q: `CLAUDE.md` 파일 위치가 프로젝트 루트가 아니면?**
A: Claude Code 는 프로젝트 루트의 `CLAUDE.md` 만 자동으로 읽는다. 또는 `.claude/CLAUDE.md` 에 넣어도 된다.

**Q: 규칙 파일 이름을 바꿔도 되나?**
A: 네. 단, `CLAUDE.md` 하단의 `@import` 경로도 함께 바꿔야 한다.
예: `@rules/python.md` → `@rules/languages/python-strict.md`

**Q: 규칙이 너무 많으면 Claude 가 무시하나?**
A: Anthropic 공식 권장은 파일당 200줄 이하, 전체 규칙 150개 이하다. 넘으면 준수율이 균일하게 하락한다. 허브 구조 덕분에 `rules/` 로 분리되어 있지만, 총량 자체가 너무 커지지 않도록 관리할 것.

**Q: 팀원이 다른 AI 도구(Cursor, Copilot)를 쓰면?**
A: `CLAUDE.md` 는 Claude Code 전용이다. 다른 도구는 각자의 설정 파일을 사용한다 (Cursor: `.cursorrules`, Copilot: `.github/copilot-instructions.md`). 내용은 동일하게 작성하되 파일명·형식을 맞추면 된다.

**Q: `CLAUDE.md` 와 `.claude/settings.json` 의 차이는?**
A:
- `CLAUDE.md` = "이렇게 해줘" (권장 사항, Claude 가 판단해서 따름)
- `settings.json` = "이것만 허용" (권한 설정, 시스템이 강제)

예: "pytest 를 허용"은 `settings.json`, "테스트는 mock 으로"는 `CLAUDE.md` 에 해당한다.

**Q: `rules/` 폴더가 아니라 `.claude/` 에 넣으면 안 되나?**
A: `.claude/` 는 Claude Code 하네스 설정(`settings.json`, `commands/`, `agents/`, `hooks/`)의 자리다. `@import` 로 읽히는 지침 문서는 성격이 다르므로 `rules/` 에 두는 것이 의미상 깔끔하다. 기술적으로는 `.claude/` 에 넣어도 동작한다.
