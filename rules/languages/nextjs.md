# Next.js Rules

Next.js 프로젝트 규칙. **App Router 기준**이다. TypeScript 규칙(`rules/languages/typescript.md`)과 함께 사용한다.

---

## Router

- **App Router (`app/`) 기본.** Pages Router(`pages/`)는 레거시 — 신규 프로젝트에서 금지.
- 파일 관례:
  - `page.tsx` — 라우트 UI
  - `layout.tsx` — 공유 레이아웃
  - `loading.tsx` — 로딩 UI (Suspense 경계)
  - `error.tsx` — 에러 바운더리 (`"use client"` 필수)
  - `not-found.tsx` — 404 UI
  - `route.ts` — API Route Handler
- 동적 세그먼트 `[param]`, 병렬 라우트 `@slot`, 인터셉트 `(..)`.

---

## Server vs Client Components

- **Server Component 기본.** `"use client"` 는 다음일 때만 붙인다:
  - 브라우저 이벤트 핸들러 (`onClick`, `onChange` 등)
  - 브라우저 전용 API (`localStorage`, `window`, `document`)
  - React 훅 (`useState`, `useEffect`, `useReducer`, 커스텀 훅 포함)
  - Client-only 3rd party 라이브러리
- Client Component 는 **리프(leaf) 에** 배치. 상위는 Server Component 로 유지.
- Client Component 가 Server Component 를 직접 import 하지 않는다 — props 로 children 을 넘긴다.

---

## 데이터 페칭

- **읽기**: Server Component 에서 `fetch` 직접 사용. 캐싱 전략을 **반드시 명시**한다.
  - `{ cache: 'force-cache' }` — 기본값, 정적 데이터
  - `{ cache: 'no-store' }` — 요청마다 최신
  - `{ next: { revalidate: 60 } }` — ISR
- **변경**: Server Action (`"use server"`). Client Component 에서 `/api/...` 를 `fetch` 하지 않는다.
- `useEffect` 로 데이터 페칭 금지 — Server Component 또는 Server Action 으로 해결.

---

## 최적화 강제

- `<img>` 금지 → `next/image` `<Image>`. `alt`, `width`, `height`, `priority`(above-the-fold) 설정.
- 내부 라우팅 `<a>` 금지 → `next/link` `<Link>`.
- 웹폰트는 `next/font` — CLS 방지, 자동 self-hosting. CDN `<link>` 로 로드 금지.
- 외부 스크립트는 `next/script`. `strategy` (`beforeInteractive` / `afterInteractive` / `lazyOnload`) 명시.

---

## SEO / Metadata

- 각 `page.tsx` / `layout.tsx` 에 `metadata` export 또는 `generateMetadata` 함수.
- `<head>` 직접 수정 금지.
- 모든 페이지는 `title`, `description` 필수. 공유되는 페이지는 OpenGraph / Twitter 카드 추가.

---

## 환경변수

- 클라이언트 노출값만 `NEXT_PUBLIC_` 접두. 그 외는 서버 전용.
- 서버 전용 값을 Client Component 에서 직접 참조하지 않는다 — Server Action / Route Handler 로 감싼다.
- `.env.local` 은 `.gitignore`, `.env.example` 은 커밋해 팀에 스키마 공유.

---

## 디렉터리 관례

```
app/
├── (marketing)/           # 라우트 그룹 — URL 에 반영 안 됨, 레이아웃 분리용
├── api/<resource>/route.ts
├── _components/           # 해당 라우트 전용 (언더스코어 prefix = non-route)
├── layout.tsx
└── page.tsx
components/                # 전역 공용 컴포넌트
lib/                       # fetcher, 서버 유틸, 공용 로직
styles/                    # design-tokens.css 등 (CSS 프로젝트)
```

---

## Gotchas

- Server Component 는 `async` 가능, Client Component 는 `async` 컴포넌트로 불가.
- Route Handler 는 기본 정적 — 쿠키/헤더/DB 접근 시 `export const dynamic = 'force-dynamic'`.
- `cookies()`, `headers()`, `draftMode()` 는 Server 전용. Client 에서 호출 시 빌드 오류.
- Tailwind 클래스는 **정적 문자열**로 — `bg-primary` ✅, `` `bg-${color}` `` ❌ (purge 대상).
- `'use client'` 파일에서 서버 전용 모듈 (fs, path 등) import 금지 — 번들에 포함되어 빌드 실패.
