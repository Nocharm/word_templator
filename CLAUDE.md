# CLAUDE.md

허브 파일. 프로젝트 설명과 명령어는 이 파일에 직접 적고, 일반 규칙은 `rules/` 하위 파일을 `@import` 로 불러온다.

---

## Project

<한 줄 프로젝트 설명 — 이 저장소가 무엇이고 누가 쓰는지>

---

## Commands

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
