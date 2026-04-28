"""StyleSpec.table → <w:tbl> 패치 — 보더, 헤더 배경/볼드, 셀 폰트 사이즈."""

from docx.oxml.ns import qn
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
