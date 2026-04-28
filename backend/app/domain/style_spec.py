"""StyleSpec — 표준화 규칙 (변환 시 적용)."""

from typing import Literal

from pydantic import BaseModel, Field


class FontDef(BaseModel):
    korean: str
    ascii: str
    size_pt: float = Field(gt=0)
    bold: bool = False


class HeadingFonts(BaseModel):
    h1: FontDef
    h2: FontDef
    h3: FontDef
    h4: FontDef
    h5: FontDef


class FontsBlock(BaseModel):
    body: FontDef
    heading: HeadingFonts


class ParagraphBlock(BaseModel):
    line_spacing: float = Field(gt=0)
    alignment: Literal["left", "right", "center", "justify"]
    first_line_indent_pt: float = 0


class NumberingBlock(BaseModel):
    h1: str
    h2: str
    h3: str
    list: Literal["decimal", "bullet", "korean"]


class TableBlock(BaseModel):
    border_color: str
    border_width_pt: float
    header_bg: str
    header_bold: bool
    cell_font_size_pt: float


class PageBlock(BaseModel):
    margin_top_mm: float
    margin_bottom_mm: float
    margin_left_mm: float
    margin_right_mm: float


class CaptionBlock(BaseModel):
    """캡션 라벨/구분자/누락 placeholder."""

    figure_label: str = "그림"
    table_label: str = "표"
    separator: str = ". "
    placeholder_missing: str = "다운로드 후 추가"


class NoteBlock(BaseModel):
    """노트 단락(`subtype="note"`) 시각 스타일."""

    indent_pt: float = 18.0
    italic: bool = True
    color: str = "#555555"
    font_size_pt: float | None = None


class StyleSpec(BaseModel):
    fonts: FontsBlock
    paragraph: ParagraphBlock
    numbering: NumberingBlock
    table: TableBlock
    page: PageBlock
    caption: CaptionBlock = Field(default_factory=CaptionBlock)
    note: NoteBlock = Field(default_factory=NoteBlock)
