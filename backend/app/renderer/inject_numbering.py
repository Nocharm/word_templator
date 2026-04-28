"""Heading 번호 prefix를 텍스트에 직접 부여 (Phase 1 minimum).

진짜 numbering.xml 주입은 Phase 2에서 정밀화. Phase 1에서는
`numbering` 스펙의 prefix를 H1/H2/H3 텍스트 앞에 붙여 동일 효과.
"""

import re

from app.domain.outline import Block
from app.domain.style_spec import StyleSpec

_RE_LEADING_NUMBER = re.compile(r"^\d+(\.\d+)*\.\s*")


def renumber(blocks: list[Block], spec: StyleSpec) -> list[Block]:
    counters = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    out: list[Block] = []
    for b in blocks:
        if b.kind != "paragraph" or b.level == 0:
            out.append(b)
            continue
        counters[b.level] += 1
        # 하위 카운터 리셋
        for lvl in range(b.level + 1, 6):
            counters[lvl] = 0

        # `1.` / `1.1.` / `1.1.1.` / `1.1.1.1.` / `1.1.1.1.1.` 자리에 카운터 채우기
        if b.level == 1:
            prefix = f"{counters[1]}."
        elif b.level == 2:
            prefix = f"{counters[1]}.{counters[2]}."
        elif b.level == 3:
            prefix = f"{counters[1]}.{counters[2]}.{counters[3]}."
        elif b.level == 4:
            prefix = f"{counters[1]}.{counters[2]}.{counters[3]}.{counters[4]}."
        else:  # level == 5
            prefix = f"{counters[1]}.{counters[2]}.{counters[3]}.{counters[4]}.{counters[5]}."

        original = b.text or ""
        cleaned = _RE_LEADING_NUMBER.sub("", original)
        new_text = f"{prefix} {cleaned}".strip()
        out.append(b.model_copy(update={"text": new_text}))
    return out
