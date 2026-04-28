"""본문 paragraph 텍스트에서 캡션 참조 후보(`그림 N`, `표 N`, `Figure N`, `Table N`) 탐지.

`Block.caption_refs` 에 (label_kind, detected_number, target_block_id, span) 부착.
target_block_id 는 같은 outline 내에서 동일 (label_kind, n) 의 캡션 블록 id.
매핑 실패면 None — 출력 시 평문으로 남김.
"""

import re

from app.domain.outline import Block, CaptionLabelKind, CaptionRef

_REF_RE = re.compile(r"(표|그림|Figure|Table)\s*(\d+)")

_LABEL_TO_KIND: dict[str, CaptionLabelKind] = {
    "표": "table",
    "그림": "figure",
    "Figure": "figure",
    "Table": "table",
}


def _build_caption_index(blocks: list[Block]) -> dict[tuple[str, int], str]:
    """캡션 prefix 기반으로 (kind, n) → block.id 인덱스 만들기.

    assign_caption_numbers 가 표준 prefix 를 박아둔 상태를 가정.
    """
    idx: dict[tuple[str, int], str] = {}
    label_kind_re = re.compile(r"^\s*(표|그림|Figure|Table)\s*(\d+)")
    for b in blocks:
        if b.kind not in ("image", "table"):
            continue
        if not b.caption:
            continue
        m = label_kind_re.match(b.caption)
        if not m:
            continue
        kind = _LABEL_TO_KIND[m.group(1)]
        n = int(m.group(2))
        idx.setdefault((kind, n), b.id)
    return idx


def attach_caption_refs(blocks: list[Block]) -> list[Block]:
    """각 paragraph block 의 텍스트에서 캡션 참조 탐지 후 caption_refs 부착."""
    cap_index = _build_caption_index(blocks)
    out: list[Block] = []
    for b in blocks:
        if b.kind != "paragraph" or not b.text:
            out.append(b)
            continue

        refs: list[CaptionRef] = []
        for m in _REF_RE.finditer(b.text):
            kind = _LABEL_TO_KIND[m.group(1)]
            n = int(m.group(2))
            target = cap_index.get((kind, n))
            refs.append(
                CaptionRef(
                    label_kind=kind,
                    detected_number=n,
                    target_block_id=target,
                    span=(m.start(), m.end()),
                )
            )
        out.append(b.model_copy(update={"caption_refs": refs}))
    return out
