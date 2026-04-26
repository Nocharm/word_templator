# 저널 & 에디토리얼 · 다크 모드

`Journal & Editorial — Dark Mode`

> 차분한 와인 레드와 세리프 폰트로 깊이 있는 읽기 경험

---

## 컬러 팔레트

| 역할 | 이름 | HEX |
|---|---|---|
| Primary | 메인 컬러 | `#DC2626` |
| Secondary | 서브 컬러 | `#450A0A` |
| Background | 배경 | `#1A1414` |
| Surface | 서피스 | `#262020` |
| Text | 본문 | `#F5F1EB` |
| Text Muted | 보조 텍스트 | `#A8A29E` |
| Border | 보더 | `#3D3434` |

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
  --color-primary: #DC2626;
  --color-secondary: #450A0A;
  --color-background: #1A1414;
  --color-surface: #262020;
  --color-text: #F5F1EB;
  --color-text-muted: #A8A29E;
  --color-border: #3D3434;

  --font-ko: 'Nanum Myeongjo', 'Noto Serif KR', 'Source Serif Pro', serif;
  --font-en: 'Playfair Display', 'Source Serif Pro', Georgia, serif;
}
```

> **로딩 주의**: 한글 세리프(`Nanum Myeongjo`/`Noto Serif KR`)는 시스템 기본 폰트가 아닙니다. Google Fonts 또는 자체 호스팅으로 명시적 로드가 필수이며, 로드 실패 시 sans-serif로 떨어지면 컨셉이 깨집니다.
