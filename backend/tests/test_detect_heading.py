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
