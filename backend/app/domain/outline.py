"""Outline JSON — Backend ↔ Frontend 계약."""

from typing import Literal

from pydantic import BaseModel, Field

from app.domain.section import SectionSpec

DetectedBy = Literal["word_style", "heuristic", "user"]
BlockKind = Literal["paragraph", "table", "image", "field"]
FieldKind = Literal["ref", "toc", "pageref"]
Alignment = Literal["left", "right", "center", "justify"]


class Block(BaseModel):
    id: str
    kind: BlockKind
    level: int = Field(ge=0, le=5)

    # paragraph
    text: str | None = None
    detected_by: DetectedBy | None = None
    list_format: str | None = None
    alignment: Alignment | None = None

    # table / image
    markdown: str | None = None
    preview_url: str | None = None
    caption: str | None = None
    raw_ref: str | None = None

    # field (Phase 4 자리; Phase 1에서는 placeholder만 만듦)
    field_kind: FieldKind | None = None
    preview_text: str | None = None
    target_id: str | None = None
    raw_xml_ref: str | None = None


class Outline(BaseModel):
    job_id: str
    source_filename: str
    blocks: list[Block]
    # 비어있으면 sectPr 정보 없음 (legacy / 단일 섹션). 렌더러가 단일 portrait 로 fallback.
    sections: list[SectionSpec] = Field(default_factory=list)
