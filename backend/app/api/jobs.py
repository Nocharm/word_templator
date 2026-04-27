"""Jobs 라우터 — 업로드, outline 조회/저장, 렌더, 다운로드, 히스토리."""

import shutil
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.db.models import Job, Template, User
from app.domain.outline import Outline
from app.domain.style_spec import StyleSpec
from app.parser.parse_docx import parse_docx
from app.renderer.inject_numbering import renumber
from app.renderer.render_docx import render_docx
from app.storage.files import image_dir, job_dir, result_path, source_path

router = APIRouter(prefix="/jobs", tags=["jobs"])


class UploadResponse(BaseModel):
    job_id: str
    outline: dict


class RenderRequest(BaseModel):
    template_id: str
    overrides: dict[str, Any] = {}


class JobSummary(BaseModel):
    id: str
    original_filename: str
    status: str
    created_at: str
    applied_template_name: str | None = None


def _get_user_job(db: Session, user: User, job_id: str) -> Job:
    """Fetch a job and verify ownership — raises 404 if missing or not owned by user."""
    job = db.query(Job).filter_by(id=uuid.UUID(job_id), user_id=user.id).one_or_none()
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return job


@router.post("/upload", status_code=201, response_model=UploadResponse)
async def post_upload(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UploadResponse:
    if not file.filename or not file.filename.lower().endswith(".docx"):
        raise HTTPException(status_code=400, detail="only .docx is supported")
    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="file too large (>50MB)")

    job = Job(
        user_id=user.id,
        original_filename=file.filename,
        status="parsed",
        source_path="",
        outline_json={},
    )
    db.add(job)
    db.flush()

    src = source_path(user.id, job.id, file.filename)
    src.write_bytes(content)
    job.source_path = str(src)

    outline = parse_docx(content, filename=file.filename, user_id=user.id, job_id=job.id)
    outline = outline.model_copy(update={"job_id": str(job.id)})
    outline_dict = outline.model_dump()
    job.outline_json = outline_dict
    # preview diff 의 좌측("before") — 업로드 시 1회 기록 후 불변
    job.original_outline_json = outline_dict

    db.commit()
    db.refresh(job)
    return UploadResponse(job_id=str(job.id), outline=outline.model_dump())


@router.get("/{job_id}/outline")
def get_outline(
    job_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    job = _get_user_job(db, user, job_id)
    return job.outline_json


@router.put("/{job_id}/outline")
def put_outline(
    job_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    job = _get_user_job(db, user, job_id)
    parsed = Outline.model_validate(body)
    job.outline_json = parsed.model_dump()
    db.commit()
    return {"status": "ok"}


@router.post("/{job_id}/render")
def post_render(
    job_id: str,
    body: RenderRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    job = _get_user_job(db, user, job_id)
    tmpl = db.query(Template).filter_by(id=uuid.UUID(body.template_id)).one_or_none()
    if tmpl is None:
        raise HTTPException(status_code=404, detail="template not found")
    spec_dict = {**tmpl.spec, **body.overrides}
    spec = StyleSpec.model_validate(spec_dict)
    outline = Outline.model_validate(job.outline_json)
    data = render_docx(outline, spec, user_id=user.id, job_id=job.id)

    out = result_path(user.id, job.id)
    out.write_bytes(data)
    job.result_path = str(out)
    job.applied_template_id = tmpl.id
    job.style_overrides = body.overrides
    job.status = "rendered"
    db.commit()
    return {"status": "ok"}


class PreviewRequest(BaseModel):
    template_id: str
    overrides: dict[str, Any] = {}


@router.post("/{job_id}/preview")
def post_preview(
    job_id: str,
    body: PreviewRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """렌더 전에 좌(원본) / 우(변환 후) outline 을 반환해 사용자가 검토할 수 있게 한다.

    좌측: job.original_outline_json (업로드 시 스냅샷, 비어 있으면 현재 outline 으로 폴백)
    우측: 현재 outline 에 spec 의 numbering 을 적용한 결과 (헤딩 prefix 부여)
    """
    job = _get_user_job(db, user, job_id)
    tmpl = db.query(Template).filter_by(id=uuid.UUID(body.template_id)).one_or_none()
    if tmpl is None:
        raise HTTPException(status_code=404, detail="template not found")
    spec_dict = {**tmpl.spec, **body.overrides}
    spec = StyleSpec.model_validate(spec_dict)

    current = Outline.model_validate(job.outline_json)
    numbered_blocks = renumber(current.blocks, spec)
    after = current.model_copy(update={"blocks": [b.model_dump() for b in numbered_blocks]})

    before_dict = job.original_outline_json or job.outline_json

    return {
        "before": before_dict,
        "after": after.model_dump(),
        "applied_template_name": tmpl.name,
        "applied_font_summary": {
            "body": spec.fonts.body.model_dump(),
            "h1": spec.fonts.heading.h1.model_dump(),
            "h2": spec.fonts.heading.h2.model_dump(),
            "h3": spec.fonts.heading.h3.model_dump(),
        },
    }


@router.get("/{job_id}/download")
def get_download(
    job_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    job = _get_user_job(db, user, job_id)
    if job.result_path is None:
        raise HTTPException(status_code=400, detail="not yet rendered")
    return FileResponse(
        path=job.result_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=f"standardized_{job.original_filename}",
    )


@router.get("", response_model=list[JobSummary])
def get_jobs(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[JobSummary]:
    rows = db.query(Job).filter_by(user_id=user.id).order_by(Job.created_at.desc()).all()
    out: list[JobSummary] = []
    for r in rows:
        tname: str | None = None
        if r.applied_template_id is not None:
            t = db.query(Template).filter_by(id=r.applied_template_id).one_or_none()
            tname = t.name if t else None
        out.append(
            JobSummary(
                id=str(r.id),
                original_filename=r.original_filename,
                status=r.status,
                created_at=r.created_at.isoformat(),
                applied_template_name=tname,
            )
        )
    return out


@router.delete("/{job_id}", status_code=204)
def delete_job(
    job_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    job = _get_user_job(db, user, job_id)
    # disk cleanup — best effort, don't fail if files already gone
    for path_str in (job.source_path, job.result_path):
        if path_str:
            p = Path(path_str)
            if p.exists():
                try:
                    p.unlink()
                except OSError:
                    pass
    raw_dir = job_dir(user.id, job.id) / "raw"
    if raw_dir.exists():
        try:
            shutil.rmtree(raw_dir)
        except OSError:
            pass
    img = image_dir(job.id)
    if img.exists():
        try:
            shutil.rmtree(img)
        except OSError:
            pass
    db.delete(job)
    db.commit()
