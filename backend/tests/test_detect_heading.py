"""헤딩 감지 단계적 폴백 (R3)."""

from dataclasses import dataclass, field

from app.parser.detect_heading import detect_level


@dataclass
class FakeRun:
    bold: bool = False
    font_size_pt: float | None = None


@dataclass
class FakeStyle:
    name: str = "Normal"


@dataclass
class FakeParagraph:
    text: str = ""
    style: FakeStyle = field(default_factory=FakeStyle)
    runs: list[FakeRun] = field(default_factory=list)


def test_word_heading_1():
    p = FakeParagraph(text="개요", style=FakeStyle(name="Heading 1"))
    assert detect_level(p) == (1, "word_style")


def test_korean_heading_2():
    p = FakeParagraph(text="배경", style=FakeStyle(name="제목 2"))
    assert detect_level(p) == (2, "word_style")


def test_heuristic_decimal_h1_with_bold():
    p = FakeParagraph(text="1. 개요", runs=[FakeRun(bold=True, font_size_pt=14)])
    assert detect_level(p) == (1, "heuristic")


def test_heuristic_dotted_h2():
    p = FakeParagraph(text="1.1. 배경")
    assert detect_level(p) == (2, "heuristic")


def test_heuristic_korean_h2():
    p = FakeParagraph(text="가. 항목")
    assert detect_level(p) == (2, "heuristic")


def test_fallback_body():
    p = FakeParagraph(text="본문 내용입니다.")
    assert detect_level(p) == (0, "heuristic")


def test_paren_number_h2():
    p = FakeParagraph(text="(1) 첫 번째 항목")
    assert detect_level(p) == (2, "heuristic")


def test_closing_paren_number_h2():
    p = FakeParagraph(text="1) 첫 번째 항목")
    assert detect_level(p) == (2, "heuristic")


def test_circled_number_h3():
    p = FakeParagraph(text="① 첫 번째 항목")
    assert detect_level(p) == (3, "heuristic")


def test_star_wrapped_h1():
    p = FakeParagraph(text="*** 결론 ***")
    assert detect_level(p) == (1, "heuristic")


def test_bare_number_with_bold_h1():
    p = FakeParagraph(text="3 향후 개선", runs=[FakeRun(bold=True)])
    assert detect_level(p) == (1, "heuristic")


def test_bare_number_without_bold_stays_body():
    p = FakeParagraph(text="3 향후 개선")
    assert detect_level(p) == (0, "heuristic")


def test_cover_detection_first_paragraph_centered_large_bold():
    from dataclasses import dataclass, field

    @dataclass
    class FakePF:
        alignment: int = 1  # CENTER

    @dataclass
    class FakePCover:
        text: str = "2026 사내 워크숍 결과 보고서"
        style: FakeStyle = field(default_factory=FakeStyle)
        runs: list[FakeRun] = field(default_factory=list)
        paragraph_format: FakePF = field(default_factory=FakePF)

    p = FakePCover(runs=[FakeRun(bold=True, font_size_pt=22)])
    assert detect_level(p, paragraph_index=0) == (1, "heuristic")


def test_word_heading_4():
    p = FakeParagraph(text="섹션", style=FakeStyle(name="Heading 4"))
    assert detect_level(p) == (4, "word_style")


def test_korean_heading_5():
    p = FakeParagraph(text="섹션", style=FakeStyle(name="제목 5"))
    assert detect_level(p) == (5, "word_style")


def test_heuristic_h4_decimal():
    p = FakeParagraph(text="1.1.1.1. 항목")
    assert detect_level(p) == (4, "heuristic")


def test_heuristic_h5_decimal():
    p = FakeParagraph(text="1.1.1.1.1. 항목")
    assert detect_level(p) == (5, "heuristic")


def test_cover_detection_misses_after_5_paragraphs():
    from dataclasses import dataclass, field

    @dataclass
    class FakePF:
        alignment: int = 1

    @dataclass
    class FakePCover:
        text: str = "Late centered title"
        style: FakeStyle = field(default_factory=FakeStyle)
        runs: list[FakeRun] = field(default_factory=list)
        paragraph_format: FakePF = field(default_factory=FakePF)

    p = FakePCover(runs=[FakeRun(bold=True, font_size_pt=22)])
    # paragraph 6 -> outside cover window
    assert detect_level(p, paragraph_index=6) == (0, "heuristic")


def test_title_style_maps_to_level_1():
    p = FakeParagraph(text="표지 제목", style=FakeStyle(name="Title"))
    level, by = detect_level(p, paragraph_index=0)
    assert level == 1
    assert by == "word_style"


def test_subtitle_style_maps_to_level_2():
    p = FakeParagraph(text="부제", style=FakeStyle(name="Subtitle"))
    level, by = detect_level(p, paragraph_index=1)
    assert level == 2
    assert by == "word_style"


def test_outline_level_takes_precedence_over_heuristic():
    """w:outlineLvl 값이 박혀있으면 휴리스틱보다 우선."""

    class _Style:
        name = "회사커스텀_큰제목"  # _WORD_HEADING 매칭 안 됨

    class _PF:
        alignment = None

    class _Para:
        style = _Style()
        text = "본문같은 평범한 텍스트"  # 휴리스틱도 매칭 안 됨
        runs = []
        paragraph_format = _PF()
        # outline_level 은 별도 헬퍼로 읽음 (아래 _resolve_outline_level)
        _outline_level = 1  # 0=H1 → level 2

    level, by = detect_level(_Para(), paragraph_index=10)
    assert level == 2
    assert by == "outline_level"


def test_based_on_chain_resolves_to_heading_level():
    """사용자 정의 스타일이 Heading 1 을 base 로 가지면 level 1."""
    from app.parser.detect_heading import detect_level

    class _Heading1:
        name = "Heading 1"
        base_style = None

    class _CompanyHeading:
        name = "회사_제목스타일"  # alias dict 에 없음
        base_style = _Heading1()

    class _PF:
        alignment = None

    class _Para:
        style = _CompanyHeading()
        text = "큰 제목"
        runs = []
        paragraph_format = _PF()

    level, by = detect_level(_Para(), paragraph_index=2)
    assert level == 1
    assert by == "based_on"


def test_based_on_chain_handles_cycle():
    """무한 루프 방지 — 같은 객체 재방문 시 None."""
    from app.parser.detect_heading import _resolve_via_based_on

    class _Cyclic:
        name = "weird"

    a = _Cyclic()
    a.base_style = a  # self-cycle
    assert _resolve_via_based_on(a) is None
