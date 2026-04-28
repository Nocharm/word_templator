"""inject_caption_fields — SEQ/REF OOXML 헬퍼 단위."""

from lxml import etree

from app.renderer.inject_caption_fields import (
    bookmark_id_for,
    build_caption_paragraph_xml,
    build_ref_run_xml,
)

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W_NS}
SEP_XPATH = (
    "//w:r[w:fldChar[@w:fldCharType='separate']]"
    "/following-sibling::w:r[1]/w:t/text()"
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

    bm = root.findall(".//w:bookmarkStart", NS)
    assert len(bm) == 1
    assert bm[0].get(f"{{{W_NS}}}name") == "_Ref_figure_img-abcdef12"

    instr = root.findall(".//w:instrText", NS)
    assert any("SEQ Figure" in (e.text or "") for e in instr)

    cached = root.xpath(SEP_XPATH, namespaces=NS)
    assert cached == ["3"]


def test_ref_run_xml_points_to_bookmark():
    xml = build_ref_run_xml(
        label_kind="table",
        block_id="tbl-12345678",
        cached_number=2,
        prefix_text="표 ",
    )
    wrapper = b"<root xmlns:w='" + W_NS.encode() + b"'>" + xml + b"</root>"
    root = etree.fromstring(wrapper)

    instr = root.findall(".//w:instrText", NS)
    assert any("REF _Ref_table_tbl-12345678" in (e.text or "") for e in instr)

    cached = root.xpath(SEP_XPATH, namespaces=NS)
    assert cached == ["2"]
