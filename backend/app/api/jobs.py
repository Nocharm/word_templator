"""Jobs 라우터 — 업로드, outline 조회/저장, 렌더, 다운로드, 히스토리, 배치."""

import asyncio
import io
import shutil
import uuid
import zipfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.db.models import Job, Template, User
from app.domain.outline import Outline
from app.domain.style_spec import StyleSpec
from app.parser.parse_docx import parse_docx
from app.renderer.inject_numbering import renumber
from app.renderer.render_docx import render_docx
from app.settings import get_settings
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


# ── Batch (Phase 5) ──
# 단일 라우트 `/{job_id}/render` 등이 `/batch/render` 를 가려서 job_id="batch" 로 잡지 않게,
# batch 라우트를 단일 라우트보다 먼저 선언한다.


class BatchUploadItem(BaseModel):
    job_id: str
    original_filename: str
    status: str
    error: str | None = None


class BatchRenderRequest(BaseModel):
    job_ids: list[str]
    template_id: str
    overrides: dict[str, Any] = {}


class BatchRenderItem(BaseModel):
    job_id: str
    status: str
    error: str | None = None


_BATCH_MAX = 50


@router.post("/batch/upload", status_code=201)
async def post_batch_upload(
    files: list[UploadFile] = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[BatchUploadItem]:
    """다파일 업로드 — 각 파일을 thread pool 으로 병렬 파싱."""
    if not files:
        raise HTTPException(status_code=400, detail="no files")
    if len(files) > _BATCH_MAX:
        raise HTTPException(status_code=413, detail=f"too many files (>{_BATCH_MAX})")

    prepared: list[tuple[Job, bytes, str]] = []
    skipped: list[BatchUploadItem] = []
    for f in files:
        if not f.filename or not f.filename.lower().endswith(".docx"):
            skipped.append(
                BatchUploadItem(
                    job_id="",
                    original_filename=f.filename or "",
                    status="failed",
                    error="not a .docx",
                )
            )
            continue
        content = await f.read()
        if len(content) > 50 * 1024 * 1024:
            skipped.append(
                BatchUploadItem(
                    job_id="",
                    original_filename=f.filename,
                    status="failed",
                    error="file too large (>50MB)",
                )
            )
            continue
        job = Job(
            user_id=user.id,
            original_filename=f.filename,
            status="parsed",
            source_path="",
            outline_json={},
        )
        db.add(job)
        db.flush()
        src = source_path(user.id, job.id, f.filename)
        src.write_bytes(content)
        job.source_path = str(src)
        prepared.append((job, content, f.filename))

    settings = get_settings()
    sem = asyncio.Semaphore(settings.max_batch_parallel)

    async def parse_one(
        job: Job, content: bytes, fname: str
    ) -> tuple[Job, Outline | None, str | None]:
        async with sem:
            try:
                outline = await asyncio.to_thread(
                    parse_docx,
                    content,
                    filename=fname,
                    user_id=user.id,
                    job_id=job.id,
                )
                outline = outline.model_copy(update={"job_id": str(job.id)})
                return job, outline, None
            except Exception as e:
                return job, None, str(e)

    results = await asyncio.gather(*[parse_one(j, c, f) for j, c, f in prepared])

    items: list[BatchUploadItem] = list(skipped)
    for job, outline, err in results:
        if outline is not None:
            outline_dict = outline.model_dump()
            job.outline_json = outline_dict
            job.original_outline_json = outline_dict
            items.append(
                BatchUploadItem(
                    job_id=str(job.id),
                    original_filename=job.original_filename,
                    status="parsed",
                )
            )
        else:
            job.status = "failed"
            job.error_message = (err or "parse failed")[:1000]
            items.append(
                BatchUploadItem(
                    job_id=str(job.id),
                    original_filename=job.original_filename,
                    status="failed",
                    error=err,
                )
            )
    db.commit()
    return items


@router.post("/batch/render")
async def post_batch_render(
    body: BatchRenderRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[BatchRenderItem]:
    if not body.job_ids:
        raise HTTPException(status_code=400, detail="empty job_ids")
    if len(body.job_ids) > _BATCH_MAX:
        raise HTTPException(status_code=413, detail=f"too many jobs (>{_BATCH_MAX})")

    try:
        tmpl_uuid = uuid.UUID(body.template_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail="template not found") from e
    tmpl = db.query(Template).filter_by(id=tmpl_uuid).one_or_none()
    if tmpl is None:
        raise HTTPException(status_code=404, detail="template not found")
    spec_dict = {**tmpl.spec, **body.overrides}
    spec = StyleSpec.model_validate(spec_dict)

    jobs: list[Job] = []
    for jid in body.job_ids:
        try:
            job = db.query(Job).filter_by(id=uuid.UUID(jid), user_id=user.id).one_or_none()
        except ValueError:
            job = None
        if job is not None:
            jobs.append(job)

    settings = get_settings()
    sem = asyncio.Semaphore(settings.max_batch_parallel)

    async def render_one(job: Job) -> BatchRenderItem:
        async with sem:
            try:
                outline = Outline.model_validate(job.outline_json)
                data = await asyncio.to_thread(
                    render_docx, outline, spec, user_id=user.id, job_id=job.id
                )
                out = result_path(user.id, job.id)
                out.write_bytes(data)
                job.result_path = str(out)
                job.applied_template_id = tmpl.id
                job.style_overrides = body.overrides
                job.status = "rendered"
                return BatchRenderItem(job_id=str(job.id), status="rendered")
            except Exception as e:
                job.status = "failed"
                job.error_message = str(e)[:1000]
                return BatchRenderItem(job_id=str(job.id), status="failed", error=str(e))

    results = await asyncio.gather(*[render_one(j) for j in jobs])
    db.commit()
    return results


@router.get("/batch/download")
def get_batch_download(
    ids: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """쉼표로 구분된 job_id 들의 result_path 를 ZIP 으로 스트리밍."""
    raw_ids = [s.strip() for s in ids.split(",") if s.strip()]
    if not raw_ids or len(raw_ids) > _BATCH_MAX:
        raise HTTPException(status_code=400, detail="invalid ids")

    rows: list[Job] = []
    for jid in raw_ids:
        try:
            job = db.query(Job).filter_by(id=uuid.UUID(jid), user_id=user.id).one_or_none()
        except ValueError:
            job = None
        if job and job.result_path:
            rows.append(job)
    if not rows:
        raise HTTPException(status_code=404, detail="no rendered files")

    buf = io.BytesIO()
    seen: dict[str, int] = {}
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for job in rows:
            base = f"standardized_{job.original_filename}"
            n = seen.get(base, 0)
            if n == 0:
                name = base
            else:
                stem, _, ext = base.rpartition(".")
                name = f"{stem}_{n}.{ext}" if ext else f"{base}_{n}"
            seen[base] = n + 1
            path_str = job.result_path
            if not path_str:
                continue
            try:
                zf.write(path_str, arcname=name)
            except OSError:
                continue
    buf.seek(0)
    return StreamingResponse(
        iter([buf.read()]),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="standardized_batch.zip"'},
    )


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
