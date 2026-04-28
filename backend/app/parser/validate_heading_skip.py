"""직전 heading 보다 2단계 이상 깊은 단락에 warning 마킹.

자동 보정하지 않음 — 원본 의도를 보존하고, 사용자가 빠른 수정 버튼으로 결정한다.
"""

from app.domain.outline import Block


def mark_heading_skips(blocks: list[Block]) -> list[Block]:
    """Mark any heading that jumps >1 level from the previous heading as 'heading_skip'."""
    out: list[Block] = []
    prev_heading_level = 0
    for b in blocks:
        if b.kind == "paragraph" and 1 <= b.level <= 5:
            if b.level - prev_heading_level > 1:
                out.append(b.model_copy(update={"warning": "heading_skip"}))
            else:
                out.append(b)
            prev_heading_level = b.level
        else:
            out.append(b)
    return out
