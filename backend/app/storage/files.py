"""파일 경로 헬퍼 — /data/{user_id}/{job_id}/."""

import os
import uuid
from pathlib import Path


def _data_dir() -> Path:
    return Path(os.environ.get("DATA_DIR", "/data"))


def job_dir(user_id: uuid.UUID, job_id: uuid.UUID) -> Path:
    d = _data_dir() / "docs" / str(user_id) / str(job_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def source_path(user_id: uuid.UUID, job_id: uuid.UUID, original_filename: str) -> Path:
    safe = original_filename.replace("/", "_").replace("\\", "_")
    return job_dir(user_id, job_id) / f"src_{safe}"


def result_path(user_id: uuid.UUID, job_id: uuid.UUID) -> Path:
    return job_dir(user_id, job_id) / "result.docx"


def raw_ooxml_path(user_id: uuid.UUID, job_id: uuid.UUID, raw_ref: str) -> Path:
    """raw_ref 예: 'table-0'. 원본 <w:tbl>/기타 OOXML 조각을 .xml 로 저장."""
    d = job_dir(user_id, job_id) / "raw"
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{raw_ref}.xml"


def image_dir(job_id: uuid.UUID) -> Path:
    d = _data_dir() / "images" / str(job_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def image_path(job_id: uuid.UUID, idx: int, ext: str) -> Path:
    safe_ext = ext.lstrip(".").lower() or "bin"
    return image_dir(job_id) / f"image-{idx}.{safe_ext}"


def section_part_path(
    user_id: uuid.UUID,
    job_id: uuid.UUID,
    section_idx: int,
    kind: str,
    position: str,
) -> Path:
    """원본 .docx 의 머리말/꼬리말 XML 저장 경로.

    kind: 'header' | 'footer'
    position: 'default' | 'first' | 'even'
    """
    d = job_dir(user_id, job_id) / "sections"
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{kind}_{section_idx}_{position}.xml"
