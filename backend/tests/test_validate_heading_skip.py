"""validate_heading_skip — heading 2단계 이상 점프 마킹."""

from app.domain.outline import Block
from app.parser.validate_heading_skip import mark_heading_skips


def _h(level: int, idx: int) -> Block:
    return Block(id=f"b-{idx}", kind="paragraph", level=level, text=f"H{level} #{idx}")


def test_no_skip_no_warning():
    blocks = [_h(1, 1), _h(2, 2), _h(3, 3), _h(2, 4)]
    out = mark_heading_skips(blocks)
    assert all(b.warning is None for b in out)


def test_h1_to_h3_marked_as_skip():
    blocks = [_h(1, 1), _h(3, 2)]
    out = mark_heading_skips(blocks)
    assert out[0].warning is None
    assert out[1].warning == "heading_skip"


def test_first_heading_above_h1_marked():
    """문서 시작이 곧바로 H2 면 스킵 (H0=body 기준 +2)."""
    blocks = [_h(2, 1)]
    out = mark_heading_skips(blocks)
    assert out[0].warning == "heading_skip"


def test_body_blocks_unaffected():
    body = Block(id="b-x", kind="paragraph", level=0, text="평문")
    blocks = [_h(1, 1), body, _h(2, 2)]
    out = mark_heading_skips(blocks)
    assert out[1].warning is None  # body 는 검사 대상 아님
    assert out[2].warning is None  # 직전 heading 은 H1, 차이 1 → OK


def test_does_not_mutate_input():
    blocks = [_h(1, 1), _h(3, 2)]
    out = mark_heading_skips(blocks)
    assert blocks[1].warning is None  # 원본은 그대로
    assert out[1].warning == "heading_skip"
