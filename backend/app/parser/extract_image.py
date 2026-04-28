"""<w:drawing>/<w:pict> 안의 임베디드 이미지 → bytes."""

from collections.abc import Iterator
from dataclasses import dataclass

from docx.document import Document as DocxDocument
from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph

# a:blip 의 r:embed 속성 — 관계 ID 로 ImagePart 를 찾기 위함.
_R_EMBED = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed"


@dataclass(slots=True)
class ImageBlob:
    content_type: str  # e.g. 'image/png'
    ext: str  # e.g. 'png' (no leading dot)
    data: bytes  # raw image bytes


def _ext_from_content_type(ct: str) -> str:
    table = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/gif": "gif",
        "image/bmp": "bmp",
        "image/webp": "webp",
        "image/x-emf": "emf",
        "image/x-wmf": "wmf",
        "image/tiff": "tiff",
        "image/svg+xml": "svg",
    }
    return table.get(ct.lower(), "bin")


def iter_image_blobs(paragraph: Paragraph, doc: DocxDocument) -> Iterator[ImageBlob]:
    """문단 한 개에서 임베디드 이미지를 모두 꺼낸다 (drawing > blip embed)."""
    p_el = paragraph._p
    blips = p_el.findall(f".//{qn('a:blip')}")
    for blip in blips:
        r_id = blip.get(_R_EMBED)
        if not r_id:
            continue
        try:
            part = doc.part.related_parts[r_id]
        except KeyError:
            continue
        ct = getattr(part, "content_type", "application/octet-stream")
        yield ImageBlob(content_type=ct, ext=_ext_from_content_type(ct), data=part.blob)
