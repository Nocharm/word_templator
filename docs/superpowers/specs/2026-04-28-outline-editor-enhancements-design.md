# Outline Editor Enhancements — Design Spec

**Date:** 2026-04-28
**Status:** Brainstormed, awaiting user review
**Branch target:** new feature branch off `main` (current: `feat/onprem-deploy-prep`)

---

## 1. 목표 / 동기

Word(.docx) 문서를 표준 템플릿으로 변환하는 도구의 **첫 파싱 정확도** 와 **에디터 편집성** 을 개선한다. SOP 작성자가 첫 화면에서 다시 분류해야 하는 작업을 줄이고, 본문/노트 구분과 heading 위계, 캡션 번호 일관성을 자동으로 유지한다.

추가로, 로그인 직후 사이드바/상단바가 빈 상태로 보이는 라우터 캐시 버그를 함께 수정한다.

---

## 2. 요구사항 요약

| # | 요구사항 | 결정 |
|---|---|---|
| R1 | 직전 heading 보다 2단계 이상 깊어질 수 없음 (예: H1→H3 금지) | warning 마킹 + 시각화 + 새 편집 차단 (옵션 C) |
| R2 | `p` 단축키 = 본문, `n` 단축키 = 노트 | `Block.subtype: "body"\|"note"` 추가 (옵션 A) |
| R3 | 첫 인식에서 기존 문서의 문단 정보를 최대한 가져오기 (전부 본문으로 떨어뜨리지 않기) | outline level + Title/Subtitle alias + basedOn 체인 (옵션 B) |
| R4 | 캡션 누락 시 자동 번호 + 안내 문구. 캡션 변경 시 본문 카운팅 동기화 | 정규식 탐지 + Word SEQ/REF 필드 emit (옵션 B+D 하이브리드) |
| Bonus | 로그인 후 사이드바/상단바 누락 (새로고침 필요) | login 핸들러에 `router.refresh()` 추가 |

---

## 3. 데이터 모델 변경

### 3.1 `app/domain/outline.py`

```python
DetectedBy = Literal[
    "word_style",      # 기존
    "outline_level",   # 신규 — w:outlineLvl 기반
    "based_on",        # 신규 — basedOn 체인 추적 결과
    "heuristic",       # 기존
    "user",            # 기존
]

Subtype = Literal["body", "note"]
Warning = Literal["heading_skip"]


class CaptionRef(BaseModel):
    """본문 단락에서 정규식으로 탐지된 캡션 참조의 메타."""
    label_kind: Literal["figure", "table"]
    detected_number: int           # 탐지 시점의 원래 숫자
    target_block_id: str | None    # 매칭 가능한 캡션 블록 id (없으면 None)
    span: tuple[int, int]          # paragraph.text 안의 [start, end) 위치


class Block(BaseModel):
    # ... 기존 필드 ...
    subtype: Subtype | None = None   # paragraph 일 때만 의미. None == "body".
    warning: Warning | None = None
    caption_refs: list[CaptionRef] = Field(default_factory=list)
```

**호환성:** 모든 신규 필드는 Optional/default. 기존 outline JSON 그대로 deserialize 됨.

### 3.2 `app/domain/style_spec.py`

```python
class CaptionBlock(BaseModel):
    figure_label: str = "그림"
    table_label: str = "표"
    separator: str = ". "
    placeholder_missing: str = "다운로드 후 추가"  # i18n 키로 폴백 가능


class NoteBlock(BaseModel):
    indent_pt: float = 18.0
    italic: bool = True
    color: str = "#555555"
    font_size_pt: float | None = None  # None 이면 본문 크기 따라감


class StyleSpec(BaseModel):
    # ... 기존 필드 ...
    caption: CaptionBlock = CaptionBlock()
    note: NoteBlock = NoteBlock()
```

---

## 4. 백엔드 변경

### 4.1 `parser/detect_heading.py` — 첫 파싱 보강 (R3)

우선순위:

1. **직접 스타일** — `style.name in {"Heading 1".."Heading 5", "제목 1".."제목 5", "Title", "Subtitle"}` → `word_style`
2. **outline level** — `paragraph._p.pPr.outlineLvl` 값+1 → `outline_level`
3. **basedOn 체인** — `style.base_style` 따라가며 1번 매칭 시도 → `based_on`
4. **휴리스틱** (기존) → `heuristic`
5. **fallback** — body (level=0)

새 alias 추가:

```python
_WORD_HEADING = {
    "Heading 1": 1, "제목 1": 1,
    # ... 기존 ...
    "Title": 1,
    "Subtitle": 2,
}
```

basedOn 체인 헬퍼:

```python
def _resolve_via_based_on(style) -> int | None:
    seen = set()  # 무한 루프 방지
    cur = getattr(style, "base_style", None)
    while cur is not None and id(cur) not in seen:
        seen.add(id(cur))
        if cur.name in _WORD_HEADING:
            return _WORD_HEADING[cur.name]
        cur = getattr(cur, "base_style", None)
    return None
```

### 4.2 `parser/validate_heading_skip.py` (신규) — R1 마킹

```python
def mark_heading_skips(blocks: list[Block]) -> list[Block]:
    """직전 heading 보다 2단계 이상 깊은 단락에 warning="heading_skip" 셋팅.

    자동 보정하지 않음 — 원본 의도를 보존하고 사용자가 결정한다.
    """
    out: list[Block] = []
    prev_heading_level = 0
    for b in blocks:
        new_b = b
        if b.kind == "paragraph" and 1 <= b.level <= 5:
            if b.level - prev_heading_level > 1:
                new_b = b.model_copy(update={"warning": "heading_skip"})
            prev_heading_level = b.level
        out.append(new_b)
    return out
```

`parse_docx.parse_docx()` 의 마지막 단계에서 호출.

### 4.3 `parser/assign_caption_numbers.py` (신규) — R4 자동 번호

- 표/이미지 블록을 위에서부터 순회, 카운터 2개 (figure / table) 별도.
- `block.caption` 이 비어있으면 `f"{label} {n}{sep}{placeholder}"` 합성.
- 비어있지 않으면 사용자 제목으로 간주, prefix 만 정규화 (`f"{label} {n}{sep}{원래제목}"`).
- StyleSpec.caption 의 라벨/구분자/placeholder 사용.

### 4.4 `parser/detect_caption_refs.py` (신규) — R4 본문 참조

```python
_REF_RE = re.compile(r"(표|그림|Figure|Table)\s*(\d+)")

def attach_caption_refs(blocks: list[Block]) -> list[Block]:
    """본문 paragraph 의 텍스트에서 캡션 참조 후보를 탐지하고
    Block.caption_refs 에 메타데이터 부착.

    target_block_id 는 같은 outline 내에서 같은 (label_kind, n) 캡션 블록을 찾아 매핑.
    매칭 실패면 None — 출력 시 평문으로 남김.
    """
    # ...
```

### 4.5 `renderer/inject_caption_fields.py` (신규) — R4 출력

캡션 OOXML (SEQ + 북마크):

```xml
<w:p>
  <w:r><w:t xml:space="preserve">표 </w:t></w:r>
  <w:bookmarkStart w:id="N" w:name="_Ref_table_{block_id}"/>
  <w:r><w:fldChar w:fldCharType="begin"/></w:r>
  <w:r><w:instrText xml:space="preserve"> SEQ Table \* ARABIC </w:instrText></w:r>
  <w:r><w:fldChar w:fldCharType="separate"/></w:r>
  <w:r><w:t>1</w:t></w:r>
  <w:r><w:fldChar w:fldCharType="end"/></w:r>
  <w:bookmarkEnd w:id="N"/>
  <w:r><w:t xml:space="preserve">. {제목 또는 placeholder}</w:t></w:r>
</w:p>
```

본문 REF 필드:

```xml
<w:r><w:fldChar w:fldCharType="begin"/></w:r>
<w:r><w:instrText xml:space="preserve"> REF _Ref_table_{block_id} \h </w:instrText></w:r>
<w:r><w:fldChar w:fldCharType="separate"/></w:r>
<w:r><w:t>1</w:t></w:r>  <!-- 캐시된 표시값 -->
<w:r><w:fldChar w:fldCharType="end"/></w:r>
```

북마크 ID 규약: `_Ref_{label_kind}_{block.id[:8]}`. Block.id 는 UUID prefix 라 안정적·고유.

라운드트립 보장: 출력 .docx 를 다시 파싱해도 동일 outline 이 나오도록 단위 테스트 1개.

### 4.6 파이프라인 통합

`parse_docx.parse_docx()` 의 마지막 단계 (블록 수집 후, return 직전):

```python
blocks = mark_heading_skips(blocks)
blocks = assign_caption_numbers(blocks, spec=default_spec)  # 또는 spec 인자로
blocks = attach_caption_refs(blocks)
```

`render_docx.render_docx()` 의 캡션/참조 emit 분기:

- `_add_caption_paragraph()` → SEQ 필드 사용
- 본문 paragraph 출력 시 `block.caption_refs` 가 있으면 해당 span 을 REF 필드로 치환

---

## 5. 프론트엔드 변경

### 5.1 `lib/types.ts`

```typescript
export interface CaptionRef {
  label_kind: "figure" | "table";
  detected_number: number;
  target_block_id: string | null;
  span: [number, number];
}

export interface Block {
  // ... 기존 ...
  subtype?: "body" | "note" | null;
  warning?: "heading_skip" | null;
  caption_refs?: CaptionRef[];
}
```

### 5.2 `components/outline-editor/OutlineEditor.tsx` — 핫키 (R1, R2)

```typescript
function handleKeyDown(e: KeyboardEvent) {
  if (selected.size === 0) return;

  // 'p' — 본문으로 강제
  if (e.key === "p" && !e.metaKey && !e.ctrlKey) {
    setBlocks(prev => prev.map(b =>
      selected.has(b.id) && b.kind === "paragraph"
        ? { ...b, level: 0, subtype: "body" }
        : b
    ));
    e.preventDefault();
    return;
  }

  // 'n' — 노트로
  if (e.key === "n" && !e.metaKey && !e.ctrlKey) {
    setBlocks(prev => prev.map(b =>
      selected.has(b.id) && b.kind === "paragraph"
        ? { ...b, level: 0, subtype: "note" }
        : b
    ));
    e.preventDefault();
    return;
  }

  // Tab — heading +1, but block if would create skip (R1)
  if (e.key === "Tab") {
    const prevHeadingLevel = computePrevHeadingLevel(selected);
    if (selected.someWouldExceed(prevHeadingLevel + 1)) {
      toast.warn(t("editor.headingSkipBlocked"));
      e.preventDefault();
      return;
    }
    // 기존 동작
  }
}
```

핫키는 `<input>`/`<textarea>` 에 포커스가 있을 때 발동 안 함 — 표준 `target.tagName` 가드.

### 5.3 `components/outline-editor/ParagraphBlock.tsx` — 시각화

- `block.subtype === "note"` → `pl-6 italic text-text-muted border-l-2 border-warning/30`
- `block.warning === "heading_skip"` → 좌측 노란 줄 + "한 단계 끌어올리기" 버튼 표시 (`block.level - 1` 로 변경)

### 5.4 `lib/i18n.ts` — 메시지 키

```
"editor.headingSkipBlocked": "직전 단계 보다 두 단계 깊게 갈 수 없습니다."
"editor.headingSkipQuickFix": "한 단계 끌어올리기"
"caption.placeholder.missing": "다운로드 후 추가"
"caption.refMismatch": "캡션 번호와 본문 참조가 일치하지 않습니다."
```

### 5.5 보너스 fix — `app/(auth)/login/page.tsx`

```typescript
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  // ...
  await api.login(email, password);
  router.refresh();          // <-- 추가: RootLayout 의 fetchMe() 재실행
  router.push("/dashboard");
}
```

`signup` → `/login` 도 동일 패턴 점검 (signup 은 로그인 페이지로 이동하므로 영향 적음, 그러나 일관성 위해 같은 수정).

---

## 6. 테스트 전략

| 영역 | 테스트 |
|---|---|
| `detect_heading` | Title alias / outlineLvl 박힌 단락 / basedOn 체인 / 휴리스틱 폴백 |
| `validate_heading_skip` | 정상 H1→H2, 스킵 H1→H3, H1→H2→H4 등 |
| `assign_caption_numbers` | 누락 캡션 → 합성, 사용자 제목 유지, figure/table 카운터 분리 |
| `detect_caption_refs` | 정규식 매칭, target_block_id 매핑, 매핑 실패 케이스 |
| `inject_caption_fields` | SEQ/REF OOXML 검증, 북마크 ID 안정성, **라운드트립 (output → 재파싱 → 동일 outline)** |
| 통합 | 캡션 누락 → 자동 번호 → 본문 참조 시프트 e2e |
| 프론트 | 핫키 단위 (Jest) — `p`/`n`/`Tab`/skip 차단 |
| 보너스 | login 후 sidebar 노출 (Playwright 또는 수동) |

---

## 7. 마이그레이션 / 호환성

- DB 스키마 변경 없음. Outline JSON 은 GUID/JSONPortable 컬럼에 저장되며 새 필드는 모두 Optional.
- 기존 저장된 outline 은 새 필드 없이 deserialize 됨 → 정상 동작 (subtype=None=body, warning=None, caption_refs=[])
- 기존 .docx 출력은 SEQ/REF 필드 없이 평문이었음. 신규 출력에는 SEQ/REF 가 박힘 → Word 가 `xml:space="preserve"` 로 fallback 캐시값 표시. 사용자 워크플로우 변경 없음.

---

## 8. 위험 / 완화

| 위험 | 완화 |
|---|---|
| 정규식 본문 참조의 위양성 (사용자가 "표 1" 을 의미 다르게 사용) | preview diff 화면(이미 존재)에 변경분 시각화. 사용자가 Word 안에서 그 한 곳만 unlink 가능 |
| python-docx 가 SEQ/REF 직접 지원 X | raw XML 헬퍼 (`clone_table_xml` 패턴) 작성, 라운드트립 테스트로 안정성 검증 |
| `style.base_style` 무한 루프 (드물지만 가능) | 방문 기록 (`seen` set) 으로 차단 |
| 핫키가 input/textarea 에 포커스가 있을 때 발동 | `e.target.tagName` 가드 (`INPUT`/`TEXTAREA`/`contenteditable` 제외) |
| 북마크 ID 충돌 | `_Ref_{kind}_{block.id[:8]}` — Block.id 는 UUID prefix 라 충돌 확률 무시 가능 |

---

## 9. 비-목표 (out of scope)

- numId/ilvl 을 heading level 결정에 사용하는 것 (회사마다 list ≠ heading 의미가 달라 위험). 단, list_format 보존은 별개로 이미 동작.
- Caption 스타일을 가진 단락을 자동으로 인접 표/이미지 caption 후보로 바인딩 — 향후 별도 작업. 현재는 `extract_caption.pick_caption()` 의 신호만 사용.
- 본문 참조의 의미 분석 ("위 그림", "다음 표"). 정규식 명시 매칭만.
- StyleSpec UI 에서 caption/note 블록 편집 — 데이터 모델만 추가, UI 는 기본값 사용. 후속 작업으로 분리.

---

## 10. 구현 단계 (writing-plans 로 넘길 윤곽)

1. 데이터 모델 확장 (Block, StyleSpec) + 마이그레이션 없는 호환성 테스트
2. `detect_heading.py` 보강 (Title/Subtitle, outlineLvl, basedOn) + 단위 테스트
3. `validate_heading_skip.py` + `parse_docx` 통합
4. `assign_caption_numbers.py` + StyleSpec.caption 사용
5. `detect_caption_refs.py` + Block.caption_refs 채움
6. `inject_caption_fields.py` (SEQ/REF OOXML emit) + 라운드트립 테스트
7. `render_docx.py` 의 캡션/본문 분기에 6번 통합
8. 프론트 lib/types.ts 확장
9. `OutlineEditor.tsx` 핫키 (p/n/Tab 차단) + 핫키 단위 테스트
10. `ParagraphBlock.tsx` subtype/warning 시각화 + 빠른 수정 버튼
11. i18n 메시지 추가
12. login `router.refresh()` 보너스 fix
13. 통합 테스트 + Playwright 시나리오 (옵션)
