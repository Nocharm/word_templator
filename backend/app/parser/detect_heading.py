"""제목 레벨 감지 — (a) Word 스타일 → (a2) outline level → (b) 휴리스틱 → (c=0, body 폴백).

(c) 사용자 마킹은 프론트에서 처리되므로 파서 단계에선 noop.
"""

import re
from typing import Any, Literal

DetectedBy = Literal["word_style", "outline_level", "based_on", "heuristic"]

_WORD_HEADING = {
    "Heading 1": 1,
    "제목 1": 1,
    "Heading 2": 2,
    "제목 2": 2,
    "Heading 3": 3,
    "제목 3": 3,
    "Heading 4": 4,
    "제목 4": 4,
    "Heading 5": 5,
    "제목 5": 5,
    "Title": 1,
    "Subtitle": 2,
}

_RE_H1_DECIMAL = re.compile(r"^\d+\.\s")
_RE_H2_DECIMAL = re.compile(r"^\d+\.\d+\.\s")
_RE_H3_DECIMAL = re.compile(r"^\d+\.\d+\.\d+\.\s")
_RE_H4_DECIMAL = re.compile(r"^\d+\.\d+\.\d+\.\d+\.\s")
_RE_H5_DECIMAL = re.compile(r"^\d+\.\d+\.\d+\.\d+\.\d+\.\s")
_RE_KOREAN_LETTER = re.compile(r"^[가-힣]\.\s")

_RE_PAREN_NUM = re.compile(r"^\(\d+\)\s")  # (1) 텍스트
_RE_CLOSING_PAREN_NUM = re.compile(r"^\d+\)\s")  # 1) 텍스트
_RE_CIRCLED_NUM = re.compile(r"^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]\s")
_RE_STAR_WRAPPED = re.compile(r"^\*{2,}\s*[^*]+?\s*\*{2,}$")  # *** 결론 ***
_RE_BARE_NUMBER = re.compile(r"^\d+\s+\S")  # 점 없는 "1 본문"


def _is_bold_or_large(paragraph: Any) -> bool:
    runs = getattr(paragraph, "runs", []) or []
    for r in runs:
        if getattr(r, "bold", False):
            return True
        # 테스트용 FakeRun
        size = getattr(r, "font_size_pt", None)
        if size is not None and size >= 13:
            return True
        # 실제 docx.Run
        font = getattr(r, "font", None)
        real_size = getattr(font, "size", None) if font is not None else None
        if real_size is not None and real_size.pt >= 13:
            return True
    return False


def _has_bold(paragraph: Any) -> bool:
    runs = getattr(paragraph, "runs", []) or []
    for r in runs:
        if getattr(r, "bold", False):
            return True
    return False


def _is_centered(paragraph: Any) -> bool:
    # WD_PARAGRAPH_ALIGNMENT.CENTER = 1
    align = (
        getattr(paragraph.paragraph_format, "alignment", None)
        if hasattr(paragraph, "paragraph_format")
        else None
    )
    return align == 1


def _is_very_large(paragraph: Any) -> bool:
    """18pt 이상 폰트가 하나라도 있으면 True — 표지 제목 감지용."""
    runs = getattr(paragraph, "runs", []) or []
    for r in runs:
        # FakeRun
        size = getattr(r, "font_size_pt", None)
        if size is not None and size >= 18:
            return True
        # 진짜 docx.Run
        font = getattr(r, "font", None)
        real = getattr(font, "size", None) if font is not None else None
        if real is not None and real.pt >= 18:
            return True
    return False


def _resolve_outline_level(paragraph: Any) -> int | None:
    """`w:pPr/w:outlineLvl` 값을 읽어서 1..5 로 매핑. 없으면 None.

    테스트용 FakeParagraph 는 `_outline_level` 속성으로 우회.
    실제 docx.Paragraph 는 OOXML 직접 조회.
    """
    fake = getattr(paragraph, "_outline_level", None)
    if fake is not None:
        return min(int(fake) + 1, 5)

    p = getattr(paragraph, "_p", None)
    if p is None:
        return None
    from docx.oxml.ns import qn

    pPr = p.find(qn("w:pPr"))
    if pPr is None:
        return None
    olvl = pPr.find(qn("w:outlineLvl"))
    if olvl is None:
        return None
    val = olvl.get(qn("w:val"))
    if val is None:
        return None
    try:
        return min(int(val) + 1, 5)
    except (TypeError, ValueError):
        return None


def _resolve_via_based_on(style: Any) -> int | None:
    """style.base_style 체인을 따라가며 _WORD_HEADING 매칭 시도.

    무한 루프 방지: 방문 객체 id 기록.
    """
    seen: set[int] = set()
    cur = getattr(style, "base_style", None)
    while cur is not None and id(cur) not in seen:
        seen.add(id(cur))
        name = getattr(cur, "name", "")
        if name in _WORD_HEADING:
            return _WORD_HEADING[name]
        cur = getattr(cur, "base_style", None)
    return None


def detect_level(paragraph: Any, *, paragraph_index: int | None = None) -> tuple[int, DetectedBy]:
    # (a) Word 빌트인 스타일
    style_name = getattr(paragraph.style, "name", "")
    if style_name in _WORD_HEADING:
        return _WORD_HEADING[style_name], "word_style"

    # (a2) outline level — 명시적 신호
    olvl = _resolve_outline_level(paragraph)
    if olvl is not None and 1 <= olvl <= 5:
        return olvl, "outline_level"

    # (a3) basedOn 체인 — 사용자 정의 스타일이 Heading N 상속
    via_base = _resolve_via_based_on(paragraph.style)
    if via_base is not None:
        return via_base, "based_on"

    text = (paragraph.text or "").strip()

    # 빈 문단은 그대로 body
    if not text:
        return 0, "heuristic"

    # 표지 감지 — 문서 첫 5문단 안 + 가운데 정렬 + 매우 큰 폰트 + bold
    if (
        paragraph_index is not None
        and paragraph_index < 5
        and _is_centered(paragraph)
        and _is_very_large(paragraph)
        and _has_bold(paragraph)
    ):
        return 1, "heuristic"

    # (b) 휴리스틱 — 가장 구체적인 패턴부터 (긴 패턴 우선)
    if _RE_STAR_WRAPPED.match(text):
        return 1, "heuristic"
    if _RE_H5_DECIMAL.match(text):
        return 5, "heuristic"
    if _RE_H4_DECIMAL.match(text):
        return 4, "heuristic"
    if _RE_H3_DECIMAL.match(text):
        return 3, "heuristic"
    if _RE_H2_DECIMAL.match(text):
        return 2, "heuristic"
    if _RE_H1_DECIMAL.match(text) and _is_bold_or_large(paragraph):
        return 1, "heuristic"
    if _RE_CIRCLED_NUM.match(text):
        return 3, "heuristic"
    if _RE_PAREN_NUM.match(text):
        return 2, "heuristic"
    if _RE_CLOSING_PAREN_NUM.match(text):
        return 2, "heuristic"
    if _RE_KOREAN_LETTER.match(text):
        return 2, "heuristic"
    if _RE_BARE_NUMBER.match(text) and _is_bold_or_large(paragraph):
        return 1, "heuristic"

    # (c) 폴백 = body
    return 0, "heuristic"
