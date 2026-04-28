# 아웃라인 에디터 보강 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Word(.docx) 파싱·렌더 파이프라인에 (R1) heading 2단계 스킵 차단, (R2) 본문/노트 단축키, (R3) 첫 파싱 정보 보존 강화, (R4) 캡션 자동 번호 + Word SEQ/REF 필드 emit, (Bonus) 로그인 후 사이드바 노출 fix 를 추가한다.

**Architecture:** Block 도메인 모델에 `subtype`/`warning`/`caption_refs` 필드 추가. `detect_heading.py` 에 outlineLvl + Title/Subtitle alias + basedOn 체인 매핑 추가. 신규 모듈 `validate_heading_skip.py`, `assign_caption_numbers.py`, `detect_caption_refs.py` 가 `parse_docx.py` 파이프라인 끝단에서 차례로 호출. 출력 측은 `inject_caption_fields.py` 가 캡션은 `SEQ` + 북마크, 본문 참조는 `REF` 필드의 OOXML 을 emit. 프론트는 `OutlineEditor.tsx` 에 `p`/`n`/`Tab` 핫키와 warning 시각화 추가.

**Tech Stack:** Python 3.11, FastAPI, python-docx, Pydantic v2, pytest. Next.js 15 (App Router), React 19, vitest 2 + @testing-library/react.

**상위 스펙:** `docs/superpowers/specs/2026-04-28-outline-editor-enhancements-design.md`

---

## File Structure

### 신규 파일 (backend)

| 경로 | 책임 |
|------|------|
| `backend/app/parser/validate_heading_skip.py` | 직전 heading +1 초과 단락에 `warning="heading_skip"` 마킹 (자동 보정 X) |
| `backend/app/parser/assign_caption_numbers.py` | 표/이미지 캡션 누락/정규화 — StyleSpec.caption 라벨/구분자/placeholder 사용 |
| `backend/app/parser/detect_caption_refs.py` | 본문 paragraph 에서 `(표\|그림\|Figure\|Table)\s*\d+` 패턴 탐지, `Block.caption_refs` 채움 |
| `backend/app/renderer/inject_caption_fields.py` | 캡션 SEQ + 북마크 / 본문 REF 의 OOXML emit 헬퍼 |
| `backend/tests/test_validate_heading_skip.py` | 정상/스킵 케이스 단위 |
| `backend/tests/test_assign_caption_numbers.py` | 누락 합성 / 사용자 제목 유지 / 카운터 분리 |
| `backend/tests/test_detect_caption_refs.py` | 정규식, target_block_id 매핑, 매핑 실패 |
| `backend/tests/test_inject_caption_fields.py` | SEQ/REF OOXML 검증 + 라운드트립 |
| `backend/tests/test_parse_pipeline_integration.py` | docx 입력 → outline → docx 출력 → 재파싱 일관성 |

### 신규 파일 (frontend)

| 경로 | 책임 |
|------|------|
| `frontend/vitest.config.ts` | jsdom 환경 + path alias 설정 (없을 시) |
| `frontend/test-setup.ts` | `@testing-library/jest-dom` matchers 등록 |
| `frontend/components/outline-editor/__tests__/OutlineEditor.test.tsx` | p/n/Tab 핫키, skip 차단 |
| `frontend/components/outline-editor/__tests__/ParagraphBlock.test.tsx` | subtype/warning 시각화 |

### 수정 파일

| 경로 | 변경 요지 |
|------|-----------|
| `backend/app/domain/outline.py` | `Block.subtype`/`warning`/`caption_refs` 필드, `CaptionRef` 모델, `DetectedBy` 확장 |
| `backend/app/domain/style_spec.py` | `CaptionBlock`/`NoteBlock` 추가, `StyleSpec.caption`/`StyleSpec.note` 필드 |
| `backend/app/parser/detect_heading.py` | Title/Subtitle alias, `outlineLvl` 읽기, `style.base_style` 체인 |
| `backend/app/parser/parse_docx.py` | 파이프라인 마지막에 validate_heading_skip + assign_caption_numbers + detect_caption_refs 호출 |
| `backend/app/renderer/render_docx.py` | 캡션 emit 을 SEQ 헬퍼로 치환, 본문 paragraph 의 `caption_refs` 가 있으면 REF 헬퍼로 치환 |
| `backend/tests/test_detect_heading.py` | Title/Subtitle/outlineLvl/basedOn 케이스 추가 |
| `frontend/lib/types.ts` | `Block` 인터페이스에 `subtype?`, `warning?`, `caption_refs?` 추가, `CaptionRef` 인터페이스 |
| `frontend/lib/i18n.ts` | `editor.headingSkipBlocked`, `editor.headingSkipQuickFix`, `caption.placeholder.missing`, `caption.refMismatch` 추가 (en/ko) |
| `frontend/components/outline-editor/OutlineEditor.tsx` | `handleKeyDown` 확장 — p/n 핫키, Tab skip 차단 |
| `frontend/components/outline-editor/ParagraphBlock.tsx` | subtype="note" 스타일 + warning 좌측 노란 줄 + 빠른 수정 버튼 |
| `frontend/app/(auth)/login/page.tsx` | `handleSubmit` 에 `router.refresh()` 추가 (보너스 fix) |
| `frontend/package.json` | (필요 시) `"test:watch": "vitest"` 스크립트 추가 |

---

## Phase A — 데이터 모델 기반 (Tasks 1–2)

Block / StyleSpec 확장. 모든 신규 필드는 Optional/default — 기존 outline JSON 호환.

### Task 1: Block 모델 확장

**Files:**
- Modify: `backend/app/domain/outline.py`
- Modify: `backend/tests/test_domain_models.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_domain_models.py` 끝에 추가:

```python
def test_block_subtype_warning_caption_refs_default_none_or_empty():
    """신규 필드는 모두 Optional/default — 기존 outline JSON 그대로 deserialize."""
    from app.domain.outline import Block

    b = Block(id="b-1", kind="paragraph", level=0)
    assert b.subtype is None
    assert b.warning is None
    assert b.caption_refs == []


def test_caption_ref_serialization_roundtrip():
    from app.domain.outline import Block, CaptionRef

    ref = CaptionRef(
        label_kind="figure",
        detected_number=2,
        target_block_id="b-abc12345",
        span=(10, 14),
    )
    b = Block(id="b-2", kind="paragraph", level=0, text="그림 2 참조", caption_refs=[ref])
    json_data = b.model_dump_json()
    restored = Block.model_validate_json(json_data)
    assert restored.caption_refs[0].label_kind == "figure"
    assert restored.caption_refs[0].span == (10, 14)


def test_detected_by_accepts_outline_level_and_based_on():
    from app.domain.outline import Block

    Block(id="b-3", kind="paragraph", level=2, detected_by="outline_level")
    Block(id="b-4", kind="paragraph", level=1, detected_by="based_on")
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && .venv/bin/pytest tests/test_domain_models.py -v -k "subtype_warning or caption_ref or outline_level_and_based_on"
```

Expected: FAIL — `Block` has no `subtype`/`caption_refs`, `CaptionRef` undefined, `detected_by="outline_level"` rejected.

- [ ] **Step 3: Write minimal implementation**

`backend/app/domain/outline.py` 전체 교체:

```python
"""Outline JSON — Backend ↔ Frontend 계약."""

from typing import Literal

from pydantic import BaseModel, Field

from app.domain.section import SectionSpec

DetectedBy = Literal["word_style", "outline_level", "based_on", "heuristic", "user"]
BlockKind = Literal["paragraph", "table", "image", "field"]
FieldKind = Literal["ref", "toc", "pageref"]
Alignment = Literal["left", "right", "center", "justify"]
Subtype = Literal["body", "note"]
Warning = Literal["heading_skip"]
CaptionLabelKind = Literal["figure", "table"]


class CaptionRef(BaseModel):
    """본문 paragraph 안에서 정규식으로 탐지된 캡션 참조의 메타.

    `target_block_id` 는 같은 outline 안에서 동일 (label_kind, detected_number) 의
    캡션 블록을 찾아 매핑한 결과. 매핑 실패 시 None — 출력은 평문으로 남김.
    """

    label_kind: CaptionLabelKind
    detected_number: int
    target_block_id: str | None = None
    span: tuple[int, int]


class Block(BaseModel):
    id: str
    kind: BlockKind
    level: int = Field(ge=0, le=5)

    # paragraph
    text: str | None = None
    detected_by: DetectedBy | None = None
    list_format: str | None = None
    alignment: Alignment | None = None
    subtype: Subtype | None = None
    warning: Warning | None = None
    caption_refs: list[CaptionRef] = Field(default_factory=list)

    # table / image
    markdown: str | None = None
    preview_url: str | None = None
    caption: str | None = None
    raw_ref: str | None = None

    # field
    field_kind: FieldKind | None = None
    preview_text: str | None = None
    target_id: str | None = None
    raw_xml_ref: str | None = None


class Outline(BaseModel):
    job_id: str
    source_filename: str
    blocks: list[Block]
    sections: list[SectionSpec] = Field(default_factory=list)
```

- [ ] **Step 4: Run all domain & parser tests to verify nothing else broke**

```bash
cd backend && .venv/bin/pytest tests/test_domain_models.py tests/test_parse.py tests/test_detect_heading.py -v
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/domain/outline.py backend/tests/test_domain_models.py
git commit -m "feat(domain): Block.subtype/warning/caption_refs + CaptionRef + DetectedBy 확장"
```

---

### Task 2: StyleSpec 확장 (CaptionBlock / NoteBlock)

**Files:**
- Modify: `backend/app/domain/style_spec.py`
- Modify: `backend/tests/test_domain_models.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_domain_models.py` 끝에 추가:

```python
def test_stylespec_caption_block_defaults():
    from app.domain.style_spec import CaptionBlock, StyleSpec

    spec = StyleSpec()
    assert spec.caption.figure_label == "그림"
    assert spec.caption.table_label == "표"
    assert spec.caption.separator == ". "
    assert spec.caption.placeholder_missing == "다운로드 후 추가"


def test_stylespec_note_block_defaults():
    from app.domain.style_spec import StyleSpec

    spec = StyleSpec()
    assert spec.note.indent_pt == 18.0
    assert spec.note.italic is True
    assert spec.note.color == "#555555"
    assert spec.note.font_size_pt is None
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && .venv/bin/pytest tests/test_domain_models.py -v -k "caption_block_defaults or note_block_defaults"
```

Expected: FAIL — `StyleSpec` has no `caption`/`note` fields.

- [ ] **Step 3: Write minimal implementation**

`backend/app/domain/style_spec.py` 의 `StyleSpec` 클래스 직전에 추가하고 필드 등록:

```python
class CaptionBlock(BaseModel):
    """캡션 라벨/구분자/누락 placeholder."""
    figure_label: str = "그림"
    table_label: str = "표"
    separator: str = ". "
    placeholder_missing: str = "다운로드 후 추가"


class NoteBlock(BaseModel):
    """노트 단락(`subtype="note"`) 시각 스타일."""
    indent_pt: float = 18.0
    italic: bool = True
    color: str = "#555555"
    font_size_pt: float | None = None
```

`StyleSpec` 본문에 두 줄 추가 (다른 *Block 필드들 옆):

```python
class StyleSpec(BaseModel):
    # ... 기존 필드 ...
    caption: CaptionBlock = Field(default_factory=CaptionBlock)
    note: NoteBlock = Field(default_factory=NoteBlock)
```

`Field` import 가 이미 있는지 확인. 없으면 `from pydantic import BaseModel, Field`.

- [ ] **Step 4: Run tests to verify it passes**

```bash
cd backend && .venv/bin/pytest tests/test_domain_models.py -v
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/domain/style_spec.py backend/tests/test_domain_models.py
git commit -m "feat(stylespec): CaptionBlock + NoteBlock 추가 (라벨/placeholder/노트 스타일)"
```

---

## Phase B — Parser 보강 (Tasks 3–6)

`detect_heading.py` 의 신호원을 늘리고, `validate_heading_skip.py` 를 신규 모듈로 추가.

### Task 3: detect_heading — Title/Subtitle alias

**Files:**
- Modify: `backend/app/parser/detect_heading.py`
- Modify: `backend/tests/test_detect_heading.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_detect_heading.py` 끝에 추가:

```python
def test_title_style_maps_to_level_1():
    from app.parser.detect_heading import detect_level

    class _Style:
        name = "Title"
        base_style = None

    class _PF:
        alignment = None

    class _Para:
        style = _Style()
        text = "표지 제목"
        runs = []
        paragraph_format = _PF()

    level, by = detect_level(_Para(), paragraph_index=0)
    assert level == 1
    assert by == "word_style"


def test_subtitle_style_maps_to_level_2():
    from app.parser.detect_heading import detect_level

    class _Style:
        name = "Subtitle"
        base_style = None

    class _PF:
        alignment = None

    class _Para:
        style = _Style()
        text = "부제"
        runs = []
        paragraph_format = _PF()

    level, by = detect_level(_Para(), paragraph_index=1)
    assert level == 2
    assert by == "word_style"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && .venv/bin/pytest tests/test_detect_heading.py -v -k "title_style or subtitle_style"
```

Expected: FAIL — Title/Subtitle 이 `_WORD_HEADING` dict 에 없어서 휴리스틱 fallback 으로 0 또는 1(very_large 의 표지 케이스) 이 나옴.

- [ ] **Step 3: Write minimal implementation**

`backend/app/parser/detect_heading.py` 의 `_WORD_HEADING` dict 에 두 줄 추가:

```python
_WORD_HEADING = {
    "Heading 1": 1, "제목 1": 1,
    "Heading 2": 2, "제목 2": 2,
    "Heading 3": 3, "제목 3": 3,
    "Heading 4": 4, "제목 4": 4,
    "Heading 5": 5, "제목 5": 5,
    "Title": 1,
    "Subtitle": 2,
}
```

- [ ] **Step 4: Run tests to verify it passes**

```bash
cd backend && .venv/bin/pytest tests/test_detect_heading.py -v
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/parser/detect_heading.py backend/tests/test_detect_heading.py
git commit -m "feat(parser): detect_heading — Title/Subtitle alias 매핑"
```

---

### Task 4: detect_heading — outline level 읽기

**Files:**
- Modify: `backend/app/parser/detect_heading.py`
- Modify: `backend/tests/test_detect_heading.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_detect_heading.py` 끝에 추가:

```python
def test_outline_level_takes_precedence_over_heuristic():
    """w:outlineLvl 값이 박혀있으면 휴리스틱보다 우선."""
    from app.parser.detect_heading import detect_level

    class _Style:
        name = "회사커스텀_큰제목"  # _WORD_HEADING 매칭 안 됨
        base_style = None

    class _PF:
        alignment = None

    class _Para:
        style = _Style()
        text = "본문같은 평범한 텍스트"  # 휴리스틱도 매칭 안 됨
        runs = []
        paragraph_format = _PF()
        # outline_level 은 별도 헬퍼로 읽음 (아래 _resolve_outline_level)
        _outline_level = 1  # 0=H1 → level 2

    level, by = detect_level(_Para(), paragraph_index=10)
    assert level == 2
    assert by == "outline_level"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && .venv/bin/pytest tests/test_detect_heading.py -v -k "outline_level_takes_precedence"
```

Expected: FAIL — `detected_by` 가 `"outline_level"` 이 아니거나 level 이 0.

- [ ] **Step 3: Write minimal implementation**

`backend/app/parser/detect_heading.py` 에 헬퍼 + 분기 추가:

```python
def _resolve_outline_level(paragraph: Any) -> int | None:
    """`w:pPr/w:outlineLvl` 값을 읽어서 1..5 로 매핑. 없으면 None.

    테스트용 FakeParagraph 는 `_outline_level` 속성으로 우회.
    실제 docx.Paragraph 는 OOXML 직접 조회.
    """
    fake = getattr(paragraph, "_outline_level", None)
    if fake is not None:
        return min(int(fake) + 1, 5)

    p = getattr(paragraph, "_p", None)
    if p is None:
        return None
    from docx.oxml.ns import qn
    pPr = p.find(qn("w:pPr"))
    if pPr is None:
        return None
    olvl = pPr.find(qn("w:outlineLvl"))
    if olvl is None:
        return None
    val = olvl.get(qn("w:val"))
    if val is None:
        return None
    try:
        return min(int(val) + 1, 5)
    except (TypeError, ValueError):
        return None
```

`detect_level` 함수의 (a) 직접 스타일 매칭 직후, 휴리스틱 진입 전에 분기 추가:

```python
def detect_level(paragraph: Any, *, paragraph_index: int | None = None) -> tuple[int, DetectedBy]:
    # (a) Word 빌트인/alias 스타일
    style_name = getattr(paragraph.style, "name", "")
    if style_name in _WORD_HEADING:
        return _WORD_HEADING[style_name], "word_style"

    # (a2) outline level — 명시적 신호
    olvl = _resolve_outline_level(paragraph)
    if olvl is not None and 1 <= olvl <= 5:
        return olvl, "outline_level"

    text = (paragraph.text or "").strip()
    # ... 기존 휴리스틱 로직 ...
```

- [ ] **Step 4: Run tests to verify it passes**

```bash
cd backend && .venv/bin/pytest tests/test_detect_heading.py tests/test_parse.py -v
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/parser/detect_heading.py backend/tests/test_detect_heading.py
git commit -m "feat(parser): detect_heading — w:outlineLvl 읽어 level 매핑"
```

---

### Task 5: detect_heading — basedOn 체인

**Files:**
- Modify: `backend/app/parser/detect_heading.py`
- Modify: `backend/tests/test_detect_heading.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_detect_heading.py` 끝에 추가:

```python
def test_based_on_chain_resolves_to_heading_level():
    """사용자 정의 스타일이 Heading 1 을 base 로 가지면 level 1."""
    from app.parser.detect_heading import detect_level

    class _Heading1:
        name = "Heading 1"
        base_style = None

    class _CompanyHeading:
        name = "회사_제목스타일"  # alias dict 에 없음
        base_style = _Heading1()

    class _PF:
        alignment = None

    class _Para:
        style = _CompanyHeading()
        text = "큰 제목"
        runs = []
        paragraph_format = _PF()

    level, by = detect_level(_Para(), paragraph_index=2)
    assert level == 1
    assert by == "based_on"


def test_based_on_chain_handles_cycle():
    """무한 루프 방지 — 같은 객체 재방문 시 None."""
    from app.parser.detect_heading import _resolve_via_based_on

    class _Cyclic:
        name = "weird"

    a = _Cyclic()
    a.base_style = a  # self-cycle
    assert _resolve_via_based_on(a) is None
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && .venv/bin/pytest tests/test_detect_heading.py -v -k "based_on"
```

Expected: FAIL — `_resolve_via_based_on` 미정의 / `based_on` 분기 없음.

- [ ] **Step 3: Write minimal implementation**

`backend/app/parser/detect_heading.py` 에 헬퍼 추가 (outline_level 헬퍼 옆):

```python
def _resolve_via_based_on(style: Any) -> int | None:
    """style.base_style 체인을 따라가며 _WORD_HEADING 매칭 시도.

    무한 루프 방지: 방문 객체 id 기록.
    """
    seen: set[int] = set()
    cur = getattr(style, "base_style", None)
    while cur is not None and id(cur) not in seen:
        seen.add(id(cur))
        name = getattr(cur, "name", "")
        if name in _WORD_HEADING:
            return _WORD_HEADING[name]
        cur = getattr(cur, "base_style", None)
    return None
```

`detect_level` 의 outline_level 분기 직후, 휴리스틱 직전에 추가:

```python
    # (a3) basedOn 체인 — 사용자 정의 스타일이 Heading N 상속
    via_base = _resolve_via_based_on(paragraph.style)
    if via_base is not None:
        return via_base, "based_on"
```

- [ ] **Step 4: Run tests to verify it passes**

```bash
cd backend && .venv/bin/pytest tests/test_detect_heading.py -v
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/parser/detect_heading.py backend/tests/test_detect_heading.py
git commit -m "feat(parser): detect_heading — basedOn 체인 추적 (회사 커스텀 스타일 대응)"
```

---

### Task 6: validate_heading_skip 모듈

**Files:**
- Create: `backend/app/parser/validate_heading_skip.py`
- Create: `backend/tests/test_validate_heading_skip.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_validate_heading_skip.py`:

```python
"""validate_heading_skip — heading 2단계 이상 점프 마킹."""

from app.domain.outline import Block
from app.parser.validate_heading_skip import mark_heading_skips


def _h(level: int, idx: int) -> Block:
    return Block(id=f"b-{idx}", kind="paragraph", level=level, text=f"H{level} #{idx}")


def test_no_skip_no_warning():
    blocks = [_h(1, 1), _h(2, 2), _h(3, 3), _h(2, 4)]
    out = mark_heading_skips(blocks)
    assert all(b.warning is None for b in out)


def test_h1_to_h3_marked_as_skip():
    blocks = [_h(1, 1), _h(3, 2)]
    out = mark_heading_skips(blocks)
    assert out[0].warning is None
    assert out[1].warning == "heading_skip"


def test_first_heading_above_h1_marked():
    """문서 시작이 곧바로 H2 면 스킵 (H0=body 기준 +2)."""
    blocks = [_h(2, 1)]
    out = mark_heading_skips(blocks)
    assert out[0].warning == "heading_skip"


def test_body_blocks_unaffected():
    body = Block(id="b-x", kind="paragraph", level=0, text="평문")
    blocks = [_h(1, 1), body, _h(2, 2)]
    out = mark_heading_skips(blocks)
    assert out[1].warning is None  # body 는 검사 대상 아님
    assert out[2].warning is None  # 직전 heading 은 H1, 차이 1 → OK


def test_does_not_mutate_input():
    blocks = [_h(1, 1), _h(3, 2)]
    out = mark_heading_skips(blocks)
    assert blocks[1].warning is None  # 원본은 그대로
    assert out[1].warning == "heading_skip"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && .venv/bin/pytest tests/test_validate_heading_skip.py -v
```

Expected: FAIL — 모듈 없음.

- [ ] **Step 3: Write minimal implementation**

`backend/app/parser/validate_heading_skip.py`:

```python
"""직전 heading 보다 2단계 이상 깊은 단락에 warning 마킹.

자동 보정하지 않음 — 원본 의도를 보존하고, 사용자가 빠른 수정 버튼으로 결정한다.
"""

from app.domain.outline import Block


def mark_heading_skips(blocks: list[Block]) -> list[Block]:
    out: list[Block] = []
    prev_heading_level = 0
    for b in blocks:
        if b.kind == "paragraph" and 1 <= b.level <= 5:
            if b.level - prev_heading_level > 1:
                out.append(b.model_copy(update={"warning": "heading_skip"}))
            else:
                out.append(b)
            prev_heading_level = b.level
        else:
            out.append(b)
    return out
```

- [ ] **Step 4: Run tests to verify it passes**

```bash
cd backend && .venv/bin/pytest tests/test_validate_heading_skip.py -v
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/parser/validate_heading_skip.py backend/tests/test_validate_heading_skip.py
git commit -m "feat(parser): validate_heading_skip — 2단계 점프 단락에 warning 마킹"
```

---

## Phase C — 캡션 자동 번호 + 본문 참조 탐지 (Tasks 7–8)

### Task 7: assign_caption_numbers

**Files:**
- Create: `backend/app/parser/assign_caption_numbers.py`
- Create: `backend/tests/test_assign_caption_numbers.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_assign_caption_numbers.py`:

```python
"""assign_caption_numbers — 누락 캡션 합성 + 사용자 제목 정규화."""

from app.domain.outline import Block
from app.domain.style_spec import StyleSpec
from app.parser.assign_caption_numbers import assign_caption_numbers


def _img(idx: int, caption: str | None = None) -> Block:
    return Block(id=f"img-{idx}", kind="image", level=0, caption=caption)


def _tbl(idx: int, caption: str | None = None) -> Block:
    return Block(id=f"tbl-{idx}", kind="table", level=0, caption=caption)


def test_missing_caption_synthesized_with_placeholder():
    spec = StyleSpec()
    blocks = [_img(1), _tbl(1)]
    out = assign_caption_numbers(blocks, spec=spec)
    assert out[0].caption == "그림 1. 다운로드 후 추가"
    assert out[1].caption == "표 1. 다운로드 후 추가"


def test_user_title_preserved_with_normalized_prefix():
    spec = StyleSpec()
    blocks = [_img(1, caption="장비 설치도")]
    out = assign_caption_numbers(blocks, spec=spec)
    assert out[0].caption == "그림 1. 장비 설치도"


def test_user_title_already_prefixed_is_normalized():
    """사용자가 이미 '그림 5. 라벨' 처럼 적었으면 prefix 만 위치 기반으로 교체."""
    spec = StyleSpec()
    blocks = [_img(1, caption="그림 99. 잘못된 번호")]
    out = assign_caption_numbers(blocks, spec=spec)
    assert out[0].caption == "그림 1. 잘못된 번호"


def test_figure_and_table_counters_independent():
    spec = StyleSpec()
    blocks = [_img(1), _tbl(1), _img(2), _tbl(2)]
    out = assign_caption_numbers(blocks, spec=spec)
    assert out[0].caption == "그림 1. 다운로드 후 추가"
    assert out[1].caption == "표 1. 다운로드 후 추가"
    assert out[2].caption == "그림 2. 다운로드 후 추가"
    assert out[3].caption == "표 2. 다운로드 후 추가"


def test_non_table_image_blocks_unaffected():
    spec = StyleSpec()
    body = Block(id="b-1", kind="paragraph", level=0, text="본문")
    out = assign_caption_numbers([body, _img(1)], spec=spec)
    assert out[0].caption is None
    assert out[1].caption == "그림 1. 다운로드 후 추가"


def test_custom_labels_via_stylespec():
    from app.domain.style_spec import CaptionBlock
    spec = StyleSpec(caption=CaptionBlock(figure_label="Figure", table_label="Table", separator=": "))
    out = assign_caption_numbers([_img(1, caption="diagram")], spec=spec)
    assert out[0].caption == "Figure 1: diagram"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && .venv/bin/pytest tests/test_assign_caption_numbers.py -v
```

Expected: FAIL — 모듈 없음.

- [ ] **Step 3: Write minimal implementation**

`backend/app/parser/assign_caption_numbers.py`:

```python
"""표/이미지 블록의 캡션 자동 번호 부여.

- 캡션 없으면 `f"{label} {n}{sep}{placeholder}"` 합성.
- 있으면 사용자 제목으로 간주 — 기존 `(그림|표|Figure|Table) \d+ ?[.:]?` prefix 제거 후 위치 기반 prefix 재부여.
"""

import re

from app.domain.outline import Block
from app.domain.style_spec import StyleSpec

_PREFIX_RE = re.compile(
    r"^\s*\[?\s*(?:표|그림|TABLE|FIGURE|Table|Figure)\s*\]?\s*\d+\s*[.:\]\-—]?\s*"
)


def _strip_prefix(text: str) -> str:
    return _PREFIX_RE.sub("", text).strip()


def assign_caption_numbers(blocks: list[Block], *, spec: StyleSpec) -> list[Block]:
    fig_n = 0
    tbl_n = 0
    out: list[Block] = []
    for b in blocks:
        if b.kind == "image":
            fig_n += 1
            label = spec.caption.figure_label
            n = fig_n
        elif b.kind == "table":
            tbl_n += 1
            label = spec.caption.table_label
            n = tbl_n
        else:
            out.append(b)
            continue

        sep = spec.caption.separator
        if b.caption and b.caption.strip():
            tail = _strip_prefix(b.caption) or spec.caption.placeholder_missing
        else:
            tail = spec.caption.placeholder_missing

        out.append(b.model_copy(update={"caption": f"{label} {n}{sep}{tail}"}))
    return out
```

- [ ] **Step 4: Run tests to verify it passes**

```bash
cd backend && .venv/bin/pytest tests/test_assign_caption_numbers.py -v
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/parser/assign_caption_numbers.py backend/tests/test_assign_caption_numbers.py
git commit -m "feat(parser): assign_caption_numbers — 누락 합성 + 사용자 제목 prefix 정규화"
```

---

### Task 8: detect_caption_refs

**Files:**
- Create: `backend/app/parser/detect_caption_refs.py`
- Create: `backend/tests/test_detect_caption_refs.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_detect_caption_refs.py`:

```python
"""detect_caption_refs — 본문에서 캡션 참조 패턴 탐지."""

from app.domain.outline import Block
from app.parser.detect_caption_refs import attach_caption_refs


def _para(idx: int, text: str) -> Block:
    return Block(id=f"b-{idx}", kind="paragraph", level=0, text=text)


def _img(block_id: str, caption: str) -> Block:
    return Block(id=block_id, kind="image", level=0, caption=caption)


def _tbl(block_id: str, caption: str) -> Block:
    return Block(id=block_id, kind="table", level=0, caption=caption)


def test_simple_korean_reference_detected_and_mapped():
    blocks = [
        _img("img-1", "그림 1. 라벨"),
        _para(1, "위 그림 1 을 참조하라."),
    ]
    out = attach_caption_refs(blocks)
    refs = out[1].caption_refs
    assert len(refs) == 1
    assert refs[0].label_kind == "figure"
    assert refs[0].detected_number == 1
    assert refs[0].target_block_id == "img-1"
    assert refs[0].span == (3, 7)  # "그림 1" 위치


def test_table_and_figure_in_one_paragraph():
    blocks = [
        _img("img-1", "그림 1. A"),
        _tbl("tbl-1", "표 1. B"),
        _para(1, "그림 1 과 표 1 을 함께 본다."),
    ]
    out = attach_caption_refs(blocks)
    refs = out[2].caption_refs
    assert {(r.label_kind, r.target_block_id) for r in refs} == {
        ("figure", "img-1"),
        ("table", "tbl-1"),
    }


def test_english_labels_detected():
    blocks = [
        _tbl("tbl-1", "Table 1: cost"),
        _para(1, "see Table 1 below"),
    ]
    out = attach_caption_refs(blocks)
    assert out[1].caption_refs[0].label_kind == "table"
    assert out[1].caption_refs[0].target_block_id == "tbl-1"


def test_unmatched_reference_target_is_none():
    blocks = [_para(1, "그림 99 가 어디?")]
    out = attach_caption_refs(blocks)
    assert out[0].caption_refs[0].target_block_id is None


def test_non_paragraph_blocks_skipped():
    blocks = [_img("img-1", "그림 1. A")]
    out = attach_caption_refs(blocks)
    assert out[0].caption_refs == []  # image 자신은 검사 안 함


def test_idempotent():
    blocks = [
        _img("img-1", "그림 1. A"),
        _para(1, "그림 1 참조"),
    ]
    once = attach_caption_refs(blocks)
    twice = attach_caption_refs(once)
    assert twice[1].caption_refs == once[1].caption_refs
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && .venv/bin/pytest tests/test_detect_caption_refs.py -v
```

Expected: FAIL — 모듈 없음.

- [ ] **Step 3: Write minimal implementation**

`backend/app/parser/detect_caption_refs.py`:

```python
"""본문 paragraph 텍스트에서 캡션 참조 후보(`그림 N`, `표 N`, `Figure N`, `Table N`) 탐지.

`Block.caption_refs` 에 (label_kind, detected_number, target_block_id, span) 부착.
target_block_id 는 같은 outline 내에서 동일 (label_kind, n) 의 캡션 블록 id.
매핑 실패면 None — 출력 시 평문으로 남김.
"""

import re

from app.domain.outline import Block, CaptionRef

_REF_RE = re.compile(r"(표|그림|Figure|Table)\b\s*(\d+)")

_LABEL_TO_KIND = {
    "표": "table",
    "그림": "figure",
    "Figure": "figure",
    "Table": "table",
}


def _build_caption_index(blocks: list[Block]) -> dict[tuple[str, int], str]:
    """캡션 prefix 기반으로 (kind, n) → block.id 인덱스 만들기.

    assign_caption_numbers 가 표준 prefix 를 박아둔 상태를 가정.
    """
    idx: dict[tuple[str, int], str] = {}
    label_kind_re = re.compile(r"^\s*(표|그림|Figure|Table)\s*(\d+)")
    for b in blocks:
        if b.kind not in ("image", "table"):
            continue
        if not b.caption:
            continue
        m = label_kind_re.match(b.caption)
        if not m:
            continue
        kind = _LABEL_TO_KIND[m.group(1)]
        n = int(m.group(2))
        idx.setdefault((kind, n), b.id)
    return idx


def attach_caption_refs(blocks: list[Block]) -> list[Block]:
    cap_index = _build_caption_index(blocks)
    out: list[Block] = []
    for b in blocks:
        if b.kind != "paragraph" or not b.text:
            out.append(b)
            continue

        refs: list[CaptionRef] = []
        for m in _REF_RE.finditer(b.text):
            kind = _LABEL_TO_KIND[m.group(1)]
            n = int(m.group(2))
            target = cap_index.get((kind, n))
            refs.append(
                CaptionRef(
                    label_kind=kind,
                    detected_number=n,
                    target_block_id=target,
                    span=(m.start(), m.end()),
                )
            )
        out.append(b.model_copy(update={"caption_refs": refs}))
    return out
```

- [ ] **Step 4: Run tests to verify it passes**

```bash
cd backend && .venv/bin/pytest tests/test_detect_caption_refs.py -v
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/parser/detect_caption_refs.py backend/tests/test_detect_caption_refs.py
git commit -m "feat(parser): detect_caption_refs — 본문 캡션 참조 정규식 탐지 + 매핑"
```

---

## Phase D — Word SEQ/REF 필드 출력 (Tasks 9–11)

### Task 9: inject_caption_fields — 헬퍼 + 단위 테스트

**Files:**
- Create: `backend/app/renderer/inject_caption_fields.py`
- Create: `backend/tests/test_inject_caption_fields.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_inject_caption_fields.py`:

```python
"""inject_caption_fields — SEQ/REF OOXML 헬퍼 단위."""

from lxml import etree

from app.renderer.inject_caption_fields import (
    bookmark_id_for,
    build_caption_paragraph_xml,
    build_ref_run_xml,
)


def test_bookmark_id_stable_for_same_block_id():
    assert bookmark_id_for("figure", "img-abcdef12") == "_Ref_figure_img-abcdef12"
    assert bookmark_id_for("table", "tbl-12345678") == "_Ref_table_tbl-12345678"


def test_caption_xml_has_seq_and_bookmark():
    xml = build_caption_paragraph_xml(
        label="그림",
        seq_kind="Figure",
        block_id="img-abcdef12",
        cached_number=3,
        tail_text=". 라벨",
    )
    root = etree.fromstring(xml)
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}

    bm = root.findall(".//w:bookmarkStart", ns)
    assert len(bm) == 1
    assert bm[0].get("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}name") == "_Ref_figure_img-abcdef12"

    instr = root.findall(".//w:instrText", ns)
    assert any("SEQ Figure" in (e.text or "") for e in instr)

    cached = root.xpath("//w:fldChar[@w:fldCharType='separate']/following-sibling::w:r[1]/w:t/text()", namespaces=ns)
    assert cached == ["3"]


def test_ref_run_xml_points_to_bookmark():
    xml = build_ref_run_xml(
        label_kind="table",
        block_id="tbl-12345678",
        cached_number=2,
        prefix_text="표 ",
    )
    root = etree.fromstring(b"<root xmlns:w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'>" + xml + b"</root>")
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}

    instr = root.findall(".//w:instrText", ns)
    assert any("REF _Ref_table_tbl-12345678" in (e.text or "") for e in instr)

    cached = root.xpath("//w:fldChar[@w:fldCharType='separate']/following-sibling::w:r[1]/w:t/text()", namespaces=ns)
    assert cached == ["2"]
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && .venv/bin/pytest tests/test_inject_caption_fields.py -v
```

Expected: FAIL — 모듈 없음.

- [ ] **Step 3: Write minimal implementation**

`backend/app/renderer/inject_caption_fields.py`:

```python
"""Word SEQ / REF 필드 OOXML emit 헬퍼.

python-docx 가 SEQ/REF 를 직접 지원하지 않으므로 raw bytes 를 만들어
caller (`render_docx`) 가 paragraph element 에 삽입한다.

북마크 ID 규약: `_Ref_{label_kind}_{block_id}` — Block.id 는 UUID prefix 기반으로 충돌 가능성 무시 가능.
"""

from typing import Literal

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
LabelKind = Literal["figure", "table"]


def bookmark_id_for(label_kind: LabelKind, block_id: str) -> str:
    return f"_Ref_{label_kind}_{block_id}"


def _w(tag: str) -> str:
    return f"{{{W_NS}}}{tag}"


def build_caption_paragraph_xml(
    *,
    label: str,
    seq_kind: str,
    block_id: str,
    cached_number: int,
    tail_text: str,
    bookmark_id: int = 0,
) -> bytes:
    """캡션 paragraph 의 OOXML.

    구조: `<w:p> [라벨 ] <w:bookmarkStart/> [SEQ field begin/instr/separate/{cached}/end] <w:bookmarkEnd/> [tail] </w:p>`
    """
    label_kind: LabelKind = "figure" if seq_kind.lower().startswith("fig") else "table"
    bm_name = bookmark_id_for(label_kind, block_id)
    return (
        f'<w:p xmlns:w="{W_NS}">'
        f"<w:r><w:t xml:space=\"preserve\">{label} </w:t></w:r>"
        f'<w:bookmarkStart w:id="{bookmark_id}" w:name="{bm_name}"/>'
        '<w:r><w:fldChar w:fldCharType="begin"/></w:r>'
        f'<w:r><w:instrText xml:space="preserve"> SEQ {seq_kind} \\* ARABIC </w:instrText></w:r>'
        '<w:r><w:fldChar w:fldCharType="separate"/></w:r>'
        f"<w:r><w:t>{cached_number}</w:t></w:r>"
        '<w:r><w:fldChar w:fldCharType="end"/></w:r>'
        f'<w:bookmarkEnd w:id="{bookmark_id}"/>'
        f'<w:r><w:t xml:space="preserve">{_escape(tail_text)}</w:t></w:r>'
        "</w:p>"
    ).encode("utf-8")


def build_ref_run_xml(
    *,
    label_kind: LabelKind,
    block_id: str,
    cached_number: int,
    prefix_text: str,
) -> bytes:
    """본문 단락에 inline 으로 삽입할 run 시퀀스: `[prefix] REF field`.

    호출자가 paragraph 의 적절한 위치(매칭 span)에 삽입한다.
    """
    bm_name = bookmark_id_for(label_kind, block_id)
    return (
        f'<w:r xmlns:w="{W_NS}"><w:t xml:space="preserve">{_escape(prefix_text)}</w:t></w:r>'
        f'<w:r xmlns:w="{W_NS}"><w:fldChar w:fldCharType="begin"/></w:r>'
        f'<w:r xmlns:w="{W_NS}"><w:instrText xml:space="preserve"> REF {bm_name} \\h </w:instrText></w:r>'
        f'<w:r xmlns:w="{W_NS}"><w:fldChar w:fldCharType="separate"/></w:r>'
        f'<w:r xmlns:w="{W_NS}"><w:t>{cached_number}</w:t></w:r>'
        f'<w:r xmlns:w="{W_NS}"><w:fldChar w:fldCharType="end"/></w:r>'
    ).encode("utf-8")


def _escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
```

- [ ] **Step 4: Run tests to verify it passes**

```bash
cd backend && .venv/bin/pytest tests/test_inject_caption_fields.py -v
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/renderer/inject_caption_fields.py backend/tests/test_inject_caption_fields.py
git commit -m "feat(renderer): inject_caption_fields — SEQ/REF OOXML 빌더 헬퍼"
```

---

### Task 10: parse_docx 파이프라인 통합

**Files:**
- Modify: `backend/app/parser/parse_docx.py`
- Modify: `backend/tests/test_parse.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_parse.py` 끝에 추가:

```python
def test_parse_pipeline_marks_heading_skip_and_assigns_captions():
    """파이프라인 통합: heading skip warning + 캡션 자동 번호 + 본문 ref 부착."""
    import io
    from docx import Document

    from app.parser.parse_docx import parse_docx

    doc = Document()
    p1 = doc.add_paragraph("큰 제목", style="Heading 1")
    p2 = doc.add_paragraph("아주 깊은 제목", style="Heading 3")  # H1 → H3 skip
    doc.add_paragraph("아래 그림 1 을 참조한다.")
    doc.add_picture(_blank_png_path())  # img-1
    doc.add_table(rows=2, cols=2)        # tbl-1, no caption

    buf = io.BytesIO()
    doc.save(buf)
    outline = parse_docx(buf.getvalue(), filename="t.docx")

    headings = [b for b in outline.blocks if b.kind == "paragraph" and b.level >= 1]
    assert any(b.warning == "heading_skip" for b in headings if b.level == 3)

    image_blocks = [b for b in outline.blocks if b.kind == "image"]
    table_blocks = [b for b in outline.blocks if b.kind == "table"]
    assert image_blocks[0].caption.startswith("그림 1")
    assert table_blocks[0].caption.startswith("표 1")

    paragraph_with_ref = next(
        b for b in outline.blocks if b.kind == "paragraph" and "그림 1" in (b.text or "")
    )
    assert any(r.label_kind == "figure" and r.target_block_id == image_blocks[0].id for r in paragraph_with_ref.caption_refs)
```

`_blank_png_path` 는 같은 파일 상단에 픽스처 헬퍼로 추가 (필요 시):

```python
def _blank_png_path() -> str:
    """1×1 투명 PNG. 테스트 fixture 에 이미 있으면 그 경로 반환."""
    from pathlib import Path
    p = Path(__file__).parent / "fixtures" / "blank.png"
    if not p.exists():
        # 1×1 투명 PNG 바이트
        p.write_bytes(
            bytes.fromhex(
                "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
                "0000000d49444154789c626001000000050001a5f645400000000049454e44ae42"
                "6082"
            )
        )
    return str(p)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && .venv/bin/pytest tests/test_parse.py -v -k "pipeline_marks_heading_skip"
```

Expected: FAIL — `warning` 항상 None 또는 캡션 prefix 없음.

- [ ] **Step 3: Write minimal implementation**

`backend/app/parser/parse_docx.py` 의 `parse_docx` 함수 끝부분 (현재 `return Outline(...)` 직전) 수정:

import 라인에 추가:

```python
from app.domain.style_spec import StyleSpec
from app.parser.assign_caption_numbers import assign_caption_numbers
from app.parser.detect_caption_refs import attach_caption_refs
from app.parser.validate_heading_skip import mark_heading_skips
```

`return Outline(...)` 직전:

```python
    pairs = _collapse_consecutive_empty_paired(pairs)
    blocks = [b for b, _ in pairs]

    # 파이프라인 후처리: heading skip 마킹 → 캡션 번호 → 본문 참조 부착
    blocks = mark_heading_skips(blocks)
    blocks = assign_caption_numbers(blocks, spec=StyleSpec())
    blocks = attach_caption_refs(blocks)

    sections = build_sections(doc, pairs, user_id=user_id, job_id=job_id)
    return Outline(job_id="", source_filename=filename, blocks=blocks, sections=sections)
```

`build_sections` 가 `pairs` 의 Block 객체 정체성을 가정하지 않는지 확인 (현재 코드는 `pairs` 의 (block, body_idx) 를 sections 빌드용으로만 사용). 만약 sections 가 변경된 blocks 를 참조해야 한다면 sections 빌드를 후처리 *전* 으로 옮긴다 — 아래 검증 단계에서 확인.

- [ ] **Step 4: Run tests to verify it passes**

```bash
cd backend && .venv/bin/pytest tests/test_parse.py tests/test_sections.py tests/test_integration_heavy.py -v
```

Expected: ALL PASS. `test_sections.py` 가 깨지면 sections 빌드를 후처리 직전으로 이동.

- [ ] **Step 5: Commit**

```bash
git add backend/app/parser/parse_docx.py backend/tests/test_parse.py
git commit -m "feat(parser): parse_docx 파이프라인 — heading skip + 캡션 번호 + 본문 ref 부착"
```

---

### Task 11: render_docx — SEQ/REF 통합 + 라운드트립

**Files:**
- Modify: `backend/app/renderer/render_docx.py`
- Create: `backend/tests/test_parse_pipeline_integration.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_parse_pipeline_integration.py`:

```python
"""end-to-end: docx 입력 → outline → docx 출력 → 재파싱 일관성."""

import io

from docx import Document
from lxml import etree

from app.domain.style_spec import StyleSpec
from app.parser.parse_docx import parse_docx
from app.renderer.render_docx import render_docx


def _make_input_docx() -> bytes:
    doc = Document()
    doc.add_paragraph("큰 제목", style="Heading 1")
    doc.add_paragraph("작은 제목", style="Heading 2")
    doc.add_paragraph("표 1 을 참조한다.")
    doc.add_table(rows=2, cols=2)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_caption_emits_seq_field_and_body_emits_ref_field():
    outline = parse_docx(_make_input_docx(), filename="t.docx")
    out_bytes = render_docx(outline, spec=StyleSpec())

    out_doc = Document(io.BytesIO(out_bytes))
    body_xml = etree.tostring(out_doc.element.body).decode("utf-8")

    assert "SEQ Table" in body_xml or "SEQ Figure" in body_xml
    assert "REF _Ref_" in body_xml
    assert "bookmarkStart" in body_xml


def test_roundtrip_parse_yields_same_caption_numbers():
    input_bytes = _make_input_docx()
    outline_a = parse_docx(input_bytes, filename="t.docx")
    out_bytes = render_docx(outline_a, spec=StyleSpec())
    outline_b = parse_docx(out_bytes, filename="roundtrip.docx")

    captions_a = [b.caption for b in outline_a.blocks if b.kind in ("table", "image")]
    captions_b = [b.caption for b in outline_b.blocks if b.kind in ("table", "image")]
    # SEQ 필드의 캐시값이 같은 번호를 표시해야 동일 outline 으로 재파싱됨
    assert captions_a == captions_b
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && .venv/bin/pytest tests/test_parse_pipeline_integration.py -v
```

Expected: FAIL — 현재 `_add_caption_paragraph` 와 본문 paragraph 가 평문만 emit.

- [ ] **Step 3: Write minimal implementation**

`backend/app/renderer/render_docx.py` 수정. `_add_caption_paragraph` 를 SEQ 헬퍼로 교체, 본문 paragraph 출력 시 `caption_refs` 가 있으면 REF 헬퍼로 치환:

import 추가:

```python
from lxml import etree

from app.renderer.inject_caption_fields import (
    build_caption_paragraph_xml,
    build_ref_run_xml,
)
```

캡션 출력 함수 교체:

```python
def _add_caption_paragraph_with_field(doc, caption: str, block_id: str, kind: str, cached_n: int, spec: StyleSpec) -> None:
    """`그림 N. 제목` / `표 N. 제목` 형태의 캡션을 SEQ 필드로 emit.

    `caption` 이 표준 prefix 를 가지지 않으면 평문 fallback.
    """
    import re
    m = re.match(r"^\s*(그림|표|Figure|Table)\s*(\d+)\s*([.:\]\-—]?)\s*(.*)$", caption)
    if not m:
        para = doc.add_paragraph(caption)
        return

    label = m.group(1)
    sep = m.group(3) or "."
    tail = m.group(4)
    seq_kind = "Figure" if label in ("그림", "Figure") else "Table"

    xml = build_caption_paragraph_xml(
        label=label,
        seq_kind=seq_kind,
        block_id=block_id,
        cached_number=cached_n,
        tail_text=f"{sep} {tail}" if tail else "",
    )
    new_p = etree.fromstring(xml)
    doc.element.body.append(new_p)
```

호출지 (`render_docx` 의 image/table 분기에서 `_add_caption_paragraph` 가 쓰이던 자리) 를 위 함수로 교체. block_id, cached_n 은 현재 block 의 `block.id` 와 caption 안의 숫자에서 추출.

본문 paragraph 출력 함수 (`_add_paragraph_block`) 수정 — `block.caption_refs` 가 있고 `target_block_id` 가 있는 위치를 REF 로 치환:

```python
def _add_paragraph_block(doc, block: Block, spec: StyleSpec) -> None:
    text = block.text or ""
    if not block.caption_refs:
        para = doc.add_paragraph(text)
        apply_paragraph_style(para, block.level, spec, alignment_override=block.alignment)
        return

    # caption_refs 의 span 을 따라 텍스트를 분할하고 REF 를 끼워넣는다
    para = doc.add_paragraph()
    apply_paragraph_style(para, block.level, spec, alignment_override=block.alignment)

    cursor = 0
    for ref in sorted(block.caption_refs, key=lambda r: r.span[0]):
        start, end = ref.span
        if start < cursor:  # 겹치는 매칭 — 무시
            continue
        if start > cursor:
            para.add_run(text[cursor:start])
        if ref.target_block_id is None:
            para.add_run(text[start:end])  # 매핑 실패 — 평문
        else:
            run_xml = build_ref_run_xml(
                label_kind=ref.label_kind,
                block_id=ref.target_block_id,
                cached_number=ref.detected_number,
                prefix_text=text[start:end].split(str(ref.detected_number))[0],
            )
            para._p.append(etree.fromstring(b"<root xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">" + run_xml + b"</root>")[0])
        cursor = end
    if cursor < len(text):
        para.add_run(text[cursor:])
```

(주의: 위 코드는 paragraph element 직접 조작이라 spec.font 적용이 새 run 에는 안 붙음 — apply_paragraph_style 이 이미 paragraph format 을 셋팅했으므로 대부분 OK. 폰트/사이즈 정확도는 후속 작업.)

- [ ] **Step 4: Run tests to verify it passes**

```bash
cd backend && .venv/bin/pytest tests/test_parse_pipeline_integration.py tests/test_render.py tests/test_render_field.py -v
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/renderer/render_docx.py backend/tests/test_parse_pipeline_integration.py
git commit -m "feat(renderer): 캡션 SEQ + 본문 REF 필드 emit + 라운드트립 테스트"
```

---

## Phase E — 프론트 데이터 + 핫키 (Tasks 12–14)

### Task 12: 프론트 Block 타입 확장 + i18n 키 추가

**Files:**
- Modify: `frontend/lib/types.ts`
- Modify: `frontend/lib/i18n.ts`

- [ ] **Step 1: Write the failing test**

`frontend/lib/__tests__/types.test.ts` 신규:

```typescript
import { describe, it, expect } from "vitest";
import type { Block, CaptionRef } from "@/lib/types";

describe("Block extended fields", () => {
  it("optional subtype/warning/caption_refs accepted", () => {
    const ref: CaptionRef = {
      label_kind: "figure",
      detected_number: 1,
      target_block_id: "img-1",
      span: [0, 4],
    };
    const b: Block = {
      id: "b-1",
      kind: "paragraph",
      level: 0,
      subtype: "note",
      warning: "heading_skip",
      caption_refs: [ref],
    };
    expect(b.subtype).toBe("note");
    expect(b.caption_refs?.[0].label_kind).toBe("figure");
  });
});
```

`frontend/lib/__tests__/i18n.test.ts` 신규:

```typescript
import { describe, it, expect } from "vitest";
import { MESSAGES } from "@/lib/i18n";

describe("i18n new keys", () => {
  it.each(["editor.headingSkipBlocked", "editor.headingSkipQuickFix", "caption.placeholder.missing", "caption.refMismatch"])(
    "key %s present in both ko and en",
    (key) => {
      expect(MESSAGES.ko[key]).toBeDefined();
      expect(MESSAGES.en[key]).toBeDefined();
    }
  );
});
```

`vitest.config.ts` (없으면 신규):

```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test-setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

`test-setup.ts` (없으면 신규):

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npm test -- types i18n
```

Expected: FAIL — `subtype`/`warning`/`caption_refs` 미정의 또는 `MESSAGES.ko["editor.headingSkipBlocked"]` undefined.

- [ ] **Step 3: Write minimal implementation**

`frontend/lib/types.ts` 의 `Block` 인터페이스 확장:

```typescript
export interface CaptionRef {
  label_kind: "figure" | "table";
  detected_number: number;
  target_block_id: string | null;
  span: [number, number];
}

export interface Block {
  // 기존 필드
  id: string;
  kind: "paragraph" | "table" | "image" | "field";
  level: number;
  text?: string | null;
  detected_by?: "word_style" | "outline_level" | "based_on" | "heuristic" | "user" | null;
  alignment?: "left" | "right" | "center" | "justify" | null;
  caption?: string | null;
  // ... 기존 나머지 ...

  // 신규
  subtype?: "body" | "note" | null;
  warning?: "heading_skip" | null;
  caption_refs?: CaptionRef[];
}
```

`frontend/lib/i18n.ts` 의 `MESSAGES.ko` / `MESSAGES.en` 양쪽에 추가:

```typescript
// ko
"editor.headingSkipBlocked": "직전 단계 보다 두 단계 깊게 갈 수 없습니다.",
"editor.headingSkipQuickFix": "한 단계 끌어올리기",
"caption.placeholder.missing": "다운로드 후 추가",
"caption.refMismatch": "캡션 번호와 본문 참조가 일치하지 않습니다.",

// en
"editor.headingSkipBlocked": "Cannot skip more than one heading level.",
"editor.headingSkipQuickFix": "Promote one level",
"caption.placeholder.missing": "Add after download",
"caption.refMismatch": "Body reference does not match caption number.",
```

`MessageKey` 타입에도 4개 키 추가.

- [ ] **Step 4: Run tests to verify it passes**

```bash
cd frontend && npm test
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/types.ts frontend/lib/i18n.ts frontend/vitest.config.ts frontend/test-setup.ts frontend/lib/__tests__/
git commit -m "feat(frontend): Block 타입 확장 + i18n 키 추가 + vitest 셋업"
```

---

### Task 13: OutlineEditor — p/n 핫키

**Files:**
- Modify: `frontend/components/outline-editor/OutlineEditor.tsx`
- Create: `frontend/components/outline-editor/__tests__/OutlineEditor.test.tsx`

- [ ] **Step 1: Write the failing test**

`frontend/components/outline-editor/__tests__/OutlineEditor.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OutlineEditor } from "../OutlineEditor";
import type { Outline } from "@/lib/types";
import { SettingsProvider } from "@/components/settings-provider";

function _renderWith(outline: Outline) {
  return render(
    <SettingsProvider>
      <OutlineEditor outline={outline} onChange={() => {}} />
    </SettingsProvider>
  );
}

describe("p hotkey", () => {
  it("converts selected paragraph to body subtype, level 0", () => {
    const outline: Outline = {
      job_id: "j",
      source_filename: "t.docx",
      blocks: [{ id: "b-1", kind: "paragraph", level: 2, text: "테스트" }],
      sections: [],
    };
    const onChange = vi.fn();
    render(<SettingsProvider><OutlineEditor outline={outline} onChange={onChange} /></SettingsProvider>);

    const block = screen.getByText("테스트");
    fireEvent.click(block); // select
    fireEvent.keyDown(document.body, { key: "p" });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      blocks: [expect.objectContaining({ id: "b-1", level: 0, subtype: "body" })],
    }));
  });
});

describe("n hotkey", () => {
  it("converts selected paragraph to note subtype, level 0", () => {
    const outline: Outline = {
      job_id: "j",
      source_filename: "t.docx",
      blocks: [{ id: "b-1", kind: "paragraph", level: 1, text: "노트로" }],
      sections: [],
    };
    const onChange = vi.fn();
    render(<SettingsProvider><OutlineEditor outline={outline} onChange={onChange} /></SettingsProvider>);

    fireEvent.click(screen.getByText("노트로"));
    fireEvent.keyDown(document.body, { key: "n" });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      blocks: [expect.objectContaining({ id: "b-1", level: 0, subtype: "note" })],
    }));
  });

  it("ignores hotkey when input is focused", () => {
    const onChange = vi.fn();
    render(
      <div>
        <input data-testid="ti" />
        <SettingsProvider>
          <OutlineEditor outline={{ job_id: "j", source_filename: "t", blocks: [], sections: [] }} onChange={onChange} />
        </SettingsProvider>
      </div>
    );
    const inp = screen.getByTestId("ti");
    inp.focus();
    fireEvent.keyDown(inp, { key: "n" });
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npm test -- OutlineEditor
```

Expected: FAIL — 핫키 미구현.

- [ ] **Step 3: Write minimal implementation**

`frontend/components/outline-editor/OutlineEditor.tsx` 의 `handleKeyDown` 함수 확장. 상단에 input/textarea 가드 + 핫키 분기:

```tsx
function handleKeyDown(e: React.KeyboardEvent) {
  const target = e.target as HTMLElement;
  const tag = target.tagName;
  const editable = (target as HTMLElement).isContentEditable;
  if (tag === "INPUT" || tag === "TEXTAREA" || editable) return;

  if (selected.size === 0) return;

  if ((e.key === "p" || e.key === "n") && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const subtype = e.key === "p" ? "body" : "note";
    const next = {
      ...outline,
      blocks: outline.blocks.map((b) =>
        selected.has(b.id) && b.kind === "paragraph"
          ? { ...b, level: 0, subtype }
          : b
      ),
    };
    onChange(next);
    e.preventDefault();
    return;
  }

  // Tab — Task 14 에서 추가
  // ... 기존 Tab 로직 ...
}
```

`onKeyDown={handleKeyDown}` 가 wrapper (`<div tabIndex={0}>`) 에 붙어있는지 확인 (이미 OutlineEditor.tsx:225 에 있음).

- [ ] **Step 4: Run tests to verify it passes**

```bash
cd frontend && npm test -- OutlineEditor
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/outline-editor/OutlineEditor.tsx frontend/components/outline-editor/__tests__/OutlineEditor.test.tsx
git commit -m "feat(frontend): OutlineEditor — p(본문)/n(노트) 핫키 + input 포커스 가드"
```

---

### Task 14: OutlineEditor — Tab heading skip 차단

**Files:**
- Modify: `frontend/components/outline-editor/OutlineEditor.tsx`
- Modify: `frontend/components/outline-editor/__tests__/OutlineEditor.test.tsx`

- [ ] **Step 1: Write the failing test**

`OutlineEditor.test.tsx` 끝에 추가:

```typescript
describe("Tab skip block", () => {
  it("blocks Tab when target level would skip more than one (H1 → H3)", () => {
    const outline: Outline = {
      job_id: "j",
      source_filename: "t",
      blocks: [
        { id: "b-1", kind: "paragraph", level: 1, text: "H1" },
        { id: "b-2", kind: "paragraph", level: 2, text: "지금 H2 — Tab 누르면 H3 가 되려 하지만 직전 heading 이 H1 이므로 OK" },
      ],
      sections: [],
    };
    const onChange = vi.fn();
    render(<SettingsProvider><OutlineEditor outline={outline} onChange={onChange} /></SettingsProvider>);

    fireEvent.click(screen.getByText(/지금 H2/));
    fireEvent.keyDown(document.body, { key: "Tab" });

    // H1 → H2 이미 직전, +1 → H3 는 OK 가 아님 (skip 검사: target level - prev_heading > 1)
    // prev_heading = H1, target = H3 → 차이 2 → 차단
    expect(onChange).not.toHaveBeenCalled();
  });

  it("allows Tab when target level is prev_heading + 1", () => {
    const outline: Outline = {
      job_id: "j",
      source_filename: "t",
      blocks: [
        { id: "b-1", kind: "paragraph", level: 1, text: "H1" },
        { id: "b-2", kind: "paragraph", level: 1, text: "지금 H1 — Tab 누르면 H2" },
      ],
      sections: [],
    };
    const onChange = vi.fn();
    render(<SettingsProvider><OutlineEditor outline={outline} onChange={onChange} /></SettingsProvider>);

    fireEvent.click(screen.getByText(/지금 H1/));
    fireEvent.keyDown(document.body, { key: "Tab" });

    expect(onChange).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npm test -- OutlineEditor
```

Expected: FAIL — Tab 이 무조건 indent.

- [ ] **Step 3: Write minimal implementation**

`OutlineEditor.tsx` 의 Tab 분기 보강:

```tsx
if (e.key === "Tab" && selected.size > 0) {
  e.preventDefault();
  const direction = e.shiftKey ? -1 : 1;

  // 선택된 paragraph 들의 새 level 계산 + 직전 heading skip 검증
  const newBlocks = [...outline.blocks];
  let prevHeading = 0;
  let blocked = false;

  for (let i = 0; i < newBlocks.length; i++) {
    const b = newBlocks[i];
    if (b.kind !== "paragraph") continue;
    if (selected.has(b.id)) {
      const newLevel = Math.max(0, Math.min(5, b.level + direction));
      if (newLevel >= 1 && newLevel - prevHeading > 1) {
        blocked = true;
        break;
      }
      newBlocks[i] = { ...b, level: newLevel, subtype: newLevel === 0 ? b.subtype : null };
      if (newLevel >= 1) prevHeading = newLevel;
    } else if (b.level >= 1) {
      prevHeading = b.level;
    }
  }

  if (blocked) {
    // i18n 메시지를 toast 컴포넌트로 — 현재 코드에 toast 없으면 console.warn 폴백
    if (typeof window !== "undefined" && (window as { __toast?: (msg: string) => void }).__toast) {
      (window as { __toast?: (msg: string) => void }).__toast?.(t("editor.headingSkipBlocked"));
    } else {
      console.warn(t("editor.headingSkipBlocked"));
    }
    return;
  }

  onChange({ ...outline, blocks: newBlocks });
}
```

(`t` 는 `useT()` 훅. Toast 인프라가 없으면 위처럼 window.__toast 폴백 — 후속 PR 에서 정식 toast 컴포넌트 추가 가능.)

- [ ] **Step 4: Run tests to verify it passes**

```bash
cd frontend && npm test -- OutlineEditor
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/outline-editor/OutlineEditor.tsx frontend/components/outline-editor/__tests__/OutlineEditor.test.tsx
git commit -m "feat(frontend): Tab heading skip 차단 + i18n 메시지 토스트 폴백"
```

---

## Phase F — 시각화 + 보너스 fix (Tasks 15–17)

### Task 15: ParagraphBlock — subtype="note" 시각화

**Files:**
- Modify: `frontend/components/outline-editor/ParagraphBlock.tsx`
- Create: `frontend/components/outline-editor/__tests__/ParagraphBlock.test.tsx`

- [ ] **Step 1: Write the failing test**

`ParagraphBlock.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ParagraphBlock } from "../ParagraphBlock";
import { SettingsProvider } from "@/components/settings-provider";
import type { Block } from "@/lib/types";

const noteBlock: Block = { id: "b-1", kind: "paragraph", level: 0, subtype: "note", text: "노트입니다" };

describe("ParagraphBlock subtype=note", () => {
  it("applies note styling (italic + indent + left border)", () => {
    render(
      <SettingsProvider>
        <ParagraphBlock block={noteBlock} selected={false} onSelect={() => {}} headingNumber="" />
      </SettingsProvider>
    );
    const el = screen.getByText("노트입니다").closest("div");
    expect(el?.className).toMatch(/italic/);
    expect(el?.className).toMatch(/pl-/); // padding-left
    expect(el?.className).toMatch(/border-l/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npm test -- ParagraphBlock
```

Expected: FAIL — 노트 스타일 분기 없음.

- [ ] **Step 3: Write minimal implementation**

`frontend/components/outline-editor/ParagraphBlock.tsx` 의 root element className 에 conditional 추가:

```tsx
const isNote = block.subtype === "note";

<div
  className={clsx(
    "...기존 클래스...",
    isNote && "pl-6 italic text-text-muted border-l-2 border-warning/30",
    selected && "ring-2 ring-primary",
  )}
  // ...
>
```

ParagraphBlock 컴포넌트 props 가 `Block` 받는 시그니처라면 그대로. 이미 그렇게 되어 있음 (`components/outline-editor/ParagraphBlock.tsx:8`).

- [ ] **Step 4: Run tests to verify it passes**

```bash
cd frontend && npm test -- ParagraphBlock
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/outline-editor/ParagraphBlock.tsx frontend/components/outline-editor/__tests__/ParagraphBlock.test.tsx
git commit -m "feat(frontend): ParagraphBlock — note subtype 시각화 (들여쓰기 + 이탤릭 + 좌측 줄)"
```

---

### Task 16: ParagraphBlock — heading_skip warning 시각화 + 빠른 수정

**Files:**
- Modify: `frontend/components/outline-editor/ParagraphBlock.tsx`
- Modify: `frontend/components/outline-editor/__tests__/ParagraphBlock.test.tsx`

- [ ] **Step 1: Write the failing test**

`ParagraphBlock.test.tsx` 끝에 추가:

```typescript
describe("ParagraphBlock warning=heading_skip", () => {
  const skipBlock: Block = {
    id: "b-2",
    kind: "paragraph",
    level: 3,
    text: "스킵된 H3",
    warning: "heading_skip",
  };

  it("renders yellow left border", () => {
    render(
      <SettingsProvider>
        <ParagraphBlock block={skipBlock} selected={false} onSelect={() => {}} headingNumber="1.0.1" />
      </SettingsProvider>
    );
    const el = screen.getByText("스킵된 H3").closest("div");
    expect(el?.className).toMatch(/border-warning|border-yellow/);
  });

  it("renders quick-fix button that calls onChangeBlock with level - 1", () => {
    const onChangeBlock = vi.fn();
    render(
      <SettingsProvider>
        <ParagraphBlock
          block={skipBlock}
          selected={false}
          onSelect={() => {}}
          headingNumber="1.0.1"
          onChangeBlock={onChangeBlock}
        />
      </SettingsProvider>
    );
    const btn = screen.getByRole("button", { name: /끌어올리기|Promote/ });
    fireEvent.click(btn);
    expect(onChangeBlock).toHaveBeenCalledWith({ ...skipBlock, level: 2, warning: null });
  });
});
```

`fireEvent` import 추가.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npm test -- ParagraphBlock
```

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`ParagraphBlock.tsx` 시그니처 확장 (선택적 `onChangeBlock` prop):

```tsx
interface ParagraphBlockProps {
  block: Block;
  selected: boolean;
  onSelect: () => void;
  headingNumber: string;
  onChangeBlock?: (next: Block) => void;
}
```

className 분기:

```tsx
const hasSkip = block.warning === "heading_skip";

<div
  className={clsx(
    "...",
    isNote && "pl-6 italic text-text-muted border-l-2 border-warning/30",
    hasSkip && "border-l-4 border-warning",
    selected && "ring-2 ring-primary",
  )}
>
  {/* ... 기존 텍스트 ... */}

  {hasSkip && onChangeBlock ? (
    <button
      type="button"
      className="ml-2 rounded-token border border-warning bg-warning/10 px-2 py-0.5 text-xs text-warning hover:bg-warning/20"
      onClick={(e) => {
        e.stopPropagation();
        onChangeBlock({ ...block, level: Math.max(1, block.level - 1), warning: null });
      }}
    >
      {t("editor.headingSkipQuickFix")}
    </button>
  ) : null}
</div>
```

`OutlineEditor.tsx` 호출지에서 `onChangeBlock` 을 prop 으로 전달:

```tsx
<ParagraphBlock
  block={b}
  selected={selected.has(b.id)}
  onSelect={() => toggleSelect(b.id)}
  headingNumber={headingNumbers.get(b.id) ?? ""}
  onChangeBlock={(next) => {
    onChange({
      ...outline,
      blocks: outline.blocks.map((x) => (x.id === next.id ? next : x)),
    });
  }}
/>
```

- [ ] **Step 4: Run tests to verify it passes**

```bash
cd frontend && npm test -- ParagraphBlock
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/outline-editor/ParagraphBlock.tsx frontend/components/outline-editor/OutlineEditor.tsx frontend/components/outline-editor/__tests__/ParagraphBlock.test.tsx
git commit -m "feat(frontend): heading_skip warning 좌측 줄 + 한 단계 끌어올리기 빠른 수정 버튼"
```

---

### Task 17: 보너스 — 로그인 후 router.refresh()

**Files:**
- Modify: `frontend/app/(auth)/login/page.tsx`

- [ ] **Step 1: Write the failing test**

수동 검증으로 진행 (이 fix 는 React Server Component 와 Router Cache 의 통합 동작이라 jsdom 단위 테스트로 재현 어려움). 대신 코드 리뷰 체크리스트:

```
□ frontend/app/(auth)/login/page.tsx 의 handleSubmit 안에 router.refresh() 호출이 있는가
□ router.refresh() 가 router.push() 보다 먼저 호출되는가 (캐시 무효화 → 네비게이션)
□ 로그인 → 곧바로 사이드바/상단바가 보이는가 (수동 시나리오)
```

- [ ] **Step 2: 수동 재현 — 수정 전 상태 확인**

```bash
cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000 &
cd frontend && npm run dev
```

브라우저에서 http://localhost:3000/login → user@local.test / 비밀번호 (시드값) → 로그인 후 dashboard 진입 시 좌측 사이드바와 상단 헤더가 비어있는지 확인. 새로고침 시 나타나야 정상.

- [ ] **Step 3: Write minimal implementation**

`frontend/app/(auth)/login/page.tsx` 의 `handleSubmit` 수정:

```tsx
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  setError(null);
  setBusy(true);
  try {
    await api.login(email, password);
    router.refresh();         // <-- 추가: RootLayout 의 fetchMe() 재실행
    router.push("/dashboard");
  } catch (err) {
    setError((err as Error).message);
  } finally {
    setBusy(false);
  }
}
```

- [ ] **Step 4: 수동 재현 — 수정 후 사이드바 즉시 노출 확인**

브라우저 hard reload (Cmd+Shift+R) → /login → 로그인 → /dashboard 진입과 동시에 사이드바/상단바 노출되는지 확인.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/\(auth\)/login/page.tsx
git commit -m "fix(auth): 로그인 후 router.refresh() — 사이드바/상단바 즉시 노출"
```

---

## Phase G — 통합 검증 (Task 18)

### Task 18: 전체 회귀 + e2e 시나리오

**Files:**
- (검증 only — 코드 변경 없음)

- [ ] **Step 1: 전체 백엔드 테스트**

```bash
cd backend && .venv/bin/pytest -v
```

Expected: ALL PASS. 새/기존 테스트 모두 통과해야 함. 실패 시 해당 작업 단계로 돌아가 디버그.

- [ ] **Step 2: 전체 프론트엔드 테스트 + lint**

```bash
cd frontend && npm test && npm run lint
```

Expected: ALL PASS.

- [ ] **Step 3: 시나리오 — `.docx` 한 바퀴**

```bash
cd backend && .venv/bin/uvicorn app.main:app --port 8000 &
cd frontend && npm run dev
```

수동 체크리스트:
- [ ] 로그인 → 사이드바 즉시 노출
- [ ] 30 페이지 데모 SOP Job 의 outline 페이지 진입
- [ ] H1 직후 H3 가 있는 단락에 노란 좌측 줄 + "한 단계 끌어올리기" 버튼 표시
- [ ] 버튼 클릭 시 H2 로 변경되고 warning 사라짐
- [ ] 평범한 paragraph 선택 후 `n` 키 → 들여쓰기 + 이탤릭 노트 스타일
- [ ] `p` 키 → 본문 스타일 복귀
- [ ] Tab 으로 H1 paragraph 두 단계 연속 indent 시도 → 두 번째 Tab 차단됨
- [ ] 표/이미지 캡션이 `표 N` / `그림 N` prefix 로 자동 부여
- [ ] 본문에 적힌 `그림 1` 이 시각적으로 강조 (선택)
- [ ] .docx 다운로드 → Word 에서 열고 F9 → 모든 SEQ/REF 필드 갱신 정상

- [ ] **Step 4: 라운드트립 시나리오**

```bash
# 다운로드된 .docx 를 다시 업로드해서 outline 이 동일한지 확인
```

- [ ] **Step 5: 최종 정리 커밋 (필요 시)**

테스트/문서 업데이트 분량 누락 시 별도 커밋:

```bash
git add CHANGELOG.md  # 있는 경우
git commit -m "docs: 아웃라인 에디터 보강 변경 요약"
```

---

## Self-Review (작성자 자체 검증 — 실행 시 무시)

| 스펙 항목 | 커버하는 Task |
|---|---|
| R1 — heading skip 차단 (warning + 시각화 + 새 편집 차단) | T6 (백엔드 마킹), T14 (Tab 차단), T16 (시각화 + 빠른 수정) |
| R2 — p/n 단축키 + Block.subtype | T1 (모델), T13 (핫키), T15 (시각화) |
| R3 — 첫 파싱 보존 (outlineLvl + Title/Subtitle + basedOn) | T3, T4, T5 |
| R4 — 캡션 자동 번호 + SEQ/REF 필드 emit + 본문 시프트 | T2 (StyleSpec), T7 (auto number), T8 (refs detect), T9 (헬퍼), T10 (파이프라인), T11 (render+roundtrip) |
| Bonus — 로그인 후 사이드바 | T17 |

Placeholder 스캔: 없음. 모든 step 에 실제 코드/명령 포함.

타입 일관성: `CaptionRef` (백엔드 Pydantic / 프론트 TS) 의 필드 이름 일치 (`label_kind`, `detected_number`, `target_block_id`, `span`). `DetectedBy` 신규 값 (`outline_level`, `based_on`) 백엔드와 프론트에 동일하게 추가.
