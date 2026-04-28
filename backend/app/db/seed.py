"""빌트인 StyleSpec 시드 + 시연용 계정/Job 시드 — idempotent."""

import json
import shutil
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.models import Job, Template, User
from app.parser.parse_docx import parse_docx
from app.storage.files import source_path

SEED_DIR = Path(__file__).resolve().parent.parent / "templates_seed"

# 시연/QA 전용 계정 — README 에 노출. 운영 환경에서는 즉시 비밀번호 변경.
DEMO_ADMIN_EMAIL = "admin@local.test"
DEMO_ADMIN_PASSWORD = "admin1234"
DEMO_USER_EMAIL = "user@local.test"
DEMO_USER_PASSWORD = "user1234"

DEMO_JOB_FILENAME = "Demo SOP (시연용 30p).docx"
_DEMO_SOURCE = SEED_DIR / "demo" / "sop_30p.docx"


def seed_builtin_templates(db: Session) -> None:
    for path in sorted(SEED_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        existing = db.query(Template).filter_by(is_builtin=True, name=data["name"]).one_or_none()
        if existing is None:
            db.add(Template(name=data["name"], is_builtin=True, spec=data["spec"]))
        else:
            # 빌트인은 시드 JSON을 단일 출처로 — 매 부팅 시 spec 갱신
            existing.spec = data["spec"]
    db.commit()


def seed_demo_accounts(db: Session) -> None:
    """admin/user 시연 계정을 빈 DB 에 1회 생성. 이미 존재하면 건드리지 않음."""
    _ensure_user(db, DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD, role="admin")
    _ensure_user(db, DEMO_USER_EMAIL, DEMO_USER_PASSWORD, role="user")
    db.commit()


def _ensure_user(db: Session, email: str, password: str, *, role: str) -> None:
    if db.query(User).filter_by(email=email).one_or_none() is not None:
        return
    db.add(User(email=email, password_hash=hash_password(password), role=role))


def seed_demo_job(db: Session, user_id: uuid.UUID) -> None:
    """user 소유 데모 SOP Job 1 개를 빈 상태에서 1회 생성. 이미 있으면 skip."""
    existing = (
        db.query(Job)
        .filter_by(user_id=user_id, original_filename=DEMO_JOB_FILENAME)
        .one_or_none()
    )
    if existing is not None:
        return

    if not _DEMO_SOURCE.exists():
        raise FileNotFoundError(
            f"데모 .docx 원본 누락: {_DEMO_SOURCE} — "
            "`python -m scripts.build_demo_sop` 로 생성 필요"
        )

    job_id = uuid.uuid4()
    # storage.files 가 DATA_DIR 환경변수를 매 호출마다 읽음 → 테스트의
    # tmp_path monkeypatch 와도 자연스럽게 호환.
    dest = source_path(user_id, job_id, "sop_30p.docx")
    shutil.copyfile(_DEMO_SOURCE, dest)

    content = dest.read_bytes()
    outline = parse_docx(content, filename=DEMO_JOB_FILENAME, user_id=user_id, job_id=job_id)
    # mode="json" 으로 UUID/datetime 등을 JSON-safe primitive 로 직렬화
    outline_dict = outline.model_dump(mode="json")

    db.add(Job(
        id=job_id,
        user_id=user_id,
        original_filename=DEMO_JOB_FILENAME,
        status="parsed",
        source_path=str(dest),
        result_path=None,
        applied_template_id=None,
        style_overrides={},
        outline_json=outline_dict,
        original_outline_json=outline_dict,
        error_message=None,
        expires_at=datetime.now(tz=UTC) + timedelta(days=365 * 10),
    ))
    db.commit()
