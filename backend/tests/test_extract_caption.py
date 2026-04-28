"""extract_caption.is_caption / pick_caption 단위 테스트."""

from app.parser.extract_caption import is_caption, pick_caption


def test_is_caption_korean_table():
    assert is_caption("표 1. 결과 요약") is True
    assert is_caption("표1.결과요약") is True  # 공백/마침표 변형
    assert is_caption("표 12: 비교") is True


def test_is_caption_korean_figure():
    assert is_caption("그림 1. 시스템 구조도") is True
    assert is_caption("[그림 3] 흐름") is True


def test_is_caption_english():
    assert is_caption("Table 1. Summary") is True
    assert is_caption("Figure 2: Architecture") is True
    assert is_caption("FIG. 4 — overview") is True


def test_is_caption_negative():
    assert is_caption("이건 본문 한 줄") is False
    assert is_caption("") is False
    assert is_caption("a" * 200) is False  # 너무 김
    # 캡션 키워드는 있지만 문장 전체에 묻혀 있으면 캡션으로 보지 않음
    assert is_caption("앞 문장에서 그림 1을 참고했다") is False


def test_pick_caption_prefers_after_then_before():
    blocks = ["문서", "표 1. 본 자료", "표 2. 다음 자료"]
    # idx=1 (after), idx=2 (further) 둘 다 캡션이지만 직후가 우선
    assert pick_caption(blocks, before="앞 문장", after="표 1. 본 자료") == "표 1. 본 자료"
    assert pick_caption(blocks, before="표 1. 본 자료", after="다음 본문") == "표 1. 본 자료"
    assert pick_caption(blocks, before="앞 문장", after="다음 본문") is None
