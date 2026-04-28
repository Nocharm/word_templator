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
    # 한 문단 안에 여러 필드가 섞여 있을 수 있어 (예: REF + PAGEREF) 우선순위로 분류.
    # TOC > PAGEREF > REF > unknown — 가장 구체적인 종류가 이김.
    heads: set[str] = set()
    for instr in _instr_texts(paragraph):
        head = instr.strip().split()[0].upper() if instr.strip() else ""
        if head:
            heads.add(head)
    if "TOC" in heads:
        return "toc"
    if "PAGEREF" in heads:
        return "pageref"
    if "REF" in heads:
        return "ref"
    return "unknown"


def extract_field_preview(paragraph: Paragraph) -> str | None:
    """필드 표시 텍스트 — 사용자에게 보여줄 한 줄 미리보기.

    paragraph.text 는 fldSimple 내부의 <w:t> 를 누락하므로, 모든 <w:t> 를 직접 모은다.
    """
    if not paragraph_has_field(paragraph):
        return None
    p_el = paragraph._p
    parts: list[str] = []
    for t in p_el.findall(f".//{qn('w:t')}"):
        if t.text:
            parts.append(t.text)
    text = "".join(parts).strip()
    return text or None


def extract_bookmarks(paragraph: Paragraph) -> list[dict[str, str]]:
    p_el = paragraph._p
    out: list[dict[str, str]] = []
    for bm in p_el.findall(f".//{qn('w:bookmarkStart')}"):
        bm_id = bm.get(qn("w:id")) or ""
        name = bm.get(qn("w:name")) or ""
        out.append({"id": bm_id, "name": name})
    return out


def clone_paragraph_xml(paragraph: Paragraph) -> bytes:
    el = deepcopy(paragraph._p)
    return etree.tostring(el, xml_declaration=False, encoding="utf-8")
