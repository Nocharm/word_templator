"""모델 INSERT/SELECT round-trip."""

import os

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.db.models import Job, Template, User


@pytest.fixture(scope="module")
def db_session():
    db_url = os.environ["DATABASE_URL"]
    engine = create_engine(db_url)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(engine)


def test_user_roundtrip(db_session):
    user = User(email="alice@example.com", password_hash="x")
    db_session.add(user)
    db_session.commit()
    fetched = db_session.query(User).filter_by(email="alice@example.com").one()
    assert fetched.id == user.id


def test_template_with_owner_null(db_session):
    tmpl = Template(name="builtin-test", is_builtin=True, spec={"k": "v"})
    db_session.add(tmpl)
    db_session.commit()
    assert tmpl.owner_id is None


def test_job_default_expires_at(db_session):
    user = User(email="bob@example.com", password_hash="x")
    db_session.add(user)
    db_session.commit()
    job = Job(
        user_id=user.id,
        original_filename="r.docx",
        source_path="/data/x.docx",
        outline_json={"blocks": []},
    )
    db_session.add(job)
    db_session.commit()
    assert job.expires_at is not None
