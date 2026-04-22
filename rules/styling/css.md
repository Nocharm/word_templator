# Styling Rules

프로젝트에서 CSS / Tailwind 를 쓸 때 따르는 규칙. **프론트엔드 프로젝트 간 통일감을 위해 토큰 구조를 고정**하고, 프로젝트마다 concept color / 폰트만 바꾼다.

---

## 디자인 토큰 선(先) 정의 — 필수

프로젝트 시작 시, 스택에 맞는 템플릿을 **반드시 먼저 채운다**. 채우지 않은 상태로 컴포넌트 스타일 작성 금지.

| 스택 | 템플릿 | 배치 |
|------|--------|------|
| Tailwind CSS 사용 | `templates/tailwind.theme.ts` | 프로젝트 루트에 복사 → `tailwind.config.ts` 의 `theme.extend` 로 병합 |
| vanilla CSS / CSS Modules | `templates/design-tokens.css` | `styles/design-tokens.css` 로 복사 → `app/layout.tsx` (또는 루트 CSS) 에서 import |

**프로젝트마다 바꿔도 되는 값:**
- Concept color (`primary`, `secondary`, `accent`)
- 폰트 패밀리 (`heading`, `body`)

**절대 바꾸지 않는 구조 (프로젝트 간 동일):**
- 토큰 이름 (`primary`, `space-4`, `radius-md`, `shadow-lg` 등)
- Spacing 스케일 (4px grid: 1, 2, 3, 4, 6, 8, 12, 16)
- Font size 스케일 (xs / sm / md / lg / xl / 2xl)
- Radius 스케일 (sm / md / lg / full)
- Shadow 스케일 (sm / md / lg)
- Z-index 레이어 이름 (base / dropdown / modal / toast)

이유: Claude 가 여러 프로젝트를 오갈 때 토큰 번역 없이 같은 이름으로 참조할 수 있게 한다.

---

## 토큰 사용 규칙

- **하드코딩 금지**:
  - ❌ `color: #3366FF`, `padding: 16px`, `font-size: 14px`
  - ✅ `color: var(--color-primary)`, `padding: var(--space-4)`, `font-size: var(--fs-sm)`
  - ✅ Tailwind: `text-primary`, `p-4`, `text-sm`
- 색·폰트 사이즈·간격·라운딩·섀도·z-index 전부 토큰 참조.
- 토큰에 없는 값이 필요하면 **먼저 템플릿에 토큰을 추가**. 임시 inline 금지.

---

## CSS 작성

- `!important` 금지 — 선택자 수정 또는 토큰 오버라이드로 해결.
- 전역 CSS 는 **리셋 + 토큰 + typography 기본**만. 컴포넌트 스타일은 CSS Module (`*.module.css`) 또는 Tailwind 유틸로 국지화.
- 벤더 프리픽스는 autoprefixer 에 맡김 — 수동 작성 금지.
- 미디어 쿼리 breakpoint 는 토큰으로 통일 (`--bp-sm`, `--bp-md`, `--bp-lg`).

---

## Tailwind 특이사항

- 유틸 클래스는 **정적 문자열**. 동적 조합 (`` `bg-${color}` ``) 은 purge 대상이므로 매핑 객체로 해결:
  ```ts
  const COLOR_MAP = { success: 'bg-success', danger: 'bg-danger' } as const;
  <div className={COLOR_MAP[status]} />
  ```
- 반복되는 유틸 조합은 `@apply` 로 추출하지 않는다 — **컴포넌트 추출**로 해결 (재사용성과 타입이 따라감).
- Arbitrary value (`bg-[#3366FF]`) 남발 금지. 값이 필요하면 `tailwind.theme.ts` 에 토큰 추가 후 그 이름으로 사용.
- `className` 병합은 `clsx` 또는 `tailwind-merge` 사용.

---

## 다크 테마 (선택)

다크 테마를 쓸 경우, 토큰의 **값만 바꾸고 이름은 유지**한다.
- CSS: `[data-theme='dark'] { --color-bg: ...; }`
- Tailwind: `darkMode: 'class'` + `dark:` 접두

컴포넌트 코드는 그대로 — 토큰 이름으로 참조하기 때문에 테마 전환 시 수정 불필요.
