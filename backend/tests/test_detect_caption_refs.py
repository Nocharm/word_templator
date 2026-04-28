"""detect_caption_refs — 본문에서 캡션 참조 패턴 탐지."""

from app.domain.outline import Block
from app.parser.detect_caption_refs import attach_caption_refs


def _para(idx: int, text: str) -> Block:
    return Block(id=f"b-{idx}", kind="paragraph", level=0, text=text)


def _img(block_id: str, caption: str) -> Block:
    return Block(id=block_id, kind="image", level=0, caption=caption)


def _tbl(block_id: str, caption: str) -> Block:
    return Block(id=block_id, kind="table", level=0, caption=caption)


def test_simple_korean_reference_detected_and_mapped():
    blocks = [
        _img("img-1", "그림 1. 라벨"),
        _para(1, "위 그림 1 을 참조하라."),
    ]
    out = attach_caption_refs(blocks)
    refs = out[1].caption_refs
    assert len(refs) == 1
    assert refs[0].label_kind == "figure"
    assert refs[0].detected_number == 1
    assert refs[0].target_block_id == "img-1"
    assert refs[0].span == (2, 6)  # "그림 1" 위치 (0-indexed start, exclusive end)


def test_table_and_figure_in_one_paragraph():
    blocks = [
        _img("img-1", "그림 1. A"),
        _tbl("tbl-1", "표 1. B"),
        _para(1, "그림 1 과 표 1 을 함께 본다."),
    ]
    out = attach_caption_refs(blocks)
    refs = out[2].caption_refs
    assert {(r.label_kind, r.target_block_id) for r in refs} == {
        ("figure", "img-1"),
        ("table", "tbl-1"),
    }


def test_english_labels_detected():
    blocks = [
        _tbl("tbl-1", "Table 1: cost"),
        _para(1, "see Table 1 below"),
    ]
    out = attach_caption_refs(blocks)
    assert out[1].caption_refs[0].label_kind == "table"
    assert out[1].caption_refs[0].target_block_id == "tbl-1"


def test_unmatched_reference_target_is_none():
    blocks = [_para(1, "그림 99 가 어디?")]
    out = attach_caption_refs(blocks)
    assert out[0].caption_refs[0].target_block_id is None


def test_non_paragraph_blocks_skipped():
    blocks = [_img("img-1", "그림 1. A")]
    out = attach_caption_refs(blocks)
    assert out[0].caption_refs == []  # image 자신은 검사 안 함


def test_idempotent():
    blocks = [
        _img("img-1", "그림 1. A"),
        _para(1, "그림 1 참조"),
    ]
    once = attach_caption_refs(blocks)
    twice = attach_caption_refs(once)
    assert twice[1].caption_refs == once[1].caption_refs
