# iOS 스타일 · 다크 모드

`iOS Style — Dark Mode`

> 블루 액센트, 둥근 곡선, 시스템 폰트로 정돈된 애플 감성

---

## 컬러 팔레트

| 역할 | 이름 | HEX |
|---|---|---|
| Primary | 메인 컬러 | `#0A84FF` |
| Secondary | 서브 컬러 | `#1C1C1E` |
| Background | 배경 | `#0A0A0B` |
| Surface | 서피스 | `#1C1C1E` |
| Text | 본문 | `#FFFFFF` |
| Text Muted | 보조 텍스트 | `#8E8E93` |
| Border | 보더 | `#38383A` |

---

## 타이포그래피

- 한글 · `Apple SD Gothic Neo`
- 영문 · `SF Pro Display`

---

## 키워드

`프리미엄 앱` · `컨슈머 디바이스` · `UX 정밀`

---

## UI 특징

큰 둥근 모서리(16px)

· 글래시 머티리얼

· 정밀한 타이포

---

## 활용 분야

프리미엄 앱, 컨슈머 프로덕트, 디바이스 UI

---

## CSS 변수 예시

```css
:root {
  --color-primary: #0A84FF;
  --color-secondary: #1C1C1E;
  --color-background: #0A0A0B;
  --color-surface: #1C1C1E;
  --color-text: #FFFFFF;
  --color-text-muted: #8E8E93;
  --color-border: #38383A;

  --font-ko: 'Apple SD Gothic Neo', -apple-system, system-ui, sans-serif;
  --font-en: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
}
```
