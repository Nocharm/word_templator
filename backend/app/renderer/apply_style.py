"""StyleSpec을 docx 요소에 적용하는 헬퍼."""

from docx.oxml.ns import qn
from docx.shared import Pt
from docx.text.paragraph import Paragraph
from docx.text.run import Run
from lxml import etree

from app.domain.style_spec import FontDef, StyleSpec


def _set_run_fonts(run: Run, font: FontDef) -> None:
    """w:rFonts에 ascii/hAnsi/eastAsia 모두 설정 (R2)."""
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = etree.SubElement(rPr, qn("w:rFonts"))
    rFonts.set(qn("w:ascii"), font.ascii)
    rFonts.set(qn("w:hAnsi"), font.ascii)
    rFonts.set(qn("w:eastAsia"), font.korean)
    run.font.size = Pt(font.size_pt)
    if font.bold:
        run.font.bold = True


def _set_paragraph_spacing(para: Paragraph, line_spacing: float) -> None:
    para.paragraph_format.line_spacing = line_spacing


def apply_paragraph_style(
    para: Paragraph,
    level: int,
    spec: StyleSpec,
    *,
    alignment_override: str | None = None,
) -> None:
    if level == 0:
        font = spec.fonts.body
    elif level == 1:
        font = spec.fonts.heading.h1
    elif level == 2:
        font = spec.fonts.heading.h2
    elif level == 3:
        font = spec.fonts.heading.h3
    elif level == 4:
        font = spec.fonts.heading.h4
    elif level == 5:
        font = spec.fonts.heading.h5
    else:
        font = spec.fonts.body

    _set_paragraph_spacing(para, spec.paragraph.line_spacing)
    para.paragraph_format.first_line_indent = Pt(spec.paragraph.first_line_indent_pt)
    align_map = {
        "left": 0,  # WD_PARAGRAPH_ALIGNMENT.LEFT
        "right": 2,
        "center": 1,
        "justify": 3,
    }
    chosen = alignment_override if alignment_override is not None else spec.paragraph.alignment
    para.paragraph_format.alignment = align_map[chosen]

    for run in para.runs:
        _set_run_fonts(run, font)
