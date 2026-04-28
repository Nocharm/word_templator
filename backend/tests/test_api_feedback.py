"""Feedback E2E — user 제출/조회 + admin 관리 + 권한 분리."""

import pytest


def _signup_login(client, email: str, password: str = "pw1234") -> None:
    client.post("/auth/signup", json={"email": email, "password": password})
    client.post("/auth/login", json={"email": email, "password": password})


def _signup_login_admin(monkeypatch, client, email: str, password: str = "pw1234") -> None:
    """signup 직전에 ADMIN_EMAILS env + lru_cache 비워서 admin 권한 부여."""
    from app.settings import get_settings

    monkeypatch.setenv("ADMIN_EMAILS", email)
    get_settings.cache_clear()
    # auth.py module-level _settings 도 갱신
    import app.api.auth as auth_module

    auth_module._settings = get_settings()

    client.post("/auth/signup", json={"email": email, "password": password})
    client.post("/auth/login", json={"email": email, "password": password})


@pytest.fixture(autouse=True)
def _reset_settings_cache():
    """각 테스트가 끝난 후 settings 캐시를 비워서 다른 테스트에 누수 방지."""
    yield
    from app.settings import get_settings
    import app.api.auth as auth_module

    get_settings.cache_clear()
    auth_module._settings = get_settings()


def test_user_can_submit_and_view_own_feedback(client):
    _signup_login(client, "u@x.com")
    r = client.post(
        "/feedback",
        json={"category": "bug", "title": "안 됨", "body": "업로드 실패함"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["category"] == "bug"
    assert body["status"] == "open"
    assert body["admin_note"] is None
    fid = body["id"]

    r = client.get("/feedback/me")
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    assert items[0]["id"] == fid


def test_user_only_sees_own_feedback(client):
    _signup_login(client, "alice@x.com")
    client.post("/feedback", json={"category": "bug", "title": "A", "body": "."})
    client.post("/auth/logout")

    _signup_login(client, "bob@x.com")
    r = client.get("/feedback/me")
    assert r.status_code == 200
    assert r.json() == []


def test_user_cannot_access_admin_endpoints(client):
    _signup_login(client, "u@x.com")

    r = client.get("/admin/feedback")
    assert r.status_code == 403

    r = client.patch(
        "/admin/feedback/00000000-0000-0000-0000-000000000000",
        json={"status": "closed"},
    )
    assert r.status_code == 403


def test_unauthenticated_blocked(client):
    r = client.post("/feedback", json={"category": "bug", "title": "x", "body": "y"})
    assert r.status_code == 401
    r = client.get("/feedback/me")
    assert r.status_code == 401
    r = client.get("/admin/feedback")
    assert r.status_code == 401


def test_admin_can_list_filter_and_update(monkeypatch, client):
    # alice = user, bob = user, carol = admin
    _signup_login(client, "alice@x.com")
    fa = client.post(
        "/feedback", json={"category": "bug", "title": "A-bug", "body": "."}
    ).json()["id"]
    client.post("/auth/logout")

    _signup_login(client, "bob@x.com")
    client.post("/feedback", json={"category": "feature", "title": "B-feat", "body": "."})
    client.post("/auth/logout")

    _signup_login_admin(monkeypatch, client, "carol@x.com")

    r = client.get("/admin/feedback")
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 2
    # 관리자 응답에는 작성자 이메일 노출.
    assert {it["user_email"] for it in items} == {"alice@x.com", "bob@x.com"}

    r = client.get("/admin/feedback?category=bug")
    assert r.status_code == 200
    only_bugs = r.json()
    assert len(only_bugs) == 1
    assert only_bugs[0]["category"] == "bug"

    r = client.patch(
        f"/admin/feedback/{fa}",
        json={"status": "in_progress", "admin_note": "확인 중입니다"},
    )
    assert r.status_code == 200
    updated = r.json()
    assert updated["status"] == "in_progress"
    assert updated["admin_note"] == "확인 중입니다"


def test_admin_patch_404_on_missing_or_invalid_id(monkeypatch, client):
    _signup_login_admin(monkeypatch, client, "admin@x.com")

    r = client.patch(
        "/admin/feedback/not-a-uuid", json={"status": "closed"}
    )
    assert r.status_code == 404

    r = client.patch(
        "/admin/feedback/00000000-0000-0000-0000-000000000000",
        json={"status": "closed"},
    )
    assert r.status_code == 404


def test_invalid_category_or_status_rejected(monkeypatch, client):
    _signup_login(client, "u@x.com")

    # category enum 위반 → 422
    r = client.post(
        "/feedback", json={"category": "xxx", "title": "t", "body": "b"}
    )
    assert r.status_code == 422

    client.post("/auth/logout")
    _signup_login_admin(monkeypatch, client, "admin@x.com")

    # status filter enum 위반 → 400
    r = client.get("/admin/feedback?status=xxx")
    assert r.status_code == 400


def test_me_returns_role(client, monkeypatch):
    _signup_login(client, "u@x.com")
    r = client.get("/auth/me")
    assert r.status_code == 200
    assert r.json()["role"] == "user"
    client.post("/auth/logout")

    _signup_login_admin(monkeypatch, client, "admin@x.com")
    r = client.get("/auth/me")
    assert r.status_code == 200
    assert r.json()["role"] == "admin"
