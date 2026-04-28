"""Outline / StyleSpec Pydantic 검증."""

import pytest
from pydantic import ValidationError

from app.domain.outline import Block, Outline
from app.domain.style_spec import StyleSpec


def test_paragraph_block_valid():
    b = Block(id="b-1", kind="paragraph", level=1, text="Intro", detected_by="word_style")
    assert b.level == 1


def test_paragraph_level_out_of_range():
    with pytest.raises(ValidationError):
        Block(id="b-1", kind="paragraph", level=6, text="x", detected_by="user")


def test_table_block_requires_markdown():
    b = Block(
        id="b-2",
        kind="table",
        level=0,
        markdown="| a |\n|---|\n| 1 |",
        caption="표 1",
        raw_ref="t-0",
    )
    assert b.markdown.startswith("|")


def test_outline_minimal():
    o = Outline(
        job_id="j-1",
        source_filename="r.docx",
        blocks=[Block(id="b-1", kind="paragraph", level=0, text="hi", detected_by="word_style")],
    )
    assert len(o.blocks) == 1


def test_style_spec_minimal():
    spec = StyleSpec.model_validate(
        {
            "fonts": {
                "body": {"korean": "맑은 고딕", "ascii": "Arial", "size_pt": 11},
                "heading": {
                    "h1": {"korean": "맑은 고딕", "ascii": "Arial", "size_pt": 16, "bold": True},
                    "h2": {"korean": "맑은 고딕", "ascii": "Arial", "size_pt": 14, "bold": True},
                    "h3": {"korean": "맑은 고딕", "ascii": "Arial", "size_pt": 12, "bold": True},
                    "h4": {"korean": "맑은 고딕", "ascii": "Arial", "size_pt": 11, "bold": True},
                    "h5": {"korean": "맑은 고딕", "ascii": "Arial", "size_pt": 10, "bold": True},
                },
            },
            "paragraph": {"line_spacing": 1.5, "alignment": "justify", "first_line_indent_pt": 0},
            "numbering": {"h1": "1.", "h2": "1.1.", "h3": "1.1.1.", "list": "decimal"},
            "table": {
                "border_color": "#000000",
                "border_width_pt": 0.5,
                "header_bg": "#D9D9D9",
                "header_bold": True,
                "cell_font_size_pt": 10,
            },
            "page": {
                "margin_top_mm": 25,
                "margin_bottom_mm": 25,
                "margin_left_mm": 25,
                "margin_right_mm": 25,
            },
        }
    )
    assert spec.fonts.body.korean == "맑은 고딕"


def test_block_subtype_warning_caption_refs_default_none_or_empty():
    """신규 필드는 모두 Optional/default — 기존 outline JSON 그대로 deserialize."""
    from app.domain.outline import Block

    b = Block(id="b-1", kind="paragraph", level=0)
    assert b.subtype is None
    assert b.warning is None
    assert b.caption_refs == []


def test_caption_ref_serialization_roundtrip():
    from app.domain.outline import Block, CaptionRef

    ref = CaptionRef(
        label_kind="figure",
        detected_number=2,
        target_block_id="b-abc12345",
        span=(10, 14),
    )
    b = Block(id="b-2", kind="paragraph", level=0, text="그림 2 참조", caption_refs=[ref])
    json_data = b.model_dump_json()
    restored = Block.model_validate_json(json_data)
    assert restored.caption_refs[0].label_kind == "figure"
    assert restored.caption_refs[0].span == (10, 14)


def test_detected_by_accepts_outline_level_and_based_on():
    from app.domain.outline import Block

    Block(id="b-3", kind="paragraph", level=2, detected_by="outline_level")
    Block(id="b-4", kind="paragraph", level=1, detected_by="based_on")


def test_stylespec_caption_block_defaults():
    from app.domain.style_spec import StyleSpec

    spec = StyleSpec.model_validate(
        {
            "fonts": {
                "body": {"korean": "맑은 고딕", "ascii": "Arial", "size_pt": 11},
                "heading": {
                    "h1": {"korean": "맑은 고딕", "ascii": "Arial", "size_pt": 16, "bold": True},
                    "h2": {"korean": "맑은 고딕", "ascii": "Arial", "size_pt": 14, "bold": True},
                    "h3": {"korean": "맑은 고딕", "ascii": "Arial", "size_pt": 12, "bold": True},
                    "h4": {"korean": "맑은 고딕", "ascii": "Arial", "size_pt": 11, "bold": True},
                    "h5": {"korean": "맑은 고딕", "ascii": "Arial", "size_pt": 10, "bold": True},
                },
            },
            "paragraph": {"line_spacing": 1.5, "alignment": "justify"},
            "numbering": {"h1": "1.", "h2": "1.1.", "h3": "1.1.1.", "list": "decimal"},
            "table": {
                "border_color": "#000000",
                "border_width_pt": 0.5,
                "header_bg": "#D9D9D9",
                "header_bold": True,
                "cell_font_size_pt": 10,
            },
            "page": {
                "margin_top_mm": 25,
                "margin_bottom_mm": 25,
                "margin_left_mm": 25,
                "margin_right_mm": 25,
            },
        }
    )
    assert spec.caption.figure_label == "그림"
    assert spec.caption.table_label == "표"
    assert spec.caption.separator == ". "
    assert spec.caption.placeholder_missing == "다운로드 후 추가"


def test_stylespec_note_block_defaults():
    from app.domain.style_spec import StyleSpec

    spec = StyleSpec.model_validate(
        {
            "fonts": {
                "body": {"korean": "맑은 고딕", "ascii": "Arial", "size_pt": 11},
                "heading": {
                    "h1": {"korean": "맑은 고딕", "ascii": "Arial", "size_pt": 16, "bold": True},
                    "h2": {"korean": "맑은 고딕", "ascii": "Arial", "size_pt": 14, "bold": True},
                    "h3": {"korean": "맑은 고딕", "ascii": "Arial", "size_pt": 12, "bold": True},
                    "h4": {"korean": "맑은 고딕", "ascii": "Arial", "size_pt": 11, "bold": True},
                    "h5": {"korean": "맑은 고딕", "ascii": "Arial", "size_pt": 10, "bold": True},
                },
            },
            "paragraph": {"line_spacing": 1.5, "alignment": "justify"},
            "numbering": {"h1": "1.", "h2": "1.1.", "h3": "1.1.1.", "list": "decimal"},
            "table": {
                "border_color": "#000000",
                "border_width_pt": 0.5,
                "header_bg": "#D9D9D9",
                "header_bold": True,
                "cell_font_size_pt": 10,
            },
            "page": {
                "margin_top_mm": 25,
                "margin_bottom_mm": 25,
                "margin_left_mm": 25,
                "margin_right_mm": 25,
            },
        }
    )
    assert spec.note.indent_pt == 18.0
    assert spec.note.italic is True
    assert spec.note.color == "#555555"
    assert spec.note.font_size_pt is None
