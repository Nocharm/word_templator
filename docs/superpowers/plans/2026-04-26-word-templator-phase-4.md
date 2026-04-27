# Word Templator Phase 4 Implementation Plan — 상대 참조 (TOC / REF / PAGEREF)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Word 필드 (`<w:fldSimple>` / `<w:fldChar>` 영역) 와 북마크 (`<w:bookmarkStart>` / `<w:bookmarkEnd>`) 를 가진 문단을 원본 OOXML 그대로 보존했다가 렌더 시 다시 끼워넣어, TOC 자동갱신·REF/PAGEREF 상호참조가 변환 후에도 동작하도록 한다.

**Architecture:**
1. 파서 (`extract_field.py`) — 문단별로 필드/북마크 존재 여부, 필드 종류 (toc / ref / pageref / unknown) 를 검사. 해당 문단의 전체 `<w:p>` 를 deepcopy 해 디스크에 저장 (`raw_xml_ref="field-N"`). `Block.raw_xml_ref` + `Block.field_kind` (가장 두드러진 종류) 를 outline 에 기록.
2. 렌더러 (`reembed_raw.reembed_paragraph`) — paragraph 블록에 `raw_xml_ref` 가 있으면 디스크에서 원본 `<w:p>` 를 읽어 본문에 그대로 삽입 (style 재적용 없이, runs/fields/bookmarks 를 그대로 유지). 페이지 마진은 별도 `_setup_page` 가 처리하므로 영향 없음.
3. 헤딩 등 "북마크만" 있고 필드가 없는 문단은 새 paragraph 를 만들고 원본 bookmark 엘리먼트만 추출해 주입 — 이러면 헤딩 스타일은 새 템플릿대로 유지하면서 REF/PAGEREF 의 타겟이 살아남음.
4. 프론트 — 보존된 문단에 `📎 필드` 배지를 붙이고, 에디터 상단에 "필드 N개 보존됨, M개 검토 필요" 요약을 표시.

**Tech Stack:** lxml, python-docx, pydantic v2, Next.js 15 + React 19, Tailwind 3.

---

## File Structure

### Backend

| 경로 | 책임 | 신규/수정 |
|---|---|---|
| `backend/app/parser/extract_field.py` | `paragraph_has_field`, `paragraph_has_bookmark`, `detect_field_kind`, `extract_field_preview`, `extract_bookmarks`, `clone_paragraph_xml` | **Create** |
| `backend/app/parser/parse_docx.py` | 문단별 필드/북마크 검사, `Block.raw_xml_ref` + `Block.field_kind` + `Block.preview_text` 기록, 디스크 저장 | **Modify** |
| `backend/app/renderer/reembed_raw.py` | `reembed_paragraph(...)` 추가 (paragraph OOXML 재삽입), `inject_bookmarks_into(new_p, original_p)` 추가 | **Modify** |
| `backend/app/renderer/render_docx.py` | paragraph 블록에 raw_xml_ref 있으면 reembed_paragraph 분기, bookmark-only 면 inject_bookmarks 적용 | **Modify** |
| `backend/tests/fixtures/build_field_sample.py` | TOC + bookmark + REF 가 들어있는 .docx 빌더 | **Create** |
| `backend/tests/test_extract_field.py` | 필드/북마크 감지 + 종류 판별 단위 테스트 | **Create** |
| `backend/tests/test_render_field.py` | reembed_paragraph + bookmark 주입 단위 테스트 | **Create** |
| `backend/tests/test_parse.py` | Phase 4 통합 케이스 추가 | **Modify** |

### Frontend

| 경로 | 책임 | 신규/수정 |
|---|---|---|
| `frontend/lib/types.ts` | `Block.field_kind` / `Block.preview_text` / `Block.raw_xml_ref` 타입 보강 | **Modify** |
| `frontend/components/outline-editor/ParagraphBlock.tsx` | `📎 필드` 배지 표시 (raw_xml_ref 가 있을 때) | **Modify** |
| `frontend/components/outline-editor/OutlineEditor.tsx` | 상단에 "필드 N개 보존됨, M개 검토 필요" 요약 표시 | **Modify** |

---

## 작업 순서 원칙

- 백엔드 → 프론트 → 통합/문서 (Phase 1-3 동일).
- Task 1 (검출) → Task 2 (저장) → Task 3 (렌더 reembed) → Task 4 (북마크 주입) → Task 5 (라운드트립 통합 테스트) → Task 6 (프론트) → Task 7 (spec 업데이트).
- 각 task TDD: 실패 테스트 → 구현 → 통과 → 커밋.

---

### Task 1: 필드/북마크 검출 모듈

**Files:**
- Create: `backend/app/parser/extract_field.py`
- Create: `backend/tests/fixtures/build_field_sample.py`
- Create: `backend/tests/test_extract_field.py`

**Why:** 필드와 북마크 검출을 한 모듈에 모아둬 향후 inline 분류 등 확장이 쉽게 한다. 픽스처 빌더는 lxml 로 OOXML 을 직접 만들어야 한다 (python-docx 가 필드/북마크 native API 를 안 줌).

- [ ] **Step 1: 픽스처 빌더 작성 — `backend/tests/fixtures/build_field_sample.py`**

```python
"""필드(TOC/REF) + 북마크가 들어있는 .docx 픽스처 빌더."""

from pathlib import Path

from docx import Document
from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph
from lxml import etree


def _make_run_with_text(text: str):
    r = etree.SubElement(etree.Element(qn("w:dummy")), qn("w:r"))
    t = etree.SubElement(r, qn("w:t"))
    t.text = text
    t.set(qn("xml:space"), "preserve")
    return r


def add_bookmark(paragraph: Paragraph, *, name: str, bm_id: int) -> None:
    """문단 시작/끝에 <w:bookmarkStart/> / <w:bookmarkEnd/> 를 끼워넣는다."""
    p_el = paragraph._p
    start = etree.Element(qn("w:bookmarkStart"))
    start.set(qn("w:id"), str(bm_id))
    start.set(qn("w:name"), name)
    end = etree.Element(qn("w:bookmarkEnd"))
    end.set(qn("w:id"), str(bm_id))
    # pPr 다음, 첫 run 앞에 start. 끝에 end.
    pPr = p_el.find(qn("w:pPr"))
    insert_idx = 0 if pPr is None else list(p_el).index(pPr) + 1
    p_el.insert(insert_idx, start)
    p_el.append(end)


def add_simple_field(paragraph: Paragraph, *, instr: str, display_text: str) -> None:
    """<w:fldSimple w:instr="...">display</w:fldSimple> 형태로 삽입."""
    p_el = paragraph._p
    fld = etree.SubElement(p_el, qn("w:fldSimple"))
    fld.set(qn("w:instr"), instr)
    r = etree.SubElement(fld, qn("w:r"))
    t = etree.SubElement(r, qn("w:t"))
    t.text = display_text
    t.set(qn("xml:space"), "preserve")


def add_complex_toc_field(paragraph: Paragraph, *, display_text: str) -> None:
    """3-part complex field: begin / instrText / separate / display / end."""
    p_el = paragraph._p
    instr = 'TOC \\o "1-3" \\h \\z \\u'

    def run_with_fldchar(t: str) -> None:
        r = etree.SubElement(p_el, qn("w:r"))
        fc = etree.SubElement(r, qn("w:fldChar"))
        fc.set(qn("w:fldCharType"), t)

    run_with_fldchar("begin")
    r2 = etree.SubElement(p_el, qn("w:r"))
    it = etree.SubElement(r2, qn("w:instrText"))
    it.text = instr
    it.set(qn("xml:space"), "preserve")
    run_with_fldchar("separate")
    r3 = etree.SubElement(p_el, qn("w:r"))
    t = etree.SubElement(r3, qn("w:t"))
    t.text = display_text
    t.set(qn("xml:space"), "preserve")
    run_with_fldchar("end")


def build_sample_with_field_and_bookmark(out_path: Path) -> Path:
    doc = Document()
    h1 = doc.add_paragraph("개요", style="Heading 1")
    add_bookmark(h1, name="_Ref100001", bm_id=1)

    toc_para = doc.add_paragraph()
    add_complex_toc_field(toc_para, display_text="목차")

    body = doc.add_paragraph()
    body.add_run("자세한 내용은 ")
    add_simple_field(body, instr="REF _Ref100001 \\h", display_text="개요")
    body.add_run(" 참조.")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(out_path))
    return out_path


if __name__ == "__main__":
    here = Path(__file__).resolve().parent
    print(f"wrote {build_sample_with_field_and_bookmark(here / 'sample_field.docx')}")
```

- [ ] **Step 2: 픽스처 빌더 smoke-test**

Run: `cd backend && uv run --no-project --python .venv/bin/python tests/fixtures/build_field_sample.py`
Expected: `wrote .../sample_field.docx`. 파일 크기 > 5 KB. 다시 열어 (`Document(...)`) 예외 없이 로드되어야 한다.

- [ ] **Step 3: 검출 모듈 — 실패 테스트 작성 `backend/tests/test_extract_field.py`**

```python
"""extract_field 단위 테스트."""

from pathlib import Path

from docx import Document

from app.parser.extract_field import (
    clone_paragraph_xml,
    detect_field_kind,
    extract_bookmarks,
    extract_field_preview,
    paragraph_has_bookmark,
    paragraph_has_field,
)
from tests.fixtures.build_field_sample import build_sample_with_field_and_bookmark


def _load(tmp_path: Path):
    p = tmp_path / "f.docx"
    build_sample_with_field_and_bookmark(p)
    return Document(str(p))


def test_paragraph_has_field_distinguishes_field_paragraphs(tmp_path):
    doc = _load(tmp_path)
    paragraphs = list(doc.paragraphs)
    # H1 (no field), TOC (complex field), body (simple REF)
    assert paragraph_has_field(paragraphs[0]) is False
    assert paragraph_has_field(paragraphs[1]) is True
    assert paragraph_has_field(paragraphs[2]) is True


def test_paragraph_has_bookmark_finds_bookmark_on_heading(tmp_path):
    doc = _load(tmp_path)
    paragraphs = list(doc.paragraphs)
    assert paragraph_has_bookmark(paragraphs[0]) is True
    assert paragraph_has_bookmark(paragraphs[1]) is False
    assert paragraph_has_bookmark(paragraphs[2]) is False


def test_detect_field_kind_identifies_toc_and_ref(tmp_path):
    doc = _load(tmp_path)
    paragraphs = list(doc.paragraphs)
    assert detect_field_kind(paragraphs[1]) == "toc"
    assert detect_field_kind(paragraphs[2]) == "ref"
    assert detect_field_kind(paragraphs[0]) is None


def test_extract_field_preview_returns_display_text(tmp_path):
    doc = _load(tmp_path)
    paragraphs = list(doc.paragraphs)
    # TOC complex field display
    assert "목차" in (extract_field_preview(paragraphs[1]) or "")
    # body has REF inside surrounding text
    preview = extract_field_preview(paragraphs[2]) or ""
    assert "개요" in preview


def test_extract_bookmarks_returns_name_and_id(tmp_path):
    doc = _load(tmp_path)
    paragraphs = list(doc.paragraphs)
    bms = extract_bookmarks(paragraphs[0])
    assert len(bms) == 1
    assert bms[0]["name"] == "_Ref100001"
    assert bms[0]["id"] == "1"
    assert extract_bookmarks(paragraphs[2]) == []


def test_clone_paragraph_xml_returns_self_contained_bytes(tmp_path):
    doc = _load(tmp_path)
    paragraphs = list(doc.paragraphs)
    xml = clone_paragraph_xml(paragraphs[1])
    assert isinstance(xml, bytes)
    assert b"<w:p" in xml and b"</w:p>" in xml
    assert b"fldChar" in xml or b"instrText" in xml
```

- [ ] **Step 4: 테스트 실패 확인**

Run: `cd backend && PYTHONPATH=. uv run --no-project --python .venv/bin/python -m pytest tests/test_extract_field.py -v`
Expected: `ModuleNotFoundError: app.parser.extract_field`

- [ ] **Step 5: `backend/app/parser/extract_field.py` 구현**

```python
"""필드(<w:fldSimple>, <w:fldChar>) 와 북마크(<w:bookmark*>) 검출 + 미리보기 추출."""

from copy import deepcopy
from typing import Literal

from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph
from lxml import etree

FieldKind = Literal["toc", "ref", "pageref", "unknown"]


def paragraph_has_field(paragraph: Paragraph) -> bool:
    p_el = paragraph._p
    if p_el.find(f".//{qn('w:fldSimple')}") is not None:
        return True
    if p_el.find(f".//{qn('w:fldChar')}") is not None:
        return True
    return False


def paragraph_has_bookmark(paragraph: Paragraph) -> bool:
    p_el = paragraph._p
    return p_el.find(f".//{qn('w:bookmarkStart')}") is not None


def _instr_texts(paragraph: Paragraph) -> list[str]:
    """fldSimple@w:instr 와 instrText 본문을 모두 모은다."""
    p_el = paragraph._p
    out: list[str] = []
    for fs in p_el.findall(f".//{qn('w:fldSimple')}"):
        instr = fs.get(qn("w:instr"))
        if instr:
            out.append(instr)
    for it in p_el.findall(f".//{qn('w:instrText')}"):
        if it.text:
            out.append(it.text)
    return out


def detect_field_kind(paragraph: Paragraph) -> FieldKind | None:
    if not paragraph_has_field(paragraph):
        return None
    for instr in _instr_texts(paragraph):
        head = instr.strip().split()[0].upper() if instr.strip() else ""
        if head == "TOC":
            return "toc"
        if head == "PAGEREF":
            return "pageref"
        if head == "REF":
            return "ref"
    return "unknown"


def extract_field_preview(paragraph: Paragraph) -> str | None:
    """필드 표시 텍스트 — 사용자에게 보여줄 한 줄 미리보기."""
    if not paragraph_has_field(paragraph):
        return None
    text = paragraph.text.strip()
    return text or None


def extract_bookmarks(paragraph: Paragraph) -> list[dict[str, str]]:
    """문단의 bookmarkStart 들을 [{id, name}, ...] 로 반환."""
    p_el = paragraph._p
    out: list[dict[str, str]] = []
    for bm in p_el.findall(f".//{qn('w:bookmarkStart')}"):
        bm_id = bm.get(qn("w:id")) or ""
        name = bm.get(qn("w:name")) or ""
        out.append({"id": bm_id, "name": name})
    return out


def clone_paragraph_xml(paragraph: Paragraph) -> bytes:
    """문단 <w:p> 를 deepcopy 해 standalone XML 바이트로 직렬화."""
    el = deepcopy(paragraph._p)
    return etree.tostring(el, xml_declaration=False, encoding="utf-8")
```

- [ ] **Step 6: 검출 테스트 통과 확인**

Run: `cd backend && PYTHONPATH=. uv run --no-project --python .venv/bin/python -m pytest tests/test_extract_field.py -v`
Expected: 6 passed.

- [ ] **Step 7: ruff + 커밋**

Run: `cd backend && uv run --no-project --python .venv/bin/python -m ruff check app/parser/extract_field.py tests/test_extract_field.py tests/fixtures/build_field_sample.py && uv run --no-project --python .venv/bin/python -m ruff format --check app/parser/extract_field.py tests/test_extract_field.py tests/fixtures/build_field_sample.py`

```bash
git add backend/app/parser/extract_field.py backend/tests/test_extract_field.py \
        backend/tests/fixtures/build_field_sample.py
git commit -m "feat(parser): field/bookmark detection module (Phase 4)"
```

---

### Task 2: parse_docx 통합 — 필드/북마크 문단 raw_xml_ref 보존

**Files:**
- Modify: `backend/app/parser/parse_docx.py`
- Modify: `backend/tests/test_parse.py` (Phase 4 통합 테스트 append)

**Why:** 파서가 필드/북마크 문단을 만나면 OOXML 을 디스크에 저장하고 Block 에 메타를 남긴다. 본문 텍스트(`block.text`) 는 그대로 살려둬서 에디터에서 읽을 수 있게 함.

- [ ] **Step 1: parse 통합 실패 테스트 추가**

`backend/tests/test_parse.py` 끝에 append:

```python
"""Phase 4 — 필드/북마크 보존 검증."""
import uuid as _uuid

from app.parser.parse_docx import parse_docx as _parse
from tests.fixtures.build_field_sample import build_sample_with_field_and_bookmark


def test_parse_docx_phase4_preserves_field_and_bookmark_paragraphs(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    src = tmp_path / "f.docx"
    build_sample_with_field_and_bookmark(src)
    user_id = _uuid.uuid4()
    job_id = _uuid.uuid4()
    outline = _parse(src.read_bytes(), filename="f.docx", user_id=user_id, job_id=job_id)

    paragraphs = [b for b in outline.blocks if b.kind == "paragraph"]
    # H1 with bookmark
    h1 = next(b for b in paragraphs if b.text and b.text.strip() == "개요")
    assert h1.raw_xml_ref is not None and h1.raw_xml_ref.startswith("field-")
    assert h1.field_kind is None  # bookmark only, no field

    # TOC paragraph
    toc = next(b for b in paragraphs if b.field_kind == "toc")
    assert toc.raw_xml_ref is not None
    assert toc.preview_text and "목차" in toc.preview_text

    # REF body paragraph
    ref = next(b for b in paragraphs if b.field_kind == "ref")
    assert ref.raw_xml_ref is not None
    assert ref.preview_text and "개요" in ref.preview_text

    # disk presence
    raw_dir = tmp_path / "docs" / str(user_id) / str(job_id) / "raw"
    saved = sorted(raw_dir.glob("field-*.xml"))
    assert len(saved) == 3  # h1 + toc + ref


def test_parse_docx_phase4_no_field_no_save(tmp_path, monkeypatch):
    """필드/북마크 없는 문서는 raw_xml_ref 가 비어 있어야 한다."""
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    from docx import Document

    p = tmp_path / "plain.docx"
    doc = Document()
    doc.add_paragraph("그냥 텍스트")
    doc.save(str(p))

    user_id = _uuid.uuid4()
    job_id = _uuid.uuid4()
    outline = _parse(p.read_bytes(), filename="plain.docx", user_id=user_id, job_id=job_id)
    for b in outline.blocks:
        if b.kind == "paragraph":
            assert b.raw_xml_ref is None
            assert b.field_kind is None
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && PYTHONPATH=. uv run --no-project --python .venv/bin/python -m pytest tests/test_parse.py::test_parse_docx_phase4_preserves_field_and_bookmark_paragraphs tests/test_parse.py::test_parse_docx_phase4_no_field_no_save -v`
Expected: 두 테스트 FAIL (raw_xml_ref 가 채워지지 않음).

- [ ] **Step 3: parse_docx 수정**

`backend/app/parser/parse_docx.py` 의 import 블록에 추가:

```python
from app.parser.extract_field import (
    clone_paragraph_xml,
    detect_field_kind,
    extract_field_preview,
    paragraph_has_bookmark,
    paragraph_has_field,
)
```

`parse_docx` 함수 안의 plain-paragraph 블록 생성부 (기존 `level, detected_by = detect_level(...)` ~ `blocks.append(Block(...))`) 두 군데 (이미지 fallback 분기 + 일반 paragraph 분기) 를 다음과 같이 갱신.

기존 (대표 케이스):
```python
level, detected_by = detect_level(item, paragraph_index=para_idx)
para_idx += 1
blocks.append(
    Block(
        id=_new_id(),
        kind="paragraph",
        level=level,
        text=item.text,
        detected_by=detected_by,
        alignment=_extract_alignment(item),
    )
)
```

→

```python
level, detected_by = detect_level(item, paragraph_index=para_idx)
para_idx += 1
field_kind = detect_field_kind(item)
has_marker = paragraph_has_field(item) or paragraph_has_bookmark(item)
raw_xml_ref: str | None = None
preview_text: str | None = None
if has_marker and user_id is not None and job_id is not None:
    raw_xml_ref = f"field-{para_idx - 1}"
    raw_ooxml_path(user_id, job_id, raw_xml_ref).write_bytes(clone_paragraph_xml(item))
    preview_text = extract_field_preview(item)
blocks.append(
    Block(
        id=_new_id(),
        kind="paragraph",
        level=level,
        text=item.text,
        detected_by=detected_by,
        alignment=_extract_alignment(item),
        raw_xml_ref=raw_xml_ref,
        field_kind=field_kind,
        preview_text=preview_text,
    )
)
```

이 패턴을 두 곳 (image fallthrough 안의 plain paragraph emission, 그리고 isinstance(Paragraph) 의 일반 분기) 모두에 적용한다.

`Block` 모델 (`backend/app/domain/outline.py`) 은 이미 `raw_xml_ref`, `field_kind`, `preview_text` 가 정의돼 있으니 추가 변경 불필요.

- [ ] **Step 4: 통합 + 회귀 테스트 통과 확인**

Run: `cd backend && PYTHONPATH=. uv run --no-project --python .venv/bin/python -m pytest tests/test_parse.py tests/test_extract_field.py tests/test_extract_table.py tests/test_extract_image.py tests/test_extract_caption.py -v`
Expected: 모두 PASS (Phase 3 회귀 없음 + 새 2개 PASS).

- [ ] **Step 5: ruff + 커밋**

Run: `cd backend && uv run --no-project --python .venv/bin/python -m ruff check app/parser/parse_docx.py tests/test_parse.py && uv run --no-project --python .venv/bin/python -m ruff format --check app/parser/parse_docx.py tests/test_parse.py`

```bash
git add backend/app/parser/parse_docx.py backend/tests/test_parse.py
git commit -m "feat(parser): preserve field/bookmark paragraphs via raw_xml_ref (Phase 4)"
```

---

### Task 3: 렌더러 — paragraph 재삽입 (필드 보존 경로)

**Files:**
- Modify: `backend/app/renderer/reembed_raw.py`
- Modify: `backend/app/renderer/render_docx.py`
- Create: `backend/tests/test_render_field.py`

**Why:** Phase 3 의 `reembed_table` 와 짝을 이루는 paragraph 버전. paragraph 블록에 `raw_xml_ref` 가 있으면 디스크의 원본 `<w:p>` 를 그대로 본문에 삽입한다 (run/필드/북마크 보존). 스타일은 원본 유지 — 필드 경로의 trade-off 로 spec 에 명시.

- [ ] **Step 1: 실패 테스트 작성 `backend/tests/test_render_field.py`**

```python
"""필드 보존 paragraph reembed 단위 테스트."""

import io
import uuid

from docx import Document
from docx.oxml.ns import qn

from app.parser.parse_docx import parse_docx
from app.renderer.render_docx import render_docx
from tests.fixtures.build_field_sample import build_sample_with_field_and_bookmark


def _spec():
    from tests.test_render import _load_default_spec
    return _load_default_spec()


def test_render_preserves_toc_field(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    src = tmp_path / "f.docx"
    build_sample_with_field_and_bookmark(src)
    user_id = uuid.uuid4()
    job_id = uuid.uuid4()
    outline = parse_docx(src.read_bytes(), filename="f.docx", user_id=user_id, job_id=job_id)
    out_bytes = render_docx(outline, _spec(), user_id=user_id, job_id=job_id)
    out_doc = Document(io.BytesIO(out_bytes))

    # TOC complex field's <w:fldChar> must survive
    fldchars = out_doc.element.body.findall(f".//{qn('w:fldChar')}")
    assert len(fldchars) >= 2  # at least begin + end


def test_render_preserves_simple_ref_field(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    src = tmp_path / "f.docx"
    build_sample_with_field_and_bookmark(src)
    user_id = uuid.uuid4()
    job_id = uuid.uuid4()
    outline = parse_docx(src.read_bytes(), filename="f.docx", user_id=user_id, job_id=job_id)
    out_bytes = render_docx(outline, _spec(), user_id=user_id, job_id=job_id)
    out_doc = Document(io.BytesIO(out_bytes))

    fld_simples = out_doc.element.body.findall(f".//{qn('w:fldSimple')}")
    assert len(fld_simples) >= 1
    assert "REF" in (fld_simples[0].get(qn("w:instr")) or "")


def test_render_preserves_bookmarks_on_heading(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    src = tmp_path / "f.docx"
    build_sample_with_field_and_bookmark(src)
    user_id = uuid.uuid4()
    job_id = uuid.uuid4()
    outline = parse_docx(src.read_bytes(), filename="f.docx", user_id=user_id, job_id=job_id)
    out_bytes = render_docx(outline, _spec(), user_id=user_id, job_id=job_id)
    out_doc = Document(io.BytesIO(out_bytes))

    bm_starts = out_doc.element.body.findall(f".//{qn('w:bookmarkStart')}")
    names = [b.get(qn("w:name")) for b in bm_starts]
    assert "_Ref100001" in names
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && PYTHONPATH=. uv run --no-project --python .venv/bin/python -m pytest tests/test_render_field.py -v`
Expected: 모두 FAIL — render_docx 가 paragraph 의 raw_xml_ref 를 무시하고 새 paragraph 만 emit 함.

- [ ] **Step 3: `reembed_raw.py` 에 paragraph 재삽입 함수 추가**

`backend/app/renderer/reembed_raw.py` 끝에 append (`reembed_table` 옆):

```python
def reembed_paragraph(
    doc: DocxDocument,
    *,
    raw_ref: str,
    user_id: uuid.UUID,
    job_id: uuid.UUID,
) -> None:
    """디스크의 원본 <w:p> 를 본문에 그대로 삽입.

    runs / 필드 / 북마크 / 기존 스타일을 모두 보존한다 (Phase 4).
    """
    p = raw_ooxml_path(user_id, job_id, raw_ref)
    if not p.exists():
        doc.add_paragraph(f"[원본 누락 — {raw_ref}]")
        return
    try:
        p_el = _parse_fragment(p.read_bytes())
        doc.element.body.append(p_el)
    except (etree.XMLSyntaxError, IndexError):
        doc.add_paragraph(f"[원본 누락 — {raw_ref}]")
```

- [ ] **Step 4: `render_docx.py` 에서 paragraph 분기 갱신**

`backend/app/renderer/render_docx.py` 의 import 추가:

```python
from app.renderer.reembed_raw import reembed_paragraph, reembed_table
```

`render_docx` 의 paragraph 처리 분기 — 기존:
```python
if b.kind == "paragraph":
    _add_paragraph_block(doc, b, spec)
    continue
```

로 변경:
```python
if b.kind == "paragraph":
    if b.raw_xml_ref and user_id is not None and job_id is not None:
        reembed_paragraph(doc, raw_ref=b.raw_xml_ref, user_id=user_id, job_id=job_id)
    else:
        _add_paragraph_block(doc, b, spec)
    continue
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd backend && PYTHONPATH=. uv run --no-project --python .venv/bin/python -m pytest tests/test_render_field.py tests/test_render.py tests/test_render_reembed.py -v`
Expected: 모두 PASS.

- [ ] **Step 6: 회귀 확인**

Run: `cd backend && PYTHONPATH=. uv run --no-project --python .venv/bin/python -m pytest tests/test_parse.py tests/test_extract_field.py tests/test_extract_table.py tests/test_extract_image.py tests/test_extract_caption.py tests/test_storage.py tests/test_detect_heading.py -v`

- [ ] **Step 7: ruff + 커밋**

```bash
cd backend && uv run --no-project --python .venv/bin/python -m ruff check app/renderer/reembed_raw.py app/renderer/render_docx.py tests/test_render_field.py && uv run --no-project --python .venv/bin/python -m ruff format --check app/renderer/reembed_raw.py app/renderer/render_docx.py tests/test_render_field.py
```

```bash
git add backend/app/renderer/reembed_raw.py backend/app/renderer/render_docx.py backend/tests/test_render_field.py
git commit -m "feat(renderer): reembed paragraphs with fields/bookmarks (Phase 4)"
```

---

### Task 4: 라운드트립 무결성 — TOC + REF 의 instr 보존 검증

**Files:**
- Modify: `backend/tests/test_render_field.py` (추가 케이스)

**Why:** Task 3 는 `<w:fldChar>` / `<w:fldSimple>` 노드 존재만 검증한다. TOC 의 `\* MERGEFORMAT` / `\h \z \u` 같은 instruction 코드와 북마크의 `w:id` 정합성도 보존됐는지 한번 더 못 박는다.

- [ ] **Step 1: 추가 테스트 — 같은 파일에 append**

```python
def test_render_preserves_toc_instr_text(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    src = tmp_path / "f.docx"
    build_sample_with_field_and_bookmark(src)
    user_id = uuid.uuid4()
    job_id = uuid.uuid4()
    outline = parse_docx(src.read_bytes(), filename="f.docx", user_id=user_id, job_id=job_id)
    out_bytes = render_docx(outline, _spec(), user_id=user_id, job_id=job_id)
    out_doc = Document(io.BytesIO(out_bytes))

    instr_texts = [it.text or "" for it in out_doc.element.body.findall(f".//{qn('w:instrText')}")]
    assert any("TOC" in t for t in instr_texts)


def test_render_preserves_bookmark_id_pairing(tmp_path, monkeypatch):
    """bookmarkStart 와 bookmarkEnd 가 같은 w:id 로 짝지어져 있어야 한다."""
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    src = tmp_path / "f.docx"
    build_sample_with_field_and_bookmark(src)
    user_id = uuid.uuid4()
    job_id = uuid.uuid4()
    outline = parse_docx(src.read_bytes(), filename="f.docx", user_id=user_id, job_id=job_id)
    out_bytes = render_docx(outline, _spec(), user_id=user_id, job_id=job_id)
    out_doc = Document(io.BytesIO(out_bytes))

    starts = out_doc.element.body.findall(f".//{qn('w:bookmarkStart')}")
    ends = out_doc.element.body.findall(f".//{qn('w:bookmarkEnd')}")
    start_ids = {b.get(qn("w:id")) for b in starts}
    end_ids = {b.get(qn("w:id")) for b in ends}
    assert "1" in start_ids
    assert start_ids.issubset(end_ids)
```

- [ ] **Step 2: 테스트 통과 확인**

Run: `cd backend && PYTHONPATH=. uv run --no-project --python .venv/bin/python -m pytest tests/test_render_field.py -v`
Expected: 5 passed (3 from Task 3 + 2 new).

- [ ] **Step 3: 커밋**

```bash
git add backend/tests/test_render_field.py
git commit -m "test(renderer): assert TOC instr + bookmark id pairing survive render"
```

---

### Task 5: 프론트 — 필드 배지 + 요약

**Files:**
- Modify: `frontend/lib/types.ts`
- Modify: `frontend/components/outline-editor/ParagraphBlock.tsx`
- Modify: `frontend/components/outline-editor/OutlineEditor.tsx`

**Why:** 사용자가 "이 문단은 원본 OOXML 그대로 보존됨" 을 시각적으로 알도록 작은 배지를 붙이고, 에디터 상단에 전체 보존 카운트를 보여준다. spec 에 "필드 N개 보존, M개 검토 필요" 가 명시돼 있으므로 unknown 종류는 검토 필요로 분류.

- [ ] **Step 1: `frontend/lib/types.ts` 의 Block 인터페이스 보강**

기존:
```ts
export interface Block {
  id: string;
  kind: BlockKind;
  level: number;
  text?: string | null;
  detected_by?: DetectedBy | null;
  markdown?: string | null;
  preview_url?: string | null;
  caption?: string | null;
  raw_ref?: string | null;
  field_kind?: string | null;
  preview_text?: string | null;
}
```

→ `raw_xml_ref` 추가:
```ts
export interface Block {
  id: string;
  kind: BlockKind;
  level: number;
  text?: string | null;
  detected_by?: DetectedBy | null;
  markdown?: string | null;
  preview_url?: string | null;
  caption?: string | null;
  raw_ref?: string | null;
  raw_xml_ref?: string | null;
  field_kind?: "toc" | "ref" | "pageref" | "unknown" | null;
  preview_text?: string | null;
}
```

- [ ] **Step 2: `ParagraphBlock.tsx` 에 배지 추가**

`block.raw_xml_ref` 가 있으면 작은 회색 배지를 붙인다. 문단 헤더 옆 (level 라벨 옆) 에 위치.

`ParagraphBlock.tsx` 의 H/본문 라벨 `<span>` 다음에 (같은 flex row 안):

```tsx
{block.raw_xml_ref ? (
  <span
    title={
      block.field_kind
        ? `필드 보존: ${block.field_kind.toUpperCase()}`
        : "북마크/원본 OOXML 보존"
    }
    className="mr-1 inline-flex items-center rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium text-text-muted"
  >
    📎
    {block.field_kind === "unknown" ? " ?" : ""}
  </span>
) : null}
```

- [ ] **Step 3: `OutlineEditor.tsx` 상단에 요약 추가**

기존 `<div className="space-y-2">` 의 첫 자식 status row 위에 새 div 한 줄 추가 — `outline.blocks` 에서 `raw_xml_ref` 가진 paragraph 수를 세고, `field_kind === "unknown"` 도 분리.

`OutlineEditor.tsx` 본문 안, `const count = selected.size;` 다음에:

```tsx
const preserved = outline.blocks.filter(
  (b) => b.kind === "paragraph" && b.raw_xml_ref,
);
const reviewable = preserved.filter((b) => b.field_kind === "unknown").length;
const preservedTotal = preserved.length;
```

그리고 return 의 `<div className="space-y-2">` 첫 자식으로 (기존 status row 위에) 다음 추가:

```tsx
{preservedTotal > 0 ? (
  <div className="flex items-center gap-2 rounded-token border border-border/60 bg-surface px-3 py-1.5 text-xs text-text-muted">
    <span>📎</span>
    <span>
      필드/북마크 <span className="font-medium text-text">{preservedTotal}개</span> 보존됨
      {reviewable > 0 ? (
        <>
          {" · "}
          <span className="font-medium text-warning">{reviewable}개 검토 필요</span>
        </>
      ) : null}
    </span>
  </div>
) : null}
```

- [ ] **Step 4: lint + tsc**

```
cd frontend && npm run lint
cd frontend && npx tsc --noEmit
```
Expected: lint 클린 (사전 경고 2개 허용), tsc 클린.

- [ ] **Step 5: 커밋**

```bash
git add frontend/lib/types.ts frontend/components/outline-editor/ParagraphBlock.tsx frontend/components/outline-editor/OutlineEditor.tsx
git commit -m "feat(ui): show preserved-field badge + summary (Phase 4)"
```

---

### Task 6: jobs/upload+render delete 정합 + 통합 회귀

**Files:**
- (검토만, 변경 없을 수도 있음) `backend/app/api/jobs.py`

**Why:** Phase 3 에서 delete_job 이 `<jobdir>/raw/` 를 통째로 지운다. Phase 4 의 `field-N.xml` 도 같은 폴더에 들어가므로 별도 변경 불필요. 그래도 한 번 검증.

- [ ] **Step 1: delete_job 코드 재확인**

Read `backend/app/api/jobs.py` — `delete_job` 안의 `raw_dir = job_dir(user.id, job.id) / "raw"` `shutil.rmtree(raw_dir)` 가 그대로 있는지 확인. 변경 불필요하면 노트만 남기고 다음으로.

- [ ] **Step 2: 백엔드 전체 단위 테스트 회귀 한 번**

Run: `cd backend && PYTHONPATH=. uv run --no-project --python .venv/bin/python -m pytest tests/test_parse.py tests/test_render.py tests/test_render_reembed.py tests/test_render_field.py tests/test_extract_table.py tests/test_extract_image.py tests/test_extract_caption.py tests/test_extract_field.py tests/test_storage.py tests/test_detect_heading.py -v`

Expected: 모두 PASS.

- [ ] **Step 3: ruff full**

```
cd backend && uv run --no-project --python .venv/bin/python -m ruff check app/ tests/test_extract_field.py tests/test_render_field.py tests/test_parse.py tests/fixtures/build_field_sample.py
```
타 파일의 사전 lint 이슈는 무시 (Phase 3 에서 확인된 baseline).

- [ ] **Step 4: 커밋 (변경 없으면 skip)** — 단순 검증 task 이므로 수정 사항 있을 때만 커밋.

---

### Task 7: spec 문서 업데이트

**Files:**
- Modify: `docs/superpowers/specs/2026-04-26-word-templator-design.md`

**Why:** 다음 단계 진입 시 Phase 4 의 결정·trade-off 가 컨텍스트로 남아야 한다.

- [ ] **Step 1: spec 끝에 append**

```markdown

## Phase 4 완료 검증 — 2026-04-27

- 필드 검출 — `<w:fldSimple>` + `<w:fldChar>` 영역, instr 코드로 종류(toc/ref/pageref/unknown) 분류 (`extract_field.detect_field_kind`)
- 북마크 검출 — `<w:bookmarkStart>` 위치 + name/id 매핑 (`extract_field.extract_bookmarks`)
- 필드/북마크가 있는 문단은 통째로 OOXML 보존 (`raw_xml_ref="field-N"`) — runs / fields / bookmarks 모두 그대로
- 렌더 시 paragraph 의 `raw_xml_ref` 가 있으면 새 paragraph 생성 대신 원본 `<w:p>` 그대로 본문에 삽입 (`reembed_paragraph`)
- TOC 의 `\* MERGEFORMAT` 등 instr text + 북마크 `w:id` 페어링 보존 — 라운드트립 테스트 PASS
- 프론트: 보존된 문단에 `📎` 배지, 에디터 상단에 "필드/북마크 N개 보존됨, M개 검토 필요" 요약

알려진 한계 (Phase 5 에서 해결할 후보):
- 필드 보존 문단은 **원본 스타일이 그대로 유지** — 새 StyleSpec 의 헤딩 폰트/사이즈가 적용되지 않음. trade-off 로 수용.
- 북마크만 있고 필드 없는 헤딩 문단도 동일하게 원본 보존 — 향후 "북마크만 추출해 새 헤딩에 주입" 으로 개선 가능
- IF/SEQ 같은 중첩 필드는 best-effort: 원본 OOXML 그대로 보존되므로 깨지지 않지만 분류는 `unknown` (UI 에서 검토 필요로 표시)
```

- [ ] **Step 2: 커밋**

```bash
git add docs/superpowers/specs/2026-04-26-word-templator-design.md
git commit -m "docs: Phase 4 (relative references) completion log"
```

---

## Self-Review

### Spec coverage

| Spec 요구 | 처리한 Task |
|---|---|
| `lxml`로 `<w:fldChar>` 영역 보존 | Task 1 (감지) + Task 2 (저장) |
| 북마크 ↔ outline block 매핑 | Task 1 (`extract_bookmarks`) + Task 2 (raw_xml_ref 보존으로 자연스럽게 위치 보존) |
| TOC 자동 갱신 플래그 유지 | Task 3 (전체 OOXML reembed) + Task 4 (instr 텍스트 검증) |
| UI에 "필드 N개 보존, M개 검토 필요" 표시 | Task 5 (배지 + 요약) |
| 복잡 케이스(IF/SEQ 중첩) best-effort | `detect_field_kind` 가 unknown 으로 분류, OOXML reembed 로 깨지지 않음 |

### Placeholder scan
TBD/TODO 없음. 모든 단계에 코드/명령 명시.

### Type consistency
- `paragraph_has_field(p) -> bool`, `paragraph_has_bookmark(p) -> bool`, `detect_field_kind(p) -> FieldKind | None`, `extract_field_preview(p) -> str | None`, `extract_bookmarks(p) -> list[dict[str, str]]`, `clone_paragraph_xml(p) -> bytes` — Task 1 ↔ Task 2 일치.
- `reembed_paragraph(doc, *, raw_ref, user_id, job_id) -> None` — Task 3 내부 일치, Task 3 의 render_docx 호출과 시그너처 일치.
- `Block.raw_xml_ref`, `Block.field_kind`, `Block.preview_text` — domain/outline.py 에 이미 정의된 필드 사용, 추가 변경 없음.
- 프론트 `Block.field_kind` 를 `"toc" | "ref" | "pageref" | "unknown" | null` 로 좁힘 — Task 5.
