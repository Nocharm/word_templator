"""빌트인 템플릿 시드는 한 번만 실행되며 기존 행을 덮어쓰지 않는다."""

import os

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.db.models import Template
from app.db.seed import seed_builtin_templates


@pytest.fixture
def db_session():
    db_url = os.environ["DATABASE_URL"]
    engine = create_engine(db_url)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(engine)


def test_seed_inserts_three_builtins(db_session):
    seed_builtin_templates(db_session)
    rows = db_session.query(Template).filter_by(is_builtin=True).all()
    assert len(rows) == 3
    names = {r.name for r in rows}
    assert names == {"기본 보고서", "공문 양식", "학술 논문"}
    # 모두 spec.fonts 가 있어야 함
    for r in rows:
        assert "fonts" in r.spec


def test_seed_is_idempotent(db_session):
    seed_builtin_templates(db_session)
    seed_builtin_templates(db_session)
    rows = db_session.query(Template).filter_by(is_builtin=True).all()
    assert len(rows) == 3
