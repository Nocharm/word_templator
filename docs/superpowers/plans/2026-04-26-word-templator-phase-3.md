# Word Templator Phase 3 Implementation Plan — 표 / 이미지 / 캡션

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 업로드한 `.docx`의 표는 마크다운으로 미리보기 + 원본 OOXML을 보존해 다시 렌더, 이미지는 추출해 호버 미리보기 가능, 표/이미지 직전·직후의 캡션 문단을 자동 인식해 블록에 부착한다.

**Architecture:**
1. 파서가 본문을 순회하며 `w:tbl` → 마크다운 변환 + OOXML clone 디스크 저장(`raw_ref="table-N"`), `w:drawing` 포함 문단 → 이미지 바이너리 추출 + `raw_ref="image-N"`. 캡션 휴리스틱은 인접 문단(`표 N.`/`그림 N.`/`Table N.`/`Figure N.`)을 검사하여 흡수.
2. 렌더러는 `raw_ref`가 있는 블록을 만나면 디스크에서 OOXML 조각을 읽어 `body`에 그대로 재삽입. 표 스타일은 별도 `apply_table_style`이 보더·헤더·셀 폰트만 덮어쓰고, 이미지 블록은 placeholder 문단(추후 재삽입은 OOXML clone로 보존). 새 이미지 미리보기 라우트는 `/api/jobs/{id}/images/{idx}`.
3. 프론트는 `TableBlock`을 react-markdown + remark-gfm 으로 렌더, `ImageBlock`은 호버 시 `<img>`를 보여주고 캡션을 같은 카드에 표시.

**Tech Stack:** python-docx, lxml, FastAPI `FileResponse`, Pydantic v2, Next.js 15 App Router, react-markdown 9 + remark-gfm 4, Tailwind 3.

---

## File Structure

### Backend (create / modify)

| 경로 | 책임 | 신규/수정 |
|---|---|---|
| `backend/app/parser/extract_table.py` | `<w:tbl>` → markdown 문자열, OOXML clone bytes | **Create** |
| `backend/app/parser/extract_image.py` | `<w:drawing>` 안 `r:embed` → 이미지 추출, 컨텐트 타입 추정 | **Create** |
| `backend/app/parser/extract_caption.py` | 표/이미지 직전·직후 문단에서 캡션 흡수 | **Create** |
| `backend/app/parser/parse_docx.py` | 새 추출기 호출, `Block.markdown/raw_ref/caption/preview_url` 채움 | **Modify** |
| `backend/app/storage/files.py` | `raw_ooxml_path`, `image_path`, `image_dir` 헬퍼 추가 | **Modify** |
| `backend/app/renderer/reembed_raw.py` | 디스크의 OOXML 조각을 `body`에 재삽입, 표 스타일만 덮어씀 | **Create** |
| `backend/app/renderer/apply_table_style.py` | `StyleSpec.table` → `<w:tbl>` 보더/헤더/셀 폰트 패치 | **Create** |
| `backend/app/renderer/render_docx.py` | `raw_ref` 있는 블록은 reembed로 분기, placeholder 텍스트 제거 | **Modify** |
| `backend/app/api/images.py` | `GET /jobs/{id}/images/{idx}` (FileResponse) | **Create** |
| `backend/app/main.py` | 새 images 라우터 등록 | **Modify** |
| `backend/app/api/jobs.py` | upload 시 이미지/OOXML이 채워지므로 변동 없음, 단 cleanup에서 파일 삭제 추가 | **Modify** |
| `backend/tests/fixtures/build_table_image_sample.py` | 표 1개 + 이미지 1개 + 캡션 포함 .docx 생성 | **Create** |
| `backend/tests/test_extract_table.py` | 마크다운 변환 + 병합셀/중첩 단위 테스트 | **Create** |
| `backend/tests/test_extract_image.py` | 이미지 디스크 저장, 컨텐트 타입 단위 테스트 | **Create** |
| `backend/tests/test_extract_caption.py` | 캡션 휴리스틱 단위 테스트 | **Create** |
| `backend/tests/test_render_reembed.py` | 표 스타일 오버라이드 + 이미지 placeholder | **Create** |
| `backend/tests/test_api_images.py` | `GET /jobs/{id}/images/{idx}` E2E (200/404) | **Create** |

### Frontend (modify)

| 경로 | 책임 | 신규/수정 |
|---|---|---|
| `frontend/lib/types.ts` | `Block.preview_url`, `Block.markdown` 타입 정확화 (이미 존재 — 변경 없음) | (확인만) |
| `frontend/components/outline-editor/TableBlock.tsx` | react-markdown + remark-gfm 으로 표 렌더, 캡션 표시 | **Modify** |
| `frontend/components/outline-editor/ImageBlock.tsx` | placeholder + hover 시 `<img>` 토글, 캡션 표시 | **Modify** |
| `frontend/package.json` | (이미 react-markdown / remark-gfm 보유 — 변경 없음) | (확인만) |

---

## 작업 순서 원칙

- **백엔드 → 프론트엔드 → 통합 검증** (Phase 1/2 동일 패턴)
- 표 마크다운 변환 / 이미지 추출 / 캡션 흡수는 서로 독립이므로 Task 1·2·3 분리
- 렌더러 reembed는 추출 결과를 디스크에 갖다 둔 뒤에만 의미가 있으므로 Task 4·5는 추출 이후
- API/프론트는 마지막에 묶어 통합

---

### Task 1: 표 → 마크다운 + OOXML clone 추출

**Files:**
- Create: `backend/app/parser/extract_table.py`
- Modify: `backend/app/storage/files.py` (`raw_ooxml_path` 헬퍼 추가)
- Test: `backend/tests/test_extract_table.py`
- Fixture: `backend/tests/fixtures/build_table_image_sample.py` (표 부분만 우선)

**Why this task:** 표는 사용자에게 마크다운으로 보여주되, 렌더 시 원본 OOXML 그대로 다시 끼워넣어야 한다(R4). 마크다운 함수는 텍스트만 책임지고, OOXML은 별도 clone 함수가 책임진다. 두 함수의 입력은 모두 `docx.table.Table`.

- [ ] **Step 1: storage 헬퍼 — `raw_ooxml_path`, `image_dir`, `image_path` 추가**

```python
# backend/app/storage/files.py — 기존 헬퍼 아래에 append
def raw_ooxml_path(user_id: uuid.UUID, job_id: uuid.UUID, raw_ref: str) -> Path:
    """
    raw_ref 예: 'table-0'. 원본 <w:tbl>/기타 OOXML 조각을 .xml 로 저장.
    """
    d = job_dir(user_id, job_id) / "raw"
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{raw_ref}.xml"


def image_dir(job_id: uuid.UUID) -> Path:
    d = _data_dir() / "images" / str(job_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def image_path(job_id: uuid.UUID, idx: int, ext: str) -> Path:
    safe_ext = ext.lstrip(".").lower() or "bin"
    return image_dir(job_id) / f"image-{idx}.{safe_ext}"
```

- [ ] **Step 2: storage 단위 테스트에 새 헬퍼 검증 추가**

테스트 파일 `backend/tests/test_storage.py` 가 이미 있으므로 함수 단위 테스트만 추가:

```python
# 기존 test_storage.py 끝에 append
def test_raw_ooxml_path_creates_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    import uuid
    from app.storage.files import raw_ooxml_path

    uid = uuid.uuid4()
    jid = uuid.uuid4()
    p = raw_ooxml_path(uid, jid, "table-0")
    assert p.parent.exists()
    assert p.name == "table-0.xml"


def test_image_path_extension(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    import uuid
    from app.storage.files import image_path

    jid = uuid.uuid4()
    p = image_path(jid, 0, ".PNG")
    assert p.parent.exists()
    assert p.name == "image-0.png"
```

- [ ] **Step 3: storage 테스트 실행 — 통과 확인**

Run: `cd backend && PYTHONPATH=. uv run --python .venv/bin/python -m pytest tests/test_storage.py -v`
Expected: 모든 storage 테스트 PASS (기존 + 추가 2개).

- [ ] **Step 4: 픽스처 — 표/이미지/캡션 포함 .docx 빌더 작성 (표 부분만)**

```python
# backend/tests/fixtures/build_table_image_sample.py
"""표·이미지·캡션이 들어있는 작은 .docx 픽스처 빌더."""

import io
from pathlib import Path

from docx import Document
from docx.shared import Inches


# 가장 작은 PNG (1x1 투명 픽셀). 필요한 곳에서만 사용.
_TINY_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452"
    "0000000100000001080600000001f15c"
    "4889000000017352474200aece1ce900"
    "00000d49444154789c63000100000005"
    "0001a5f645400000000049454e44ae42"
    "60820000"
)


def build_sample_with_table_and_image(out_path: Path) -> Path:
    doc = Document()
    doc.add_paragraph("문서 제목", style="Heading 1")

    # 캡션 — 표 위
    doc.add_paragraph("표 1. 결과 요약")
    tbl = doc.add_table(rows=2, cols=2)
    tbl.cell(0, 0).text = "구분"
    tbl.cell(0, 1).text = "값"
    tbl.cell(1, 0).text = "A"
    tbl.cell(1, 1).text = "10"

    # 본문
    doc.add_paragraph("본문 한 줄.")

    # 이미지 — 캡션은 아래에
    img_io = io.BytesIO(_TINY_PNG)
    doc.add_picture(img_io, width=Inches(1.0))
    doc.add_paragraph("그림 1. 시스템 구조도")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(out_path)
    return out_path


if __name__ == "__main__":
    here = Path(__file__).resolve().parent
    p = build_sample_with_table_and_image(here / "sample_table_image.docx")
    print(f"wrote {p}")
```

- [ ] **Step 5: 픽스처 빌드 실행**

Run: `cd backend && uv run --python .venv/bin/python tests/fixtures/build_table_image_sample.py`
Expected: `wrote .../sample_table_image.docx`. 파일 크기 > 5 KB.

- [ ] **Step 6: 표 마크다운 변환 — 실패 테스트 작성**

```python
# backend/tests/test_extract_table.py
"""extract_table.table_to_markdown / extract_table.clone_table_xml 단위 테스트."""

from pathlib import Path

from docx import Document

from app.parser.extract_table import clone_table_xml, table_to_markdown
from tests.fixtures.build_table_image_sample import build_sample_with_table_and_image


def _load_first_table(tmp_path: Path):
    p = tmp_path / "s.docx"
    build_sample_with_table_and_image(p)
    doc = Document(str(p))
    return doc.tables[0]


def test_table_to_markdown_renders_header_and_rows(tmp_path):
    table = _load_first_table(tmp_path)
    md = table_to_markdown(table)
    lines = md.splitlines()
    assert lines[0] == "| 구분 | 값 |"
    assert lines[1] == "| --- | --- |"
    assert lines[2] == "| A | 10 |"


def test_clone_table_xml_returns_bytes(tmp_path):
    table = _load_first_table(tmp_path)
    xml = clone_table_xml(table)
    assert isinstance(xml, bytes)
    assert b"<w:tbl" in xml
    assert b"</w:tbl>" in xml


def test_table_to_markdown_handles_merged_cell_marker(tmp_path):
    """gridSpan=2 인 셀은 [병합셀] 표시 — 원본은 깨지지 않게 보존만."""
    p = tmp_path / "merged.docx"
    doc = Document()
    tbl = doc.add_table(rows=2, cols=2)
    tbl.cell(0, 0).merge(tbl.cell(0, 1))
    tbl.cell(0, 0).text = "헤더"
    tbl.cell(1, 0).text = "A"
    tbl.cell(1, 1).text = "B"
    doc.save(str(p))

    md = table_to_markdown(Document(str(p)).tables[0])
    assert "[병합셀]" in md
```

- [ ] **Step 7: 테스트 실패 확인**

Run: `cd backend && PYTHONPATH=. uv run --python .venv/bin/python -m pytest tests/test_extract_table.py -v`
Expected: `ImportError` / `ModuleNotFoundError` (`app.parser.extract_table` 없음).

- [ ] **Step 8: extract_table 구현**

```python
# backend/app/parser/extract_table.py
"""<w:tbl> → 마크다운 문자열 + 원본 OOXML clone 바이트 (R4)."""

from copy import deepcopy

from docx.oxml.ns import qn
from docx.table import Table
from lxml import etree


def _is_merged(cell_el) -> bool:
    """gridSpan>1 또는 vMerge 가 continue 인 셀 — 마크다운 표현 한계."""
    tcPr = cell_el.find(qn("w:tcPr"))
    if tcPr is None:
        return False
    grid_span = tcPr.find(qn("w:gridSpan"))
    if grid_span is not None:
        try:
            if int(grid_span.get(qn("w:val"), "1")) > 1:
                return True
        except ValueError:
            pass
    v_merge = tcPr.find(qn("w:vMerge"))
    if v_merge is not None:
        # val='restart' 는 시작 셀이라 OK, val 미지정/'continue' 는 병합 본문
        val = v_merge.get(qn("w:val"))
        if val != "restart":
            return True
    return False


def _cell_text(cell) -> str:
    text = cell.text.strip().replace("\n", " ").replace("|", "\\|")
    return text or " "


def table_to_markdown(table: Table) -> str:
    """python-docx Table → GFM 마크다운 문자열. 병합셀은 [병합셀] 마커.

    `nested table` 도 본문 텍스트만 평탄화 — 원본은 clone_table_xml 가 보존.
    """
    rows = list(table.rows)
    if not rows:
        return ""

    cols = max(len(r.cells) for r in rows)
    matrix: list[list[str]] = []
    for r in rows:
        line: list[str] = []
        for i in range(cols):
            if i < len(r.cells):
                cell = r.cells[i]
                if _is_merged(cell._tc):
                    line.append("[병합셀]")
                else:
                    line.append(_cell_text(cell))
            else:
                line.append(" ")
        matrix.append(line)

    header = "| " + " | ".join(matrix[0]) + " |"
    sep = "| " + " | ".join(["---"] * cols) + " |"
    body = ["| " + " | ".join(row) + " |" for row in matrix[1:]]
    return "\n".join([header, sep, *body])


def clone_table_xml(table: Table) -> bytes:
    """`<w:tbl>` 를 deepcopy 해서 standalone XML 바이트로 직렬화.

    렌더 시 reembed_raw 가 이 바이트를 다시 파싱해 새 docx 본문에 삽입한다.
    """
    el = deepcopy(table._tbl)
    return etree.tostring(el, xml_declaration=False, encoding="utf-8")
```

- [ ] **Step 9: 표 테스트 실행 — 통과 확인**

Run: `cd backend && PYTHONPATH=. uv run --python .venv/bin/python -m pytest tests/test_extract_table.py -v`
Expected: 3 passed.

- [ ] **Step 10: Commit**

```bash
git add backend/app/storage/files.py backend/app/parser/extract_table.py \
        backend/tests/test_extract_table.py backend/tests/test_storage.py \
        backend/tests/fixtures/build_table_image_sample.py
git commit -m "feat(parser): table-to-markdown and OOXML clone extractor (Phase 3)"
```

---

### Task 2: 이미지 추출 — 바이너리 + 컨텐트 타입

**Files:**
- Create: `backend/app/parser/extract_image.py`
- Test: `backend/tests/test_extract_image.py`

**Why this task:** 본문 문단(`<w:p>`)이 `<w:drawing>` 을 포함할 수 있다. 그 안의 `<a:blip r:embed="rIdN"/>` 의 관계 ID로 `doc.part.related_parts[rIdN].blob` 을 꺼내 디스크에 저장해야 프론트가 호버 시 미리볼 수 있다. 이미지 1개당 `(content_type, ext, blob)` 을 반환하고, 저장은 호출자(parse_docx)가 한다 — 추출 함수는 순수 함수.

- [ ] **Step 1: 이미지 추출 — 실패 테스트 작성**

```python
# backend/tests/test_extract_image.py
"""extract_image.iter_image_blobs 단위 테스트."""

from pathlib import Path

from docx import Document
from docx.text.paragraph import Paragraph

from app.parser.extract_image import iter_image_blobs
from tests.fixtures.build_table_image_sample import build_sample_with_table_and_image


def test_iter_image_blobs_returns_png_bytes(tmp_path):
    p = tmp_path / "s.docx"
    build_sample_with_table_and_image(p)
    doc = Document(str(p))

    paragraphs_with_images: list[Paragraph] = []
    for child in doc.element.body.iterchildren():
        if child.tag.endswith("}p"):
            para = Paragraph(child, doc)
            blobs = list(iter_image_blobs(para, doc))
            if blobs:
                paragraphs_with_images.extend(blobs)

    assert len(paragraphs_with_images) == 1
    blob = paragraphs_with_images[0]
    assert blob.content_type.startswith("image/")
    assert blob.ext.lower() in {"png", "jpeg", "jpg"}
    assert blob.data.startswith(b"\x89PNG") or blob.data[:3] == b"\xff\xd8\xff"


def test_iter_image_blobs_empty_paragraph(tmp_path):
    p = tmp_path / "empty.docx"
    doc = Document()
    doc.add_paragraph("그냥 텍스트")
    doc.save(str(p))

    doc2 = Document(str(p))
    para = next(iter(doc2.paragraphs))
    assert list(iter_image_blobs(para, doc2)) == []
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && PYTHONPATH=. uv run --python .venv/bin/python -m pytest tests/test_extract_image.py -v`
Expected: `ModuleNotFoundError: app.parser.extract_image`.

- [ ] **Step 3: extract_image 구현**

```python
# backend/app/parser/extract_image.py
"""<w:drawing>/<w:pict> 안의 임베디드 이미지 → bytes."""

from dataclasses import dataclass
from typing import Iterator

from docx.document import Document as DocxDocument
from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph

_R_EMBED = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed"


@dataclass(slots=True)
class ImageBlob:
    content_type: str          # e.g. 'image/png'
    ext: str                   # e.g. 'png' (no leading dot)
    data: bytes                # raw image bytes


def _ext_from_content_type(ct: str) -> str:
    table = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/gif": "gif",
        "image/bmp": "bmp",
        "image/webp": "webp",
        "image/x-emf": "emf",
        "image/x-wmf": "wmf",
        "image/tiff": "tiff",
        "image/svg+xml": "svg",
    }
    return table.get(ct.lower(), "bin")


def iter_image_blobs(paragraph: Paragraph, doc: DocxDocument) -> Iterator[ImageBlob]:
    """문단 한 개에서 임베디드 이미지를 모두 꺼낸다 (drawing > blip embed)."""
    p_el = paragraph._p
    # <a:blip r:embed="rId7"/> 를 모두 찾는다 — drawing 와 pict 둘 다 커버
    blips = p_el.findall(f".//{qn('a:blip')}")
    for blip in blips:
        r_id = blip.get(_R_EMBED)
        if not r_id:
            continue
        try:
            part = doc.part.related_parts[r_id]
        except KeyError:
            continue
        ct = getattr(part, "content_type", "application/octet-stream")
        yield ImageBlob(content_type=ct, ext=_ext_from_content_type(ct), data=part.blob)
```

- [ ] **Step 4: 이미지 테스트 실행 — 통과 확인**

Run: `cd backend && PYTHONPATH=. uv run --python .venv/bin/python -m pytest tests/test_extract_image.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/parser/extract_image.py backend/tests/test_extract_image.py
git commit -m "feat(parser): image blob extractor via drawing/blip embed"
```

---

### Task 3: 캡션 흡수 — 표/이미지 인접 문단

**Files:**
- Create: `backend/app/parser/extract_caption.py`
- Test: `backend/tests/test_extract_caption.py`

**Why this task:** "표 1. ...", "그림 1. ...", "Table 1: ...", "Figure 1: ..." 같은 단문 문단이 표/이미지 직전 또는 직후에 자주 등장한다. 이 휴리스틱을 별도 모듈에 두고, parse_docx 가 표/이미지 직전·직후 문단을 검사해 매칭되면 caption 으로 흡수하면서 그 문단 자체는 outline 에서 빠지도록 한다.

- [ ] **Step 1: 캡션 — 실패 테스트 작성**

```python
# backend/tests/test_extract_caption.py
"""extract_caption.is_caption / pick_caption 단위 테스트."""

from app.parser.extract_caption import is_caption, pick_caption


def test_is_caption_korean_table():
    assert is_caption("표 1. 결과 요약") is True
    assert is_caption("표1.결과요약") is True   # 공백/마침표 변형
    assert is_caption("표 12: 비교") is True


def test_is_caption_korean_figure():
    assert is_caption("그림 1. 시스템 구조도") is True
    assert is_caption("[그림 3] 흐름") is True


def test_is_caption_english():
    assert is_caption("Table 1. Summary") is True
    assert is_caption("Figure 2: Architecture") is True
    assert is_caption("FIG. 4 — overview") is True


def test_is_caption_negative():
    assert is_caption("이건 본문 한 줄") is False
    assert is_caption("") is False
    assert is_caption("a" * 200) is False     # 너무 김
    # 캡션 키워드는 있지만 문장 전체에 묻혀 있으면 캡션으로 보지 않음
    assert is_caption("앞 문장에서 그림 1을 참고했다") is False


def test_pick_caption_prefers_after_then_before():
    blocks = ["문서", "표 1. 본 자료", "표 2. 다음 자료"]
    # idx=1 (after), idx=2 (further) 둘 다 캡션이지만 직후가 우선
    assert pick_caption(blocks, before="앞 문장", after="표 1. 본 자료") == "표 1. 본 자료"
    assert pick_caption(blocks, before="표 1. 본 자료", after="다음 본문") == "표 1. 본 자료"
    assert pick_caption(blocks, before="앞 문장", after="다음 본문") is None
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && PYTHONPATH=. uv run --python .venv/bin/python -m pytest tests/test_extract_caption.py -v`
Expected: `ModuleNotFoundError: app.parser.extract_caption`.

- [ ] **Step 3: 캡션 모듈 구현**

```python
# backend/app/parser/extract_caption.py
"""표/이미지 캡션 휴리스틱 — 인접 문단을 검사해 캡션 여부 판정."""

import re

# 캡션 패턴: 시작 토큰이 키워드 + 숫자 + 구분자(. : —). 짧은 한 문장.
_CAPTION_RE = re.compile(
    r"""^\s*
        \[?\s*
        (?:표|그림|TABLE|FIGURE|FIG\.?|Table|Figure)
        \s*\]?\s*
        \d+\s*
        [.:\]\-—]?\s*
        \S
    """,
    re.VERBOSE,
)

_MAX_LEN = 120  # 너무 긴 문단은 캡션으로 보지 않음


def is_caption(text: str | None) -> bool:
    if not text:
        return False
    s = text.strip()
    if not s or len(s) > _MAX_LEN:
        return False
    return bool(_CAPTION_RE.match(s))


def pick_caption(_neighbors: list[str], *, before: str | None, after: str | None) -> str | None:
    """직후 문단을 우선 검사하고, 그래도 없으면 직전 문단을 본다.

    `_neighbors` 는 디버깅 편의를 위해 받아두고 향후 확장 여지로 남김 — 현재는 사용하지 않음.
    """
    if is_caption(after):
        return after.strip() if after else None
    if is_caption(before):
        return before.strip() if before else None
    return None
```

- [ ] **Step 4: 캡션 테스트 실행 — 통과 확인**

Run: `cd backend && PYTHONPATH=. uv run --python .venv/bin/python -m pytest tests/test_extract_caption.py -v`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/parser/extract_caption.py backend/tests/test_extract_caption.py
git commit -m "feat(parser): caption heuristic for tables and figures"
```

---

### Task 4: parse_docx 통합 — 표/이미지/캡션을 outline 에 채우기

**Files:**
- Modify: `backend/app/parser/parse_docx.py`
- Modify: `backend/tests/test_parse.py` (Phase 3 통합 테스트 추가)

**Why this task:** 추출기들은 다 만들었지만 아직 outline 에 안 들어간다. parse_docx 시그니처에 `user_id`/`job_id` 를 추가해서 디스크 저장 경로를 만들 수 있게 하고, 표/이미지 블록의 `markdown` `caption` `raw_ref` `preview_url` 을 채운다. 캡션 문단은 outline 에서 빠진다(흡수됨).

- [ ] **Step 1: parse_docx — Phase 3 통합 실패 테스트 작성**

```python
# backend/tests/test_parse.py 끝에 append
"""Phase 3 — 표/이미지/캡션 통합 검증."""
import uuid
from pathlib import Path

from app.parser.parse_docx import parse_docx
from tests.fixtures.build_table_image_sample import build_sample_with_table_and_image


def test_parse_docx_phase3_extracts_table_image_and_captions(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    p = tmp_path / "s.docx"
    build_sample_with_table_and_image(p)
    content = p.read_bytes()

    user_id = uuid.uuid4()
    job_id = uuid.uuid4()
    outline = parse_docx(
        content,
        filename="s.docx",
        user_id=user_id,
        job_id=job_id,
    )

    kinds = [b.kind for b in outline.blocks]
    assert kinds.count("table") == 1
    assert kinds.count("image") == 1

    table = next(b for b in outline.blocks if b.kind == "table")
    assert table.markdown is not None and table.markdown.startswith("| 구분 | 값 |")
    assert table.raw_ref == "table-0"
    assert table.caption == "표 1. 결과 요약"
    # 캡션 문단은 흡수돼 paragraph 블록으로 안 남는다
    assert not any(b.kind == "paragraph" and b.text == "표 1. 결과 요약" for b in outline.blocks)

    image = next(b for b in outline.blocks if b.kind == "image")
    assert image.raw_ref == "image-0"
    assert image.caption == "그림 1. 시스템 구조도"
    assert image.preview_url == f"/api/jobs/{job_id}/images/0"
    assert not any(b.kind == "paragraph" and b.text == "그림 1. 시스템 구조도" for b in outline.blocks)

    # 디스크에 OOXML/이미지 저장 확인
    raw_dir = tmp_path / "docs" / str(user_id) / str(job_id) / "raw"
    assert (raw_dir / "table-0.xml").exists()
    img_dir = tmp_path / "images" / str(job_id)
    files = list(img_dir.glob("image-0.*"))
    assert len(files) == 1


def test_parse_docx_phase3_back_compat_without_ids(tmp_path):
    """user_id/job_id 미전달 시에도 파싱은 되며, raw_ref/preview_url 은 None."""
    p = tmp_path / "s.docx"
    build_sample_with_table_and_image(p)
    content = p.read_bytes()
    outline = parse_docx(content, filename="s.docx")
    table = next(b for b in outline.blocks if b.kind == "table")
    assert table.markdown is not None
    assert table.raw_ref is None
    image = next(b for b in outline.blocks if b.kind == "image")
    assert image.raw_ref is None
    assert image.preview_url is None
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && PYTHONPATH=. uv run --python .venv/bin/python -m pytest tests/test_parse.py::test_parse_docx_phase3_extracts_table_image_and_captions tests/test_parse.py::test_parse_docx_phase3_back_compat_without_ids -v`
Expected: 새 테스트 2개 FAIL — 표/이미지 블록에 markdown/raw_ref 필드가 비어있음.

- [ ] **Step 3: parse_docx 본체 수정**

```python
# backend/app/parser/parse_docx.py — 전체 교체
"""`.docx` 바이트 → Outline (Phase 3: 표·이미지·캡션 추출)."""

import io
import uuid
from typing import Iterator

from docx import Document
from docx.document import Document as DocxDocument
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

from app.domain.outline import Block, Outline
from app.parser.detect_heading import detect_level
from app.parser.extract_caption import pick_caption
from app.parser.extract_image import ImageBlob, iter_image_blobs
from app.parser.extract_table import clone_table_xml, table_to_markdown
from app.storage.files import image_path, raw_ooxml_path

_ALIGN_MAP = {0: "left", 1: "center", 2: "right", 3: "justify"}


def _extract_alignment(paragraph: Paragraph) -> str | None:
    pf = paragraph.paragraph_format
    if pf is None or pf.alignment is None:
        return None
    code = int(pf.alignment)
    return _ALIGN_MAP.get(code)


def _collapse_consecutive_empty(blocks: list[Block]) -> list[Block]:
    out: list[Block] = []
    prev_empty = False
    for b in blocks:
        is_empty = b.kind == "paragraph" and not (b.text or "").strip()
        if is_empty and prev_empty:
            continue
        out.append(b)
        prev_empty = is_empty
    return out


def _iter_top_level(doc: DocxDocument) -> Iterator[object]:
    body = doc.element.body
    for child in body.iterchildren():
        if child.tag == qn("w:p"):
            yield Paragraph(child, doc)
        elif child.tag == qn("w:tbl"):
            yield Table(child, doc)


def _new_id() -> str:
    return f"b-{uuid.uuid4().hex[:8]}"


def _has_image(paragraph: Paragraph) -> bool:
    return paragraph._p.find(f".//{qn('w:drawing')}") is not None


def parse_docx(
    content: bytes,
    *,
    filename: str,
    user_id: uuid.UUID | None = None,
    job_id: uuid.UUID | None = None,
) -> Outline:
    """`.docx` 바이트 → Outline.

    `user_id`/`job_id` 가 주어지면 표 OOXML clone + 이미지 바이너리를 디스크에 저장하고
    `raw_ref`/`preview_url` 을 채운다. 미지정 시(테스트 등) markdown 만 채우고 raw_ref 는 None.
    """
    doc = Document(io.BytesIO(content))

    # 1) 토큰 시퀀스: 본문 자식 → (kind, payload).
    items: list[object] = list(_iter_top_level(doc))

    # 2) 어떤 인덱스가 image-bearing 문단/표인지 미리 표시
    is_image_para = [
        isinstance(it, Paragraph) and _has_image(it) for it in items
    ]
    is_table = [isinstance(it, Table) for it in items]

    # 3) 캡션 흡수 대상 인덱스(흡수되면 outline에서 제거)
    caption_for: dict[int, str] = {}        # table/image item idx → caption text
    suppressed: set[int] = set()             # 흡수돼 사라질 paragraph idx

    def _para_text(idx: int) -> str | None:
        if 0 <= idx < len(items) and isinstance(items[idx], Paragraph):
            return items[idx].text
        return None

    for idx, it in enumerate(items):
        if not (is_table[idx] or is_image_para[idx]):
            continue
        before_idx = idx - 1
        after_idx = idx + 1
        cap = pick_caption(
            [],
            before=_para_text(before_idx),
            after=_para_text(after_idx),
        )
        if cap is None:
            continue
        caption_for[idx] = cap
        # before / after 중 어느 쪽이 매칭됐는지 다시 판정해 흡수
        from app.parser.extract_caption import is_caption  # local import to avoid cycle
        if is_caption(_para_text(after_idx)):
            suppressed.add(after_idx)
        elif is_caption(_para_text(before_idx)):
            suppressed.add(before_idx)

    # 4) 실제 블록 생성 + 디스크 저장
    blocks: list[Block] = []
    table_idx = 0
    image_idx = 0
    para_idx = 0

    for idx, item in enumerate(items):
        if idx in suppressed:
            continue

        if isinstance(item, Paragraph):
            # 이미지 들어있는 문단
            if is_image_para[idx]:
                blobs: list[ImageBlob] = list(iter_image_blobs(item, doc))
                if not blobs:
                    # 드로잉이 있지만 임베디드 비트맵이 없는 경우(예: 셰이프) → 일반 문단
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
                    continue
                # 1문단 1이미지로 단순화 — 동일 문단의 추가 이미지는 같은 처리 반복
                for blob in blobs:
                    raw_ref = f"image-{image_idx}"
                    preview_url: str | None = None
                    if user_id is not None and job_id is not None:
                        out = image_path(job_id, image_idx, blob.ext)
                        out.write_bytes(blob.data)
                        preview_url = f"/api/jobs/{job_id}/images/{image_idx}"
                    blocks.append(
                        Block(
                            id=_new_id(),
                            kind="image",
                            level=0,
                            caption=caption_for.get(idx),
                            raw_ref=raw_ref if user_id and job_id else None,
                            preview_url=preview_url,
                        )
                    )
                    image_idx += 1
                continue

            # 일반 문단
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
            continue

        if isinstance(item, Table):
            md = table_to_markdown(item)
            raw_ref: str | None = None
            if user_id is not None and job_id is not None:
                xml = clone_table_xml(item)
                raw_ref = f"table-{table_idx}"
                raw_ooxml_path(user_id, job_id, raw_ref).write_bytes(xml)
            blocks.append(
                Block(
                    id=_new_id(),
                    kind="table",
                    level=0,
                    markdown=md,
                    caption=caption_for.get(idx),
                    raw_ref=raw_ref,
                )
            )
            table_idx += 1

    blocks = _collapse_consecutive_empty(blocks)
    return Outline(job_id="", source_filename=filename, blocks=blocks)
```

- [ ] **Step 4: parse 통합 테스트 실행 — 통과 확인**

Run: `cd backend && PYTHONPATH=. uv run --python .venv/bin/python -m pytest tests/test_parse.py -v`
Expected: 모든 parse 테스트 PASS (기존 + 신규 2개).

- [ ] **Step 5: Commit**

```bash
git add backend/app/parser/parse_docx.py backend/tests/test_parse.py
git commit -m "feat(parser): integrate table/image/caption extraction into outline"
```

---

### Task 5: 렌더러 — OOXML 재삽입 + 표 스타일 오버라이드

**Files:**
- Create: `backend/app/renderer/reembed_raw.py`
- Create: `backend/app/renderer/apply_table_style.py`
- Modify: `backend/app/renderer/render_docx.py`
- Test: `backend/tests/test_render_reembed.py`

**Why this task:** 추출 단계에서 디스크에 저장한 `<w:tbl>` 조각을 새 docx 본문에 다시 끼워넣고, StyleSpec.table 의 보더/헤더/셀 폰트만 덮어쓴다. 이미지 블록은 Phase 3 시점에는 placeholder 문단(추후 OOXML clone reembed 도 추가 가능). render_docx 시그니처에 `user_id`/`job_id` 가 추가된다.

- [ ] **Step 1: 렌더 — 실패 테스트 작성**

```python
# backend/tests/test_render_reembed.py
"""표 OOXML 재삽입 + 스타일 오버라이드 단위 테스트."""

import io
import uuid
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn

from app.domain.outline import Block, Outline
from app.domain.style_spec import StyleSpec
from app.renderer.render_docx import render_docx
from app.parser.parse_docx import parse_docx
from tests.fixtures.build_table_image_sample import build_sample_with_table_and_image


def _spec_minimal() -> StyleSpec:
    # test_render.py 의 SAMPLE_SPEC 와 같은 구조 — 동일 키 재사용
    from tests.test_render import SAMPLE_SPEC
    return StyleSpec.model_validate(SAMPLE_SPEC)


def test_render_reembeds_table_oxml(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    src = tmp_path / "s.docx"
    build_sample_with_table_and_image(src)
    content = src.read_bytes()
    user_id = uuid.uuid4()
    job_id = uuid.uuid4()
    outline = parse_docx(content, filename="s.docx", user_id=user_id, job_id=job_id)

    out_bytes = render_docx(outline, _spec_minimal(), user_id=user_id, job_id=job_id)
    out_doc = Document(io.BytesIO(out_bytes))

    # 표가 본문에 1개 들어 있어야 한다
    tables = out_doc.tables
    assert len(tables) == 1
    cells = [c.text.strip() for row in tables[0].rows for c in row.cells]
    assert "구분" in cells and "값" in cells and "10" in cells


def test_render_applies_table_border_color(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    src = tmp_path / "s.docx"
    build_sample_with_table_and_image(src)
    content = src.read_bytes()
    user_id = uuid.uuid4()
    job_id = uuid.uuid4()
    outline = parse_docx(content, filename="s.docx", user_id=user_id, job_id=job_id)

    spec = _spec_minimal()
    spec.table.border_color = "#FF0000"
    spec.table.border_width_pt = 1.0

    out_bytes = render_docx(outline, spec, user_id=user_id, job_id=job_id)
    out_doc = Document(io.BytesIO(out_bytes))
    tbl = out_doc.tables[0]
    borders = tbl._tbl.findall(f".//{qn('w:tblBorders')}/{qn('w:top')}")
    assert borders, "tblBorders/w:top not found"
    assert borders[0].get(qn("w:color")) == "FF0000"


def test_render_image_placeholder_when_block_image(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    outline = Outline(
        job_id="x",
        source_filename="x.docx",
        blocks=[
            Block(
                id="b-1",
                kind="image",
                level=0,
                caption="그림 1. 예시",
                raw_ref="image-0",
                preview_url="/api/jobs/none/images/0",
            )
        ],
    )
    out_bytes = render_docx(outline, _spec_minimal())
    out_doc = Document(io.BytesIO(out_bytes))
    paras = [p.text for p in out_doc.paragraphs]
    assert any("[이미지]" in t and "그림 1. 예시" in t for t in paras)
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && PYTHONPATH=. uv run --python .venv/bin/python -m pytest tests/test_render_reembed.py -v`
Expected: `ModuleNotFoundError: app.renderer.reembed_raw` (또는 render_docx 시그니처 불일치).

- [ ] **Step 3: apply_table_style 구현**

```python
# backend/app/renderer/apply_table_style.py
"""StyleSpec.table → <w:tbl> 패치 — 보더, 헤더 배경/볼드, 셀 폰트 사이즈."""

from docx.oxml.ns import qn
from docx.shared import Pt
from lxml import etree

from app.domain.style_spec import StyleSpec

_BORDER_NAMES = ("top", "left", "bottom", "right", "insideH", "insideV")


def _hex(value: str) -> str:
    """#RRGGBB → RRGGBB (OOXML 은 # 없이)."""
    return value.lstrip("#").upper()


def _pt_to_eighths(pt: float) -> int:
    """OOXML 보더 굵기 단위는 1/8 pt."""
    return max(1, int(round(pt * 8)))


def _ensure_tblPr(tbl_el):
    tblPr = tbl_el.find(qn("w:tblPr"))
    if tblPr is None:
        tblPr = etree.SubElement(tbl_el, qn("w:tblPr"))
    return tblPr


def _apply_borders(tbl_el, color_hex: str, width_eighths: int) -> None:
    tblPr = _ensure_tblPr(tbl_el)
    borders = tblPr.find(qn("w:tblBorders"))
    if borders is not None:
        tblPr.remove(borders)
    borders = etree.SubElement(tblPr, qn("w:tblBorders"))
    for name in _BORDER_NAMES:
        b = etree.SubElement(borders, qn(f"w:{name}"))
        b.set(qn("w:val"), "single")
        b.set(qn("w:sz"), str(width_eighths))
        b.set(qn("w:space"), "0")
        b.set(qn("w:color"), color_hex)


def _apply_header_shading(tbl_el, header_bg_hex: str) -> None:
    rows = tbl_el.findall(qn("w:tr"))
    if not rows:
        return
    header = rows[0]
    for tc in header.findall(qn("w:tc")):
        tcPr = tc.find(qn("w:tcPr"))
        if tcPr is None:
            tcPr = etree.SubElement(tc, qn("w:tcPr"))
        shd = tcPr.find(qn("w:shd"))
        if shd is not None:
            tcPr.remove(shd)
        shd = etree.SubElement(tcPr, qn("w:shd"))
        shd.set(qn("w:val"), "clear")
        shd.set(qn("w:color"), "auto")
        shd.set(qn("w:fill"), header_bg_hex)


def _apply_header_bold(tbl_el) -> None:
    rows = tbl_el.findall(qn("w:tr"))
    if not rows:
        return
    header = rows[0]
    for r in header.iter(qn("w:r")):
        rPr = r.find(qn("w:rPr"))
        if rPr is None:
            rPr = etree.SubElement(r, qn("w:rPr"))
            r.insert(0, rPr)
        # 기존 b 제거 후 다시
        for b in rPr.findall(qn("w:b")):
            rPr.remove(b)
        etree.SubElement(rPr, qn("w:b"))


def _apply_cell_font_size(tbl_el, size_pt: float) -> None:
    half_pt = str(int(round(size_pt * 2)))
    for r in tbl_el.iter(qn("w:r")):
        rPr = r.find(qn("w:rPr"))
        if rPr is None:
            rPr = etree.SubElement(r, qn("w:rPr"))
            r.insert(0, rPr)
        for sz in rPr.findall(qn("w:sz")):
            rPr.remove(sz)
        sz = etree.SubElement(rPr, qn("w:sz"))
        sz.set(qn("w:val"), half_pt)


def apply_table_style(tbl_el, spec: StyleSpec) -> None:
    """StyleSpec.table 의 값으로 표 OOXML 을 패치 (in-place)."""
    table = spec.table
    _apply_borders(tbl_el, _hex(table.border_color), _pt_to_eighths(table.border_width_pt))
    _apply_header_shading(tbl_el, _hex(table.header_bg))
    if table.header_bold:
        _apply_header_bold(tbl_el)
    _apply_cell_font_size(tbl_el, table.cell_font_size_pt)
```

- [ ] **Step 4: reembed_raw 구현**

```python
# backend/app/renderer/reembed_raw.py
"""디스크에 저장된 OOXML 조각을 새 .docx body 에 재삽입."""

import uuid
from pathlib import Path

from docx.document import Document as DocxDocument
from docx.oxml.ns import qn
from lxml import etree

from app.domain.style_spec import StyleSpec
from app.renderer.apply_table_style import apply_table_style
from app.storage.files import raw_ooxml_path

_NSMAP = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
}


def _parse_fragment(xml_bytes: bytes):
    # standalone 조각이라 root 가 <w:tbl>. 네임스페이스 보존을 위해 XMLParser 사용.
    parser = etree.XMLParser(remove_blank_text=False)
    wrapped = (
        b'<root xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        + xml_bytes
        + b"</root>"
    )
    root = etree.fromstring(wrapped, parser=parser)
    return root[0]


def reembed_table(
    doc: DocxDocument,
    *,
    raw_ref: str,
    user_id: uuid.UUID,
    job_id: uuid.UUID,
    spec: StyleSpec,
) -> None:
    """`raw_ref` 로 디스크에서 <w:tbl> 조각을 읽어 본문 끝에 추가하고 스타일을 덮어쓴다."""
    p = raw_ooxml_path(user_id, job_id, raw_ref)
    if not p.exists():
        # 파일이 사라진 경우 placeholder 문단으로 대체
        doc.add_paragraph(f"[표 원본 누락 — {raw_ref}]")
        return
    tbl_el = _parse_fragment(p.read_bytes())
    apply_table_style(tbl_el, spec)
    doc.element.body.append(tbl_el)
    # python-docx 가 표 직후 빈 문단을 요구하는 경우가 있어 안전하게 추가
    doc.add_paragraph()
```

- [ ] **Step 5: render_docx 본체 수정 (시그니처 + 분기)**

```python
# backend/app/renderer/render_docx.py — 전체 교체
"""Outline + StyleSpec → .docx 바이트 (Phase 3: 표 reembed + 이미지 placeholder)."""

import io
import uuid

from docx import Document
from docx.shared import Mm

from app.domain.outline import Block, Outline
from app.domain.style_spec import StyleSpec
from app.renderer.apply_style import apply_paragraph_style
from app.renderer.inject_numbering import renumber
from app.renderer.reembed_raw import reembed_table


def _setup_page(doc, spec: StyleSpec) -> None:
    section = doc.sections[0]
    section.top_margin = Mm(spec.page.margin_top_mm)
    section.bottom_margin = Mm(spec.page.margin_bottom_mm)
    section.left_margin = Mm(spec.page.margin_left_mm)
    section.right_margin = Mm(spec.page.margin_right_mm)


def _add_paragraph_block(doc, block: Block, spec: StyleSpec) -> None:
    para = doc.add_paragraph(block.text or "")
    apply_paragraph_style(para, block.level, spec, alignment_override=block.alignment)


def _add_image_placeholder(doc, block: Block, spec: StyleSpec) -> None:
    """Phase 3: 이미지는 placeholder 문단으로(원본 보존은 디스크에서)."""
    text = "[이미지]"
    if block.caption:
        text = f"{text} {block.caption}"
    para = doc.add_paragraph(text)
    apply_paragraph_style(para, 0, spec)


def _add_field_placeholder(doc, block: Block, spec: StyleSpec) -> None:
    text = "[참조 — Phase 4 예정]"
    if block.preview_text:
        text = f"{text} {block.preview_text}"
    para = doc.add_paragraph(text)
    apply_paragraph_style(para, 0, spec)


def _add_caption_paragraph(doc, caption: str, spec: StyleSpec) -> None:
    """표/이미지 위에 캡션 문단을 한 줄 더 둔다."""
    para = doc.add_paragraph(caption)
    apply_paragraph_style(para, 0, spec)


def render_docx(
    outline: Outline,
    spec: StyleSpec,
    *,
    user_id: uuid.UUID | None = None,
    job_id: uuid.UUID | None = None,
) -> bytes:
    doc = Document()
    _setup_page(doc, spec)
    blocks = renumber(outline.blocks, spec)

    for b in blocks:
        if b.kind == "paragraph":
            _add_paragraph_block(doc, b, spec)
            continue

        if b.caption:
            _add_caption_paragraph(doc, b.caption, spec)

        if b.kind == "table":
            if b.raw_ref and user_id is not None and job_id is not None:
                reembed_table(
                    doc,
                    raw_ref=b.raw_ref,
                    user_id=user_id,
                    job_id=job_id,
                    spec=spec,
                )
            else:
                # 마크다운만 있는 경우(테스트 환경 등) 텍스트 평탄화로 보존
                para = doc.add_paragraph(b.markdown or "[표 원본 미보존]")
                apply_paragraph_style(para, 0, spec)
            continue

        if b.kind == "image":
            _add_image_placeholder(doc, b, spec)
            continue

        if b.kind == "field":
            _add_field_placeholder(doc, b, spec)
            continue

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
```

- [ ] **Step 6: 렌더 테스트 실행 — 통과 확인**

Run: `cd backend && PYTHONPATH=. uv run --python .venv/bin/python -m pytest tests/test_render_reembed.py tests/test_render.py -v`
Expected: 모든 렌더 테스트 PASS — 기존 test_render 가 깨지지 않아야 한다(시그니처 변경은 키워드 인자라 후방 호환).

- [ ] **Step 7: Commit**

```bash
git add backend/app/renderer/apply_table_style.py backend/app/renderer/reembed_raw.py \
        backend/app/renderer/render_docx.py backend/tests/test_render_reembed.py
git commit -m "feat(renderer): table OOXML reembed and style override (Phase 3)"
```

---

### Task 6: jobs/upload + render 시그니처 연결

**Files:**
- Modify: `backend/app/api/jobs.py`
- Modify: `backend/tests/test_api_jobs.py` (기존 테스트가 깨지지 않는지 확인)

**Why this task:** parse_docx / render_docx 시그니처에 `user_id`/`job_id` 가 추가됐다. jobs.py 의 호출 지점을 갱신해 디스크 저장이 작동하도록 한다. 또한 delete_job 시 `image_dir`/`raw` 디렉터리도 정리한다.

- [ ] **Step 1: jobs.py 수정 — parse_docx 호출에 ids 전달**

`backend/app/api/jobs.py` 의 `post_upload` 함수, parse_docx 호출 라인 (현재 75행):

기존:
```python
outline = parse_docx(content, filename=file.filename)
```

변경:
```python
outline = parse_docx(
    content,
    filename=file.filename,
    user_id=user.id,
    job_id=job.id,
)
```

- [ ] **Step 2: jobs.py 수정 — render_docx 호출에 ids 전달**

`post_render` 함수, render_docx 호출 라인 (현재 122행):

기존:
```python
data = render_docx(outline, spec)
```

변경:
```python
data = render_docx(outline, spec, user_id=user.id, job_id=job.id)
```

- [ ] **Step 3: jobs.py 수정 — delete_job 시 raw / image 디렉터리 정리**

`delete_job` 함수에 디스크 cleanup 확장. 현재 `for path_str in (job.source_path, job.result_path):` 블록 다음에 추가:

```python
# Phase 3: raw 디렉터리(<jobdir>/raw) + 이미지 디렉터리(/data/images/<job>) 정리
import shutil  # 함수 상단에 두는 게 깔끔하지만 기존 import 스타일 유지를 위해 in-place
from app.storage.files import job_dir, image_dir  # 모듈 상단 import 로 옮기기

raw_dir = job_dir(user.id, job.id) / "raw"
if raw_dir.exists():
    try:
        shutil.rmtree(raw_dir)
    except OSError:
        pass

img = image_dir(job.id)
if img.exists():
    try:
        shutil.rmtree(img)
    except OSError:
        pass
```

실제 적용 후의 `delete_job` 전체 모습:

```python
@router.delete("/{job_id}", status_code=204)
def delete_job(
    job_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    job = _get_user_job(db, user, job_id)
    for path_str in (job.source_path, job.result_path):
        if path_str:
            p = Path(path_str)
            if p.exists():
                try:
                    p.unlink()
                except OSError:
                    pass
    raw_dir = job_dir(user.id, job.id) / "raw"
    if raw_dir.exists():
        try:
            shutil.rmtree(raw_dir)
        except OSError:
            pass
    img = image_dir(job.id)
    if img.exists():
        try:
            shutil.rmtree(img)
        except OSError:
            pass
    db.delete(job)
    db.commit()
```

그리고 모듈 상단 import 갱신:

```python
import shutil
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.db.models import Job, Template, User
from app.domain.outline import Outline
from app.domain.style_spec import StyleSpec
from app.parser.parse_docx import parse_docx
from app.renderer.render_docx import render_docx
from app.storage.files import image_dir, job_dir, result_path, source_path
```

- [ ] **Step 4: 기존 jobs API 테스트 실행 — 회귀 없음 확인**

Run: `cd backend && PYTHONPATH=. uv run --python .venv/bin/python -m pytest tests/test_api_jobs.py -v`
Expected: 모든 테스트 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/jobs.py
git commit -m "feat(api): wire user_id/job_id into parse and render, cleanup raw/image dirs"
```

---

### Task 7: 이미지 미리보기 라우트 — `GET /jobs/{id}/images/{idx}`

**Files:**
- Create: `backend/app/api/images.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_api_images.py`

**Why this task:** 프론트가 hover 시 `<img src="/api/jobs/{job_id}/images/0">` 로 이미지를 받아야 한다. 라우트는 인증된 사용자가 본인 job 의 이미지에만 접근하도록 한다. ext 가 다를 수 있으므로 `image-{idx}.*` 글롭으로 찾는다.

- [ ] **Step 1: 이미지 라우트 — 실패 테스트 작성**

```python
# backend/tests/test_api_images.py
"""GET /jobs/{id}/images/{idx} E2E."""

import io
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from tests.fixtures.build_table_image_sample import build_sample_with_table_and_image


def _login(client: TestClient) -> None:
    client.post("/auth/signup", json={"email": "img@x.com", "password": "pw12345!"})
    client.post("/auth/login", json={"email": "img@x.com", "password": "pw12345!"})


def test_images_route_returns_png(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    src = tmp_path / "s.docx"
    build_sample_with_table_and_image(src)
    with TestClient(app) as client:
        _login(client)
        with src.open("rb") as f:
            up = client.post("/jobs/upload", files={"file": ("s.docx", f, "application/octet-stream")})
        assert up.status_code == 201
        job_id = up.json()["job_id"]

        r = client.get(f"/jobs/{job_id}/images/0")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("image/")
        assert len(r.content) > 0


def test_images_route_404_on_missing_idx(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    src = tmp_path / "s.docx"
    build_sample_with_table_and_image(src)
    with TestClient(app) as client:
        _login(client)
        with src.open("rb") as f:
            up = client.post("/jobs/upload", files={"file": ("s.docx", f, "application/octet-stream")})
        job_id = up.json()["job_id"]

        r = client.get(f"/jobs/{job_id}/images/99")
        assert r.status_code == 404


def test_images_route_404_on_other_users_job(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    src = tmp_path / "s.docx"
    build_sample_with_table_and_image(src)
    with TestClient(app) as client:
        # 사용자 A 로 업로드
        client.post("/auth/signup", json={"email": "a@x.com", "password": "pw12345!"})
        client.post("/auth/login", json={"email": "a@x.com", "password": "pw12345!"})
        with src.open("rb") as f:
            up = client.post("/jobs/upload", files={"file": ("s.docx", f, "application/octet-stream")})
        job_id = up.json()["job_id"]
        client.post("/auth/logout")

        # 사용자 B 로 접근 시도
        client.post("/auth/signup", json={"email": "b@x.com", "password": "pw12345!"})
        client.post("/auth/login", json={"email": "b@x.com", "password": "pw12345!"})
        r = client.get(f"/jobs/{job_id}/images/0")
        assert r.status_code == 404
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && PYTHONPATH=. uv run --python .venv/bin/python -m pytest tests/test_api_images.py -v`
Expected: 모두 FAIL (`/jobs/{id}/images/{idx}` 라우트 없음 → 404 응답이지만 content-type 검사에서 실패하거나, 404 검증 테스트는 우연히 통과 가능 — 여기선 첫 테스트가 확실히 fail).

- [ ] **Step 3: images 라우터 구현**

```python
# backend/app/api/images.py
"""이미지 미리보기 라우트 — /jobs/{id}/images/{idx}."""

import mimetypes
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.db.models import Job, User
from app.storage.files import image_dir

router = APIRouter(prefix="/jobs", tags=["images"])


@router.get("/{job_id}/images/{idx}")
def get_image(
    job_id: str,
    idx: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    job = db.query(Job).filter_by(id=uuid.UUID(job_id), user_id=user.id).one_or_none()
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")

    candidates = sorted(image_dir(job.id).glob(f"image-{idx}.*"))
    if not candidates:
        raise HTTPException(status_code=404, detail="image not found")
    p: Path = candidates[0]
    media_type, _ = mimetypes.guess_type(str(p))
    return FileResponse(path=str(p), media_type=media_type or "application/octet-stream")
```

- [ ] **Step 4: main.py 에 라우터 등록**

`backend/app/main.py` 의 import 와 include 양쪽 수정:

```python
from app.api.auth import router as auth_router
from app.api.images import router as images_router
from app.api.jobs import router as jobs_router
from app.api.templates import router as templates_router
```

```python
app.include_router(auth_router)
app.include_router(jobs_router)
app.include_router(images_router)
app.include_router(templates_router)
```

- [ ] **Step 5: 이미지 라우트 테스트 실행 — 통과 확인**

Run: `cd backend && PYTHONPATH=. uv run --python .venv/bin/python -m pytest tests/test_api_images.py -v`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/images.py backend/app/main.py backend/tests/test_api_images.py
git commit -m "feat(api): GET /jobs/{id}/images/{idx} for hover preview"
```

---

### Task 8: 프론트 — TableBlock 마크다운 렌더 + 캡션

**Files:**
- Modify: `frontend/components/outline-editor/TableBlock.tsx`

**Why this task:** 현재 `TableBlock` 은 단순 placeholder 텍스트만 보여준다. `react-markdown` + `remark-gfm` 으로 GFM 표를 렌더하고, 캡션은 카드 상단에 작게 표시한다.

- [ ] **Step 1: TableBlock.tsx 전체 교체**

```tsx
// frontend/components/outline-editor/TableBlock.tsx
"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Block } from "@/lib/types";

export function TableBlock({ block }: { block: Block }) {
  return (
    <div className="rounded-token border border-border bg-surface px-3 py-2">
      {block.caption ? (
        <div className="mb-1 text-xs text-text-muted italic">{block.caption}</div>
      ) : null}
      {block.markdown ? (
        <div className="overflow-x-auto text-sm [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:bg-surface-elevated [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.markdown}</ReactMarkdown>
        </div>
      ) : (
        <div className="text-sm text-text-muted italic">[표 원본만 보존됨 — 미리보기 없음]</div>
      )}
      {block.raw_ref ? (
        <div className="mt-1 text-[11px] text-text-muted/70">
          원본 보존: <code>{block.raw_ref}</code>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인 (typecheck)**

Run: `cd frontend && npm run lint`
Expected: warnings 없음 (또는 기존 수준 동일).

- [ ] **Step 3: Commit**

```bash
git add frontend/components/outline-editor/TableBlock.tsx
git commit -m "feat(ui): render table blocks with react-markdown + GFM (Phase 3)"
```

---

### Task 9: 프론트 — ImageBlock placeholder + hover 미리보기

**Files:**
- Modify: `frontend/components/outline-editor/ImageBlock.tsx`

**Why this task:** 프론트는 placeholder 카드를 보여주다가, 마우스 오버 시 `<img>` 를 토글한다. 캡션은 카드 안에 항상 표시. 미리보기 이미지가 깨져도 placeholder 가 남아야 한다.

- [ ] **Step 1: ImageBlock.tsx 전체 교체**

```tsx
// frontend/components/outline-editor/ImageBlock.tsx
"use client";

import { useState } from "react";
import type { Block } from "@/lib/types";

export function ImageBlock({ block }: { block: Block }) {
  const [hover, setHover] = useState(false);
  const [errored, setErrored] = useState(false);
  const url = block.preview_url ?? null;

  return (
    <div
      className="relative rounded-token border border-border bg-surface px-3 py-2"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="flex items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="rounded bg-surface-elevated px-1.5 py-0.5 text-xs text-text-muted">
            🖼 이미지
          </span>
          {block.caption ? (
            <span className="italic text-text-muted">{block.caption}</span>
          ) : (
            <span className="italic text-text-muted">캡션 없음</span>
          )}
        </div>
        {url && !errored ? (
          <span className="text-[11px] text-text-muted">호버하면 미리보기</span>
        ) : null}
      </div>

      {hover && url && !errored ? (
        <div className="mt-2 max-h-72 overflow-auto rounded border border-border bg-bg p-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={block.caption ?? "이미지 미리보기"}
            onError={() => setErrored(true)}
            className="block max-h-64 w-auto"
          />
        </div>
      ) : null}

      {block.raw_ref ? (
        <div className="mt-1 text-[11px] text-text-muted/70">
          원본 보존: <code>{block.raw_ref}</code>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: lint 확인**

Run: `cd frontend && npm run lint`
Expected: warnings 없음 (기존 수준 동일).

- [ ] **Step 3: Commit**

```bash
git add frontend/components/outline-editor/ImageBlock.tsx
git commit -m "feat(ui): image block hover preview via /jobs/{id}/images/{idx}"
```

---

### Task 10: 통합 검증 + spec 문서 업데이트

**Files:**
- Modify: `docs/superpowers/specs/2026-04-26-word-templator-design.md` (Phase 3 완료 검증 섹션 추가)

**Why this task:** 모든 테스트 스위트 + 통합 시나리오 한 번 통과 확인. 디자인 문서에 Phase 3 검증 로그를 남겨 다음 Phase(상대 참조) 진입 시 컨텍스트가 보존되게 한다.

- [ ] **Step 1: 백엔드 전체 테스트 실행**

Run: `cd backend && PYTHONPATH=. uv run --python .venv/bin/python -m pytest -q`
Expected: 모든 테스트 PASS — 예상 라인 `XX passed in Ys`.

- [ ] **Step 2: 프론트 lint + typecheck**

Run: `cd frontend && npm run lint`
Expected: clean (기존 수준 유지).

- [ ] **Step 3: ruff lint + format check**

Run: `cd backend && uv run --python .venv/bin/python -m ruff check . && uv run --python .venv/bin/python -m ruff format --check .`
Expected: All checks passed!

- [ ] **Step 4: spec 문서에 Phase 3 완료 검증 섹션 추가**

`docs/superpowers/specs/2026-04-26-word-templator-design.md` 끝에 append:

```markdown

## Phase 3 완료 검증 — 2026-04-27

- 표 → 마크다운 read-only 렌더 완료 (react-markdown + remark-gfm) — `TableBlock`
- 표 OOXML clone 디스크 보존 + 렌더 시 reembed — `clone_table_xml`, `reembed_table`
- 표 스타일(보더 색·굵기, 헤더 배경/볼드, 셀 폰트 사이즈) override 적용 — `apply_table_style`
- 이미지 추출(`<a:blip r:embed>`) → /data/images/<job_id>/image-N.<ext> — `iter_image_blobs`
- 이미지 미리보기 라우트 `GET /jobs/{id}/images/{idx}` (인증, 본인 job 만)
- 이미지 hover 미리보기 + placeholder + 캡션 — `ImageBlock`
- 캡션 휴리스틱(표 N./그림 N./Table N./Figure N./[그림 N]) — `extract_caption`
- 표/이미지 직전·직후 캡션 흡수 → outline 에서 해당 paragraph 빠짐
- 병합셀(`gridSpan`/`vMerge`)은 `[병합셀]` 마커, 원본 OOXML 은 그대로 보존(R4)

알려진 한계 (Phase 4~5 에서 해결):
- 필드(TOC/REF/PAGEREF) 는 여전히 placeholder
- 이미지 OOXML 자체의 reembed 는 미구현 — 현재는 placeholder 문단으로 보존
- 중첩표는 마크다운에서 평탄화 표시(원본은 보존)
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-04-26-word-templator-design.md
git commit -m "docs: Phase 3 (table/image/caption) completion log"
```

---

## Self-Review

### 1. Spec coverage (Phase 3 요구사항 vs 작업)

| Spec 요구 | 처리한 Task |
|---|---|
| 표 마크다운 read-only 렌더 + `raw_ref` 보존 | Task 1 (추출), Task 8 (프론트) |
| 이미지 추출 + placeholder + 클릭/호버 미리보기 | Task 2 (추출), Task 7 (라우트), Task 9 (프론트) |
| 표/이미지 캡션 추출 → outline blocks 에 포함 | Task 3 (휴리스틱), Task 4 (parse_docx 통합) |
| 병합셀/중첩표는 placeholder + 원본 보존 (R4) | Task 1 (병합셀 마커), Task 5 (reembed 시 원본 그대로) |
| 표 스타일(StyleSpec.table) 오버라이드 | Task 5 (`apply_table_style`) |
| GET /jobs/{id}/images/{idx} 라우트 | Task 7 |
| 디스크 cleanup (delete_job) | Task 6 |

모든 요구 처리됨.

### 2. Placeholder scan

- "TBD"/"TODO"/"implement later" 없음.
- 모든 단계에 코드 또는 명령 명시.
- 로깅·에러처리 디테일 없이 "handle errors" 라고만 적은 곳 없음.

### 3. Type consistency

- `parse_docx(content, *, filename, user_id=None, job_id=None) -> Outline` — Task 4·6 일치.
- `render_docx(outline, spec, *, user_id=None, job_id=None) -> bytes` — Task 5·6 일치.
- `clone_table_xml(table) -> bytes`, `table_to_markdown(table) -> str` — Task 1 ↔ Task 4 일치.
- `iter_image_blobs(paragraph, doc) -> Iterator[ImageBlob]` (`ImageBlob.content_type/ext/data`) — Task 2 ↔ Task 4 일치.
- `is_caption(text) -> bool`, `pick_caption(neighbors, *, before, after) -> str | None` — Task 3 ↔ Task 4 일치.
- `apply_table_style(tbl_el, spec) -> None`, `reembed_table(doc, *, raw_ref, user_id, job_id, spec)` — Task 5 내부 일치.
- 스토리지: `raw_ooxml_path(user_id, job_id, raw_ref) -> Path`, `image_path(job_id, idx, ext) -> Path`, `image_dir(job_id) -> Path` — Task 1·2·4·5·6·7 모두 일치.
- `Block` 필드: 기존 `markdown/preview_url/caption/raw_ref` 사용. domain/outline.py 변경 없음.

타입 일관성 OK.
