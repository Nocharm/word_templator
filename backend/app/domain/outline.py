"""Outline JSON — Backend ↔ Frontend 계약."""

from typing import Literal

from pydantic import BaseModel, Field

from app.domain.section import SectionSpec

DetectedBy = Literal["word_style", "outline_level", "based_on", "heuristic", "user"]
BlockKind = Literal["paragraph", "table", "image", "field"]
FieldKind = Literal["ref", "toc", "pageref"]
Alignment = Literal["left", "right", "center", "justify"]
Subtype = Literal["body", "note"]
Warning = Literal["heading_skip"]
CaptionLabelKind = Literal["figure", "table"]


class CaptionRef(BaseModel):
    """본문 paragraph 안에서 정규식으로 탐지된 캡션 참조의 메타.

    `target_block_id` 는 같은 outline 안에서 동일 (label_kind, detected_number) 의
    캡션 블록을 찾아 매핑한 결과. 매핑 실패 시 None — 출력은 평문으로 남김.
    """

    label_kind: CaptionLabelKind
    detected_number: int
    target_block_id: str | None = None
    span: tuple[int, int]


class Block(BaseModel):
    id: str
    kind: BlockKind
    level: int = Field(ge=0, le=5)

    # paragraph
    text: str | None = None
    detected_by: DetectedBy | None = None
    list_format: str | None = None
    alignment: Alignment | None = None
    subtype: Subtype | None = None
    warning: Warning | None = None
    caption_refs: list[CaptionRef] = Field(default_factory=list)

    # table / image
    markdown: str | None = None
    preview_url: str | None = None
    caption: str | None = None
    raw_ref: str | None = None

    # field
    field_kind: FieldKind | None = None
    preview_text: str | None = None
    target_id: str | None = None
    raw_xml_ref: str | None = None


class Outline(BaseModel):
    job_id: str
    source_filename: str
    blocks: list[Block]
    sections: list[SectionSpec] = Field(default_factory=list)
