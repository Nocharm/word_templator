"""원본 .docx 의 `<w:sectPr>` 추출 — 페이지 방향/크기/마진/머리말·꼬리말.

Word 의 섹션 구조:
- 본문 안에 0개 이상의 `<w:p>` 가 `<w:pPr>/<w:sectPr>` 를 품고 있으면 그 단락이
  해당 섹션의 마지막이 된다.
- 그리고 `<w:body>` 의 마지막 자식은 항상 `<w:sectPr>` (마지막 섹션의 속성).

따라서 등장 순서대로 sectPr 를 모으면 섹션 N개가 된다.
"""

import uuid
from typing import Any

from docx.document import Document as DocxDocument
from docx.oxml.ns import qn

from app.domain.outline import Block
from app.domain.section import HeaderFooterPosition, Orientation, SectionSpec
from app.storage.files import section_part_path

# Word 의 `<w:pgSz>` / `<w:pgMar>` 단위는 twips (1/20 pt). 1 mm = 56.6929 twips.
TWIPS_PER_MM = 56.6929

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
R_ID_ATTR = f"{{{R_NS}}}id"


def _twips_to_mm(twips: int) -> float:
    return round(twips / TWIPS_PER_MM, 2)


def _new_section_id() -> str:
    return f"s-{uuid.uuid4().hex[:8]}"


def collect_sectprs(doc: DocxDocument) -> list[Any]:
    """문서 내 모든 `<w:sectPr>` 를 등장 순서대로 반환."""
    body = doc.element.body
    # python-docx 의 BaseOxmlElement.xpath 는 자체 namespace map 을 사용 (`w:` prefix
    # 자동 해석) — namespaces= kwarg 받지 않음.
    return body.xpath(".//w:sectPr")


def find_section_break_positions(body: Any) -> list[int]:
    """본문 내 paragraph 위치 중 섹션 break 가 걸린 인덱스 목록.

    body 의 `<w:p>` / `<w:tbl>` 자식만 카운트한 0-based 인덱스. 본문 마지막 sectPr
    (paragraph 밖) 은 포함하지 않는다 — 그건 마지막 섹션 끝을 자동으로 의미.
    """
    positions: list[int] = []
    block_idx = -1
    for child in body.iterchildren():
        tag = child.tag
        if tag == qn("w:p") or tag == qn("w:tbl"):
            block_idx += 1
            if tag == qn("w:p"):
                ppr = child.find(qn("w:pPr"))
                if ppr is not None and ppr.find(qn("w:sectPr")) is not None:
                    positions.append(block_idx)
    return positions


def extract_section_props(sectpr_elem: Any) -> dict[str, Any]:
    """sectPr 요소에서 orientation/page size/margins 추출."""
    pgSz = sectpr_elem.find(qn("w:pgSz"))
    pgMar = sectpr_elem.find(qn("w:pgMar"))

    orientation: Orientation = "portrait"
    width_mm = 210.0
    height_mm = 297.0
    if pgSz is not None:
        if pgSz.get(qn("w:orient")) == "landscape":
            orientation = "landscape"
        w_twips = pgSz.get(qn("w:w"))
        h_twips = pgSz.get(qn("w:h"))
        if w_twips:
            width_mm = _twips_to_mm(int(w_twips))
        if h_twips:
            height_mm = _twips_to_mm(int(h_twips))

    margins = {"top": 25.4, "bottom": 25.4, "left": 25.4, "right": 25.4}
    if pgMar is not None:
        for side, attr in [
            ("top", "w:top"),
            ("bottom", "w:bottom"),
            ("left", "w:left"),
            ("right", "w:right"),
        ]:
            v = pgMar.get(qn(attr))
            if v:
                margins[side] = _twips_to_mm(int(v))

    return {
        "orientation": orientation,
        "page_width_mm": width_mm,
        "page_height_mm": height_mm,
        "margin_top_mm": margins["top"],
        "margin_bottom_mm": margins["bottom"],
        "margin_left_mm": margins["left"],
        "margin_right_mm": margins["right"],
    }


def extract_header_footer_refs(
    sectpr_elem: Any,
    doc: DocxDocument,
    *,
    section_idx: int,
    user_id: uuid.UUID | None,
    job_id: uuid.UUID | None,
) -> dict[str, str | None]:
    """sectPr 의 header/footerReference 를 따라 XML 파트를 디스크에 저장.

    user_id/job_id 가 없으면 디스크 IO 없이 빈 dict 반환.
    """
    refs: dict[str, str | None] = {}
    if user_id is None or job_id is None:
        return refs

    targets = [
        (qn("w:headerReference"), "header"),
        (qn("w:footerReference"), "footer"),
    ]
    for elem_tag, kind in targets:
        for ref in sectpr_elem.findall(elem_tag):
            position_raw = ref.get(qn("w:type"), "default")
            position: HeaderFooterPosition
            if position_raw == "first":
                position = "first"
            elif position_raw == "even":
                position = "even"
            else:
                position = "default"
            r_id = ref.get(R_ID_ATTR)
            if not r_id:
                continue
            try:
                part = doc.part.related_parts[r_id]
            except (KeyError, AttributeError):
                continue
            xml_bytes = part.blob
            out = section_part_path(user_id, job_id, section_idx, kind, position)
            out.write_bytes(xml_bytes)
            refs[f"{kind}_{position}_ref"] = f"{kind}_{section_idx}_{position}"
    return refs


def build_sections(
    doc: DocxDocument,
    blocks_with_body_seq: list[tuple[Block, int]],
    *,
    user_id: uuid.UUID | None,
    job_id: uuid.UUID | None,
) -> list[SectionSpec]:
    """sectPr 들을 SectionSpec 목록으로 변환하고 block_ids 를 분배.

    blocks_with_body_seq: (Block, body_child_seq) 페어 목록.
      body_child_seq 는 본문 안 paragraph/table 자식 인덱스. image paragraph 가
      여러 image block 을 낳는 경우 같은 seq 가 반복된다 — 섹션 분할은 seq 기준.
    """
    body = doc.element.body
    sectprs = collect_sectprs(doc)
    if not sectprs:
        return []

    break_positions = find_section_break_positions(body)
    # 본문 paragraph/table 자식 갯수.
    body_child_count = sum(1 for c in body.iterchildren() if c.tag in (qn("w:p"), qn("w:tbl")))
    last_seq = body_child_count - 1 if body_child_count > 0 else 0
    # 마지막 sectPr 는 body-level (paragraph 밖) 이라 break_positions 에 없음.
    boundaries = break_positions + [last_seq]

    if len(boundaries) != len(sectprs):
        # 비정상 (잘못 구성된 docx 등) — 마지막 sectPr 하나로 단일 섹션 fallback.
        props = extract_section_props(sectprs[-1])
        refs = extract_header_footer_refs(
            sectprs[-1], doc, section_idx=0, user_id=user_id, job_id=job_id
        )
        return [
            SectionSpec(
                id=_new_section_id(),
                block_ids=[b.id for b, _ in blocks_with_body_seq],
                **props,
                **refs,
            )
        ]

    sections: list[SectionSpec] = []
    prev_seq_exclusive = -1
    for idx, (sectpr, end_seq) in enumerate(zip(sectprs, boundaries, strict=False)):
        block_ids = [b.id for b, seq in blocks_with_body_seq if prev_seq_exclusive < seq <= end_seq]
        prev_seq_exclusive = end_seq
        props = extract_section_props(sectpr)
        refs = extract_header_footer_refs(
            sectpr, doc, section_idx=idx, user_id=user_id, job_id=job_id
        )
        sections.append(SectionSpec(id=_new_section_id(), block_ids=block_ids, **props, **refs))
    return sections
