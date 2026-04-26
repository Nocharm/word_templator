"""parse_docx: .docx → Outline."""

import uuid
from pathlib import Path

from app.parser.parse_docx import parse_docx
from tests.fixtures.build_table_image_sample import build_sample_with_table_and_image

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def test_parse_simple_headings_and_body():
    outline = parse_docx(
        (FIXTURES / "sample_simple.docx").read_bytes(), filename="sample_simple.docx"
    )
    kinds = [b.kind for b in outline.blocks]
    levels = [b.level for b in outline.blocks if b.kind == "paragraph"]
    assert kinds.count("paragraph") == 4
    # H1, body, H2, body
    assert levels == [1, 0, 2, 0]
    assert outline.blocks[0].detected_by == "word_style"


def test_parse_heuristic_headings():
    outline = parse_docx(
        (FIXTURES / "sample_heuristic.docx").read_bytes(), filename="sample_heuristic.docx"
    )
    paras = [b for b in outline.blocks if b.kind == "paragraph"]
    assert paras[0].level == 1 and paras[0].detected_by == "heuristic"
    assert paras[2].level == 2 and paras[2].detected_by == "heuristic"


def test_parse_table_without_ids_emits_markdown_only():
    outline = parse_docx(
        (FIXTURES / "sample_with_table.docx").read_bytes(), filename="sample_with_table.docx"
    )
    table_blocks = [b for b in outline.blocks if b.kind == "table"]
    assert len(table_blocks) == 1
    # Phase 3: markdown 은 항상 생성, raw_ref 는 user_id/job_id 미지정 시 None.
    assert table_blocks[0].markdown is not None
    assert table_blocks[0].raw_ref is None


def test_parse_block_ids_are_unique():
    outline = parse_docx((FIXTURES / "sample_simple.docx").read_bytes(), filename="x.docx")
    ids = [b.id for b in outline.blocks]
    assert len(ids) == len(set(ids))


def test_parse_collapses_consecutive_empty_paragraphs():
    outline = parse_docx((FIXTURES / "sample_messy.docx").read_bytes(), filename="m.docx")
    paras = [b for b in outline.blocks if b.kind == "paragraph"]
    # consecutive empty 검사
    for i in range(len(paras) - 1):
        a_empty = not (paras[i].text or "").strip()
        b_empty = not (paras[i + 1].text or "").strip()
        assert not (a_empty and b_empty), f"consecutive empty at {i}"


def test_parse_extracts_alignment_for_centered_cover():
    outline = parse_docx((FIXTURES / "sample_messy.docx").read_bytes(), filename="m.docx")
    # 첫 paragraph는 가운데정렬 표지여야 함
    paras = [b for b in outline.blocks if b.kind == "paragraph"]
    assert paras[0].alignment == "center"


# Phase 3 — 표/이미지/캡션 통합 검증.


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
    assert not any(b.kind == "paragraph" and b.text == "표 1. 결과 요약" for b in outline.blocks)

    image = next(b for b in outline.blocks if b.kind == "image")
    assert image.raw_ref == "image-0"
    assert image.caption == "그림 1. 시스템 구조도"
    assert image.preview_url == f"/api/jobs/{job_id}/images/0"
    assert not any(
        b.kind == "paragraph" and b.text == "그림 1. 시스템 구조도" for b in outline.blocks
    )

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
