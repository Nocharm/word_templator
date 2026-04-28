"""Section (구역) 메타 — 페이지 방향/크기/머리말·꼬리말을 보존하기 위한 도메인 모델.

원본 .docx 의 `<w:sectPr>` 한 묶음이 SectionSpec 하나에 대응한다.
- orientation/page_size: `<w:pgSz>` 에서 추출.
- margins: `<w:pgMar>` 에서 추출 (twips → mm 변환).
- header/footer: `<w:headerReference>`/`<w:footerReference>` 로 참조되는 XML 파트를
  파싱 시 디스크에 저장하고 렌더 시 다시 출력 .docx 패키지에 주입한다.
- block_ids: 이 섹션에 속한 Block.id 의 순서 목록.
"""

from typing import Literal

from pydantic import BaseModel, Field

Orientation = Literal["portrait", "landscape"]
HeaderFooterPosition = Literal["default", "first", "even"]


class SectionSpec(BaseModel):
    id: str
    orientation: Orientation = "portrait"
    page_width_mm: float = 210.0
    page_height_mm: float = 297.0
    margin_top_mm: float = 25.4
    margin_bottom_mm: float = 25.4
    margin_left_mm: float = 25.4
    margin_right_mm: float = 25.4
    # 디스크에 저장된 header/footer XML 의 ref. 비어있으면 해당 위치에 헤더/푸터 없음.
    header_default_ref: str | None = None
    header_first_ref: str | None = None
    header_even_ref: str | None = None
    footer_default_ref: str | None = None
    footer_first_ref: str | None = None
    footer_even_ref: str | None = None
    # 이 섹션에 속한 Block.id 들 (입력 순서 그대로).
    block_ids: list[str] = Field(default_factory=list)
