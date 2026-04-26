# 저널 & 에디토리얼 · 라이트 모드

`Journal & Editorial — Light Mode`

> 차분한 와인 레드와 세리프 폰트로 깊이 있는 읽기 경험

---

## 컬러 팔레트

| 역할 | 이름 | HEX |
|---|---|---|
| Primary | 메인 컬러 | `#7F1D1D` |
| Secondary | 서브 컬러 | `#FEF2F2` |
| Background | 배경 | `#FBF9F6` |
| Surface | 서피스 | `#FFFFFF` |
| Text | 본문 | `#1C1917` |
| Text Muted | 보조 텍스트 | `#78716C` |
| Border | 보더 | `#E7E2D9` |

---

## 타이포그래피

- 한글 · `Nanum Myeongjo`
- 영문 · `Playfair Display`

---

## 키워드

`뉴스` · `매거진` · `롱폼 콘텐츠`

---

## UI 특징

세리프 헤드라인

· 좁은 컬럼

· 절제된 액센트

---

## 활용 분야

뉴스, 매거진, 출판, 에세이 플랫폼

---

## CSS 변수 예시

```css
:root {
  --color-primary: #7F1D1D;
  --color-secondary: #FEF2F2;
  --color-background: #FBF9F6;
  --color-surface: #FFFFFF;
  --color-text: #1C1917;
  --color-text-muted: #78716C;
  --color-border: #E7E2D9;

  --font-ko: 'Nanum Myeongjo', 'Noto Serif KR', 'Source Serif Pro', serif;
  --font-en: 'Playfair Display', 'Source Serif Pro', Georgia, serif;
}
```

> **로딩 주의**: 한글 세리프(`Nanum Myeongjo`/`Noto Serif KR`)는 시스템 기본 폰트가 아닙니다. Google Fonts 또는 자체 호스팅으로 명시적 로드가 필수이며, 로드 실패 시 sans-serif로 떨어지면 컨셉이 깨집니다.
