"""`.docx` 바이트 → Outline (Phase 3: 표·이미지·캡션 추출)."""

import io
import uuid
from collections.abc import Iterator

from docx import Document
from docx.document import Document as DocxDocument
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

from app.domain.outline import Block, Outline
from app.parser.detect_heading import detect_level
from app.parser.extract_caption import is_caption, pick_caption
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
        empty = b.kind == "paragraph" and not (b.text or "").strip()
        if empty and prev_empty:
            continue
        out.append(b)
        prev_empty = empty
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


def _para_text(items: list[object], idx: int) -> str | None:
    if 0 <= idx < len(items) and isinstance(items[idx], Paragraph):
        return items[idx].text
    return None


def parse_docx(
    content: bytes,
    *,
    filename: str,
    user_id: uuid.UUID | None = None,
    job_id: uuid.UUID | None = None,
) -> Outline:
    """`.docx` 바이트 → Outline.

    user_id/job_id 가 주어지면 표 OOXML clone 과 이미지 바이너리를 디스크에 저장하고
    raw_ref/preview_url 을 채운다. 미지정 시 markdown 만 채우고 raw_ref/preview_url 은 None.
    """
    doc = Document(io.BytesIO(content))

    items: list[object] = list(_iter_top_level(doc))

    is_image_para = [isinstance(it, Paragraph) and _has_image(it) for it in items]
    is_table = [isinstance(it, Table) for it in items]

    caption_for: dict[int, str] = {}
    suppressed: set[int] = set()

    for idx in range(len(items)):
        if not (is_table[idx] or is_image_para[idx]):
            continue
        before_text = _para_text(items, idx - 1)
        after_text = _para_text(items, idx + 1)
        cap = pick_caption([], before=before_text, after=after_text)
        if cap is None:
            continue
        caption_for[idx] = cap
        if is_caption(after_text):
            suppressed.add(idx + 1)
        elif is_caption(before_text):
            suppressed.add(idx - 1)

    blocks: list[Block] = []
    table_idx = 0
    image_idx = 0
    para_idx = 0

    has_disk = user_id is not None and job_id is not None

    for idx, item in enumerate(items):
        if idx in suppressed:
            continue

        if isinstance(item, Paragraph):
            if is_image_para[idx]:
                blobs: list[ImageBlob] = list(iter_image_blobs(item, doc))
                if not blobs:
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
                cap_for_this = caption_for.get(idx)
                for blob in blobs:
                    raw_ref = f"image-{image_idx}" if has_disk else None
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
                            caption=cap_for_this,
                            raw_ref=raw_ref,
                            preview_url=preview_url,
                        )
                    )
                    # 한 paragraph 안의 첫 이미지에만 caption 부여
                    cap_for_this = None
                    image_idx += 1
                continue

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
            raw_ref_t: str | None = None
            if user_id is not None and job_id is not None:
                xml = clone_table_xml(item)
                raw_ref_t = f"table-{table_idx}"
                raw_ooxml_path(user_id, job_id, raw_ref_t).write_bytes(xml)
            blocks.append(
                Block(
                    id=_new_id(),
                    kind="table",
                    level=0,
                    markdown=md,
                    caption=caption_for.get(idx),
                    raw_ref=raw_ref_t,
                )
            )
            table_idx += 1

    blocks = _collapse_consecutive_empty(blocks)
    return Outline(job_id="", source_filename=filename, blocks=blocks)
