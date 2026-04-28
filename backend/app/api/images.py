"""이미지 미리보기 라우트 — /jobs/{id}/images/{idx}."""

import mimetypes
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.db.models import Job, User
from app.storage.files import image_dir

router = APIRouter(prefix="/jobs", tags=["images"])


@router.get("/{job_id}/images/{idx}")
def get_image(
    job_id: str,
    idx: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    if idx < 0:
        raise HTTPException(status_code=404, detail="image not found")
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail="job not found") from e
    job = db.query(Job).filter_by(id=job_uuid, user_id=user.id).one_or_none()
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")

    candidates = sorted(image_dir(job.id).glob(f"image-{idx}.*"))
    if not candidates:
        raise HTTPException(status_code=404, detail="image not found")
    p: Path = candidates[0]
    media_type, _ = mimetypes.guess_type(str(p))
    return FileResponse(path=str(p), media_type=media_type or "application/octet-stream")
