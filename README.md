# Claude Code Template

Claude Code 프로젝트용 공통 규칙 템플릿.
새 프로젝트 루트에 이 레포의 파일을 복사한 뒤, `CLAUDE.md` 의 `Commands` 섹션만 프로젝트에 맞게 채워 넣으면 된다. Claude Code 가 `CLAUDE.md` 를 자동으로 읽고, 허브에서 `@import` 되는 `rules/*.md` 까지 모두 컨텍스트로 로드한다.

## 구성

| 파일/폴더 | 역할 |
|-----------|------|
| `CLAUDE.md` | 허브. 프로젝트 설명 + Commands + 규칙 `@import` 목록 |
| `rules/` | 일반 규칙 (주석·설정·Docker·테스트·Git·보안·의존성·동기화·에러 처리) |
| `rules/languages/` | 언어별 규칙 (Python, TypeScript) |
| `USAGE.md` | 상세 사용 가이드 (한국어) |
| `.gitignore` | Claude 로컬 파일·env·OS·언어별 산출물 제외 |

## Quick Start

```bash
# 1) 템플릿을 새 프로젝트 루트에 복사 (예: cp -r 또는 clone)
cp -r /path/to/this/repo/* ~/new-project/
cp /path/to/this/repo/.gitignore ~/new-project/

# 2) CLAUDE.md 의 Commands 섹션을 실제 명령어로 채우기
#    (사용하지 않는 @rules/languages/*.md 줄은 삭제)

# 3) 커밋
cd ~/new-project
git add CLAUDE.md rules/ .gitignore
git commit -m "docs: add Claude Code project rules"
```

상세 절차·예시·FAQ 는 `USAGE.md` 참고.

## 허브 구조를 쓰는 이유

- `CLAUDE.md` 는 항상 짧게 유지 → 프로젝트 overview 가 한눈에 들어온다
- 규칙을 바꿔도 허브는 건드리지 않는다 (`rules/*.md` 만 수정)
- 규칙을 끄려면 `@import` 한 줄만 지운다
- 언어별 규칙은 `rules/languages/` 로 분리해 일반 규칙과 시각적으로 구분
