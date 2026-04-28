"""Outline + StyleSpec → .docx 바이트.

섹션(SectionSpec) 단위로 페이지 방향/크기/마진/머리말·꼬리말을 보존한다.
- outline.sections 가 비어있으면 단일 섹션 (legacy / StyleSpec.page 마진 사용).
- 섹션 머리말/꼬리말은 파싱 시 디스크에 저장된 원본 XML 을 다시 주입.
"""

import io
import uuid

from docx import Document
from docx.enum.section import WD_ORIENT, WD_SECTION
from docx.shared import Mm
from lxml import etree

from app.domain.outline import Block, Outline
from app.domain.section import SectionSpec
from app.domain.style_spec import StyleSpec
from app.renderer.apply_style import apply_paragraph_style
from app.renderer.inject_numbering import renumber
from app.renderer.reembed_raw import reembed_paragraph, reembed_table
from app.storage.files import section_part_path


def _default_section_spec(block_ids: list[str], spec: StyleSpec) -> SectionSpec:
    """outline.sections 가 비어있을 때 (legacy) 사용할 단일 portrait 섹션."""
    return SectionSpec(
        id="s-default",
        orientation="portrait",
        margin_top_mm=spec.page.margin_top_mm,
        margin_bottom_mm=spec.page.margin_bottom_mm,
        margin_left_mm=spec.page.margin_left_mm,
        margin_right_mm=spec.page.margin_right_mm,
        block_ids=block_ids,
    )


def _apply_section_props(section, sect_spec: SectionSpec) -> None:
    """python-docx Section 객체에 SectionSpec 의 페이지 속성 적용.

    landscape 시 width/height 를 명시적으로 swap 해야 한다 — python-docx 가 자동
    처리하지 않음.
    """
    is_landscape = sect_spec.orientation == "landscape"
    section.orientation = WD_ORIENT.LANDSCAPE if is_landscape else WD_ORIENT.PORTRAIT
    if is_landscape and sect_spec.page_width_mm < sect_spec.page_height_mm:
        section.page_width = Mm(sect_spec.page_height_mm)
        section.page_height = Mm(sect_spec.page_width_mm)
    else:
        section.page_width = Mm(sect_spec.page_width_mm)
        section.page_height = Mm(sect_spec.page_height_mm)
    section.top_margin = Mm(sect_spec.margin_top_mm)
    section.bottom_margin = Mm(sect_spec.margin_bottom_mm)
    section.left_margin = Mm(sect_spec.margin_left_mm)
    section.right_margin = Mm(sect_spec.margin_right_mm)


def _apply_preserved_part(part_element, xml_bytes: bytes) -> None:
    """파트의 root element 자식들을 보존된 XML 의 자식으로 교체.

    `<w:hdr>` / `<w:ftr>` 의 콘텐츠 (paragraph 들) 만 갈아끼우는 식. 임베디드 이미지의
    rels 까지는 넘기지 않으므로 텍스트 위주 머리말/꼬리말에 한해 안전.
    """
    new_root = etree.fromstring(xml_bytes)
    for child in list(part_element):
        part_element.remove(child)
    for child in list(new_root):
        part_element.append(child)


def _apply_preserved_headers_footers(
    section,
    sect_spec: SectionSpec,
    section_idx: int,
    user_id: uuid.UUID,
    job_id: uuid.UUID,
) -> None:
    """파싱 시 저장된 머리말/꼬리말 XML 을 출력 .docx 의 해당 섹션에 다시 주입."""
    has_first = bool(sect_spec.header_first_ref or sect_spec.footer_first_ref)
    has_even = bool(sect_spec.header_even_ref or sect_spec.footer_even_ref)
    if has_first:
        section.different_first_page_header_footer = True

    targets = [
        ("header", "default", sect_spec.header_default_ref, section.header),
        ("header", "first", sect_spec.header_first_ref, section.first_page_header),
        ("header", "even", sect_spec.header_even_ref, section.even_page_header),
        ("footer", "default", sect_spec.footer_default_ref, section.footer),
        ("footer", "first", sect_spec.footer_first_ref, section.first_page_footer),
        ("footer", "even", sect_spec.footer_even_ref, section.even_page_footer),
    ]
    for kind, position, ref, target in targets:
        if not ref:
            continue
        path = section_part_path(user_id, job_id, section_idx, kind, position)
        if not path.exists():
            continue
        target.is_linked_to_previous = False
        _apply_preserved_part(target.part.element, path.read_bytes())

    # python-docx 가 even/odd 헤더 사용을 settings.xml 에 켜주지 않으므로, even 이
    # 있으면 evenAndOddHeaders 옵션을 직접 설정.
    if has_even:
        try:
            settings = section.part.package.parts
            for p in settings:
                if p.partname.endswith("/word/settings.xml"):
                    settings_root = p.element
                    qn_w = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
                    eaoh = settings_root.find(f"{qn_w}evenAndOddHeaders")
                    if eaoh is None:
                        etree.SubElement(settings_root, f"{qn_w}evenAndOddHeaders")
                    break
        except Exception:
            # 옵션 set 실패해도 본문 렌더는 안 막음.
            pass


def _add_paragraph_block(doc, block: Block, spec: StyleSpec) -> None:
    para = doc.add_paragraph(block.text or "")
    apply_paragraph_style(para, block.level, spec, alignment_override=block.alignment)


def _add_image_placeholder(doc, block: Block, spec: StyleSpec) -> None:
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
    para = doc.add_paragraph(caption)
    apply_paragraph_style(para, 0, spec)


def _emit_block(
    doc,
    block: Block,
    spec: StyleSpec,
    *,
    user_id: uuid.UUID | None,
    job_id: uuid.UUID | None,
) -> None:
    if block.kind == "paragraph":
        if block.raw_xml_ref and user_id is not None and job_id is not None:
            reembed_paragraph(doc, raw_ref=block.raw_xml_ref, user_id=user_id, job_id=job_id)
        else:
            _add_paragraph_block(doc, block, spec)
        return

    if block.caption:
        _add_caption_paragraph(doc, block.caption, spec)

    if block.kind == "table":
        if block.raw_ref and user_id is not None and job_id is not None:
            reembed_table(doc, raw_ref=block.raw_ref, user_id=user_id, job_id=job_id, spec=spec)
        else:
            para = doc.add_paragraph(block.markdown or "[표 원본 미보존]")
            apply_paragraph_style(para, 0, spec)
        return

    if block.kind == "image":
        _add_image_placeholder(doc, block, spec)
        return

    if block.kind == "field":
        _add_field_placeholder(doc, block, spec)
        return


def render_docx(
    outline: Outline,
    spec: StyleSpec,
    *,
    user_id: uuid.UUID | None = None,
    job_id: uuid.UUID | None = None,
) -> bytes:
    doc = Document()
    blocks = renumber(outline.blocks, spec)
    blocks_by_id = {b.id: b for b in blocks}

    sections = outline.sections or [_default_section_spec([b.id for b in blocks], spec)]

    for s_idx, sect_spec in enumerate(sections):
        if s_idx == 0:
            section = doc.sections[0]
        else:
            section = doc.add_section(WD_SECTION.NEW_PAGE)
        _apply_section_props(section, sect_spec)
        if user_id is not None and job_id is not None:
            _apply_preserved_headers_footers(section, sect_spec, s_idx, user_id, job_id)

        for block_id in sect_spec.block_ids:
            block = blocks_by_id.get(block_id)
            if block is None:
                continue
            _emit_block(doc, block, spec, user_id=user_id, job_id=job_id)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
