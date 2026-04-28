"""표/이미지 캡션 휴리스틱 — 인접 문단을 검사해 캡션 여부 판정."""

import re

# 캡션 패턴: 시작 토큰이 키워드 + 숫자 + 구분자(. : —). 짧은 한 문장.
_CAPTION_RE = re.compile(
    r"""^\s*
        \[?\s*
        (?:표|그림|TABLE|FIGURE|FIG\.?|Table|Figure)
        \s*\]?\s*
        \d+\s*
        [.:\]\-—]?\s*
        \S
    """,
    re.VERBOSE,
)

_MAX_LEN = 120  # 너무 긴 문단은 캡션으로 보지 않음


def is_caption(text: str | None) -> bool:
    if not text:
        return False
    s = text.strip()
    if not s or len(s) > _MAX_LEN:
        return False
    return bool(_CAPTION_RE.match(s))


def pick_caption(_neighbors: list[str], *, before: str | None, after: str | None) -> str | None:
    """직후 문단을 우선 검사하고, 그래도 없으면 직전 문단을 본다.

    `_neighbors` 는 디버깅 편의를 위해 받아두고 향후 확장 여지로 남김 — 현재는 사용하지 않음.
    """
    if is_caption(after):
        return after.strip() if after else None
    if is_caption(before):
        return before.strip() if before else None
    return None
