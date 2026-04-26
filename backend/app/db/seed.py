"""빌트인 StyleSpec 시드 — idempotent."""

import json
from pathlib import Path

from sqlalchemy.orm import Session

from app.db.models import Template

SEED_DIR = Path(__file__).resolve().parent.parent / "templates_seed"


def seed_builtin_templates(db: Session) -> None:
    for path in sorted(SEED_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        existing = (
            db.query(Template)
            .filter_by(is_builtin=True, name=data["name"])
            .one_or_none()
        )
        if existing is None:
            db.add(Template(name=data["name"], is_builtin=True, spec=data["spec"]))
    db.commit()
