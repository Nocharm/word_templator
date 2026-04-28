"""GUID / JSONPortable 단위 테스트 — SQLite in-memory."""

import uuid

import pytest
from sqlalchemy import Column, Integer, create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.db.types import GUID, JSONPortable


class _Base(DeclarativeBase):
    pass


class _Sample(_Base):
    __tablename__ = "sample"
    id = Column(Integer, primary_key=True)
    uid = Column(GUID(), nullable=False)
    payload = Column(JSONPortable(), nullable=True)


@pytest.fixture
def session():
    engine = create_engine("sqlite:///:memory:")
    _Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    s = Session()
    yield s
    s.close()


def test_guid_round_trip_uuid(session):
    u = uuid.uuid4()
    session.add(_Sample(uid=u, payload={"x": 1}))
    session.commit()
    row = session.query(_Sample).one()
    assert isinstance(row.uid, uuid.UUID)
    assert row.uid == u


def test_guid_accepts_string_form(session):
    u = uuid.uuid4()
    session.add(_Sample(uid=str(u), payload={}))
    session.commit()
    row = session.query(_Sample).one()
    assert row.uid == u


def test_jsonportable_round_trip_dict(session):
    payload = {"a": 1, "b": [2, 3], "c": {"nested": True}}
    session.add(_Sample(uid=uuid.uuid4(), payload=payload))
    session.commit()
    row = session.query(_Sample).one()
    assert row.payload == payload


def test_jsonportable_unicode(session):
    payload = {"제목": "한글", "items": ["가", "나", "다"]}
    session.add(_Sample(uid=uuid.uuid4(), payload=payload))
    session.commit()
    row = session.query(_Sample).one()
    assert row.payload == payload


def test_jsonportable_none(session):
    session.add(_Sample(uid=uuid.uuid4(), payload=None))
    session.commit()
    row = session.query(_Sample).one()
    assert row.payload is None
