r"""표/이미지 블록의 캡션 자동 번호 부여.

- 캡션 없으면 `f"{label} {n}{sep}{placeholder}"` 합성.
- 있으면 사용자 제목으로 간주 — 기존 prefix 제거 후 위치 기반 prefix 재부여.
"""

import re

from app.domain.outline import Block
from app.domain.style_spec import StyleSpec

_PREFIX_RE = re.compile(
    r"^\s*\[?\s*(?:표|그림|TABLE|FIGURE|Table|Figure)\s*\]?\s*\d+\s*[.:\]\-—]?\s*"
)


def _strip_prefix(text: str) -> str:
    """기존 caption prefix 제거."""
    return _PREFIX_RE.sub("", text).strip()


def assign_caption_numbers(blocks: list[Block], *, spec: StyleSpec) -> list[Block]:
    """블록 리스트를 순회하며 이미지/표 캡션 자동 번호 부여.

    Args:
        blocks: 원본 Block 리스트
        spec: StyleSpec — caption.figure_label, table_label, separator, placeholder_missing 참조

    Returns:
        새로운 Block 리스트 (caption 업데이트됨)
    """
    fig_n = 0
    tbl_n = 0
    out: list[Block] = []

    for b in blocks:
        if b.kind == "image":
            fig_n += 1
            label = spec.caption.figure_label
            n = fig_n
        elif b.kind == "table":
            tbl_n += 1
            label = spec.caption.table_label
            n = tbl_n
        else:
            out.append(b)
            continue

        sep = spec.caption.separator
        if b.caption and b.caption.strip():
            tail = _strip_prefix(b.caption) or spec.caption.placeholder_missing
        else:
            tail = spec.caption.placeholder_missing

        out.append(b.model_copy(update={"caption": f"{label} {n}{sep}{tail}"}))

    return out
