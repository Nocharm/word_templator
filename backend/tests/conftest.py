"""공용 fixture — 테스트용 DB + TestClient.

⚠️ 환경 설정은 다른 import 보다 먼저 실행되어야 한다 (`app.db.session` 이 모듈 로드 시
`get_settings()` 를 호출하면서 `Settings(database_url=...)` 가 lru_cache 로 고정됨).
"""

import os

# 테스트는 항상 SQLite in-memory — PG 컨테이너 의존 제거.
# CI 에서 PG 호환을 검증하려면 별도 잡으로 TEST_DATABASE_URL=postgresql+... 주입.
_DEFAULT_TEST_DB = "sqlite+pysqlite:///:memory:"
_DEFAULT_JWT_SECRET = "test_secret_64_chars_for_dev_only_change_me_not_for_prod_a"

os.environ.setdefault("TEST_DATABASE_URL", _DEFAULT_TEST_DB)
# DATABASE_URL 은 항상 TEST_DATABASE_URL 로 강제 — .env 의 운영 DB 가
# pydantic-settings 로 새어 들어가는 것 방지.
os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
os.environ.setdefault("JWT_SECRET", _DEFAULT_JWT_SECRET)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.db.session as _db_session_module  # noqa: E402
import app.main as _app_main_module  # noqa: E402
from app.api.deps import get_db  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.seed import seed_builtin_templates  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture
def db_engine():
    db_url = os.environ["TEST_DATABASE_URL"]
    # SQLite in-memory 에선 매 connect 마다 새 DB → 같은 메모리 DB 유지하려면 StaticPool
    # + check_same_thread=False (FastAPI thread pool 호환).
    is_sqlite = db_url.startswith("sqlite")
    kwargs: dict = {}
    if is_sqlite:
        kwargs["connect_args"] = {"check_same_thread": False}
        kwargs["poolclass"] = StaticPool
    engine = create_engine(db_url, **kwargs)
    Base.metadata.create_all(engine)

    # lifespan + 앱 내부의 SessionLocal 도 같은 in-memory DB 를 바라보게 패치.
    # app.main 이 `from app.db.session import SessionLocal` 로 직접 바인딩하므로
    # app.db.session 모듈과 app.main 모듈 양쪽 모두 패치해야 한다.
    test_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    _orig_engine = _db_session_module.engine
    _orig_session_local = _db_session_module.SessionLocal
    _orig_main_session_local = _app_main_module.SessionLocal
    _db_session_module.engine = engine
    _db_session_module.SessionLocal = test_session_local
    _app_main_module.SessionLocal = test_session_local

    yield engine

    try:
        Base.metadata.drop_all(engine)
        engine.dispose()
    finally:
        _db_session_module.engine = _orig_engine
        _db_session_module.SessionLocal = _orig_session_local
        _app_main_module.SessionLocal = _orig_main_session_local


@pytest.fixture
def db_session(db_engine):
    Session = sessionmaker(bind=db_engine)
    session = Session()
    seed_builtin_templates(session)
    yield session
    session.close()


@pytest.fixture
def client(db_session):
    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def _data_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    yield
