"""assign_caption_numbers — 누락 캡션 합성 + 사용자 제목 정규화."""

from app.domain.outline import Block
from app.domain.style_spec import StyleSpec
from app.parser.assign_caption_numbers import assign_caption_numbers


def _img(idx: int, caption: str | None = None) -> Block:
    return Block(id=f"img-{idx}", kind="image", level=0, caption=caption)


def _tbl(idx: int, caption: str | None = None) -> Block:
    return Block(id=f"tbl-{idx}", kind="table", level=0, caption=caption)


def _spec() -> StyleSpec:
    """StyleSpec 인스턴스 — 다른 *Block 필드는 default 로 채움."""
    return StyleSpec.model_validate(
        {
            "fonts": {
                "body": {
                    "korean": "맑은 고딕",
                    "ascii": "Arial",
                    "size_pt": 11,
                },
                "heading": {
                    "h1": {
                        "korean": "맑은 고딕",
                        "ascii": "Arial",
                        "size_pt": 16,
                        "bold": True,
                    },
                    "h2": {
                        "korean": "맑은 고딕",
                        "ascii": "Arial",
                        "size_pt": 14,
                        "bold": True,
                    },
                    "h3": {
                        "korean": "맑은 고딕",
                        "ascii": "Arial",
                        "size_pt": 12,
                        "bold": True,
                    },
                    "h4": {
                        "korean": "맑은 고딕",
                        "ascii": "Arial",
                        "size_pt": 11,
                        "bold": True,
                    },
                    "h5": {
                        "korean": "맑은 고딕",
                        "ascii": "Arial",
                        "size_pt": 10,
                        "bold": True,
                    },
                },
            },
            "paragraph": {
                "line_spacing": 1.5,
                "alignment": "justify",
                "first_line_indent_pt": 0,
            },
            "numbering": {
                "h1": "1.",
                "h2": "1.1.",
                "h3": "1.1.1.",
                "list": "decimal",
            },
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


def test_missing_caption_synthesized_with_placeholder():
    spec = _spec()
    blocks = [_img(1), _tbl(1)]
    out = assign_caption_numbers(blocks, spec=spec)
    assert out[0].caption == "그림 1. 다운로드 후 추가"
    assert out[1].caption == "표 1. 다운로드 후 추가"


def test_user_title_preserved_with_normalized_prefix():
    spec = _spec()
    blocks = [_img(1, caption="장비 설치도")]
    out = assign_caption_numbers(blocks, spec=spec)
    assert out[0].caption == "그림 1. 장비 설치도"


def test_user_title_already_prefixed_is_normalized():
    """사용자가 이미 '그림 5. 라벨' 처럼 적었으면 prefix 만 위치 기반으로 교체."""
    spec = _spec()
    blocks = [_img(1, caption="그림 99. 잘못된 번호")]
    out = assign_caption_numbers(blocks, spec=spec)
    assert out[0].caption == "그림 1. 잘못된 번호"


def test_figure_and_table_counters_independent():
    spec = _spec()
    blocks = [_img(1), _tbl(1), _img(2), _tbl(2)]
    out = assign_caption_numbers(blocks, spec=spec)
    assert out[0].caption == "그림 1. 다운로드 후 추가"
    assert out[1].caption == "표 1. 다운로드 후 추가"
    assert out[2].caption == "그림 2. 다운로드 후 추가"
    assert out[3].caption == "표 2. 다운로드 후 추가"


def test_non_table_image_blocks_unaffected():
    spec = _spec()
    body = Block(id="b-1", kind="paragraph", level=0, text="본문")
    out = assign_caption_numbers([body, _img(1)], spec=spec)
    assert out[0].caption is None
    assert out[1].caption == "그림 1. 다운로드 후 추가"


def test_custom_labels_via_stylespec():
    """StyleSpec 의 custom caption settings 로 라벨/구분자 오버라이드."""
    from app.domain.style_spec import CaptionBlock

    spec = _spec()
    spec = spec.model_copy(
        update={
            "caption": CaptionBlock(
                figure_label="Figure",
                table_label="Table",
                separator=": ",
                placeholder_missing="다운로드 후 추가",
            )
        }
    )
    out = assign_caption_numbers([_img(1, caption="diagram")], spec=spec)
    assert out[0].caption == "Figure 1: diagram"
