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
