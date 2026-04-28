"""auth 엔드포인트 — signup → login → me → logout."""


def test_signup_then_login_then_me(client):
    # signup
    r = client.post("/auth/signup", json={"email": "a@b.com", "password": "pw1234"})
    assert r.status_code == 201

    # login (쿠키 발급)
    r = client.post("/auth/login", json={"email": "a@b.com", "password": "pw1234"})
    assert r.status_code == 200
    assert "access_token" in r.cookies

    # me
    r = client.get("/auth/me")
    assert r.status_code == 200
    assert r.json()["email"] == "a@b.com"


def test_signup_duplicate_email_409(client):
    client.post("/auth/signup", json={"email": "x@y.com", "password": "pw1234"})
    r = client.post("/auth/signup", json={"email": "x@y.com", "password": "pw1234"})
    assert r.status_code == 409


def test_login_wrong_password_401(client):
    client.post("/auth/signup", json={"email": "a@b.com", "password": "pw1234"})
    r = client.post("/auth/login", json={"email": "a@b.com", "password": "WRONG"})
    assert r.status_code == 401


def test_logout_clears_cookie(client):
    client.post("/auth/signup", json={"email": "a@b.com", "password": "pw1234"})
    client.post("/auth/login", json={"email": "a@b.com", "password": "pw1234"})
    r = client.post("/auth/logout")
    assert r.status_code == 204


def test_change_password_then_login_with_new(client):
    client.post("/auth/signup", json={"email": "p@p.com", "password": "old1234"})
    client.post("/auth/login", json={"email": "p@p.com", "password": "old1234"})
    r = client.patch(
        "/auth/password",
        json={"current_password": "old1234", "new_password": "new5678"},
    )
    assert r.status_code == 204

    client.post("/auth/logout")
    r = client.post("/auth/login", json={"email": "p@p.com", "password": "old1234"})
    assert r.status_code == 401
    r = client.post("/auth/login", json={"email": "p@p.com", "password": "new5678"})
    assert r.status_code == 200


def test_change_password_wrong_current_400(client):
    client.post("/auth/signup", json={"email": "p@p.com", "password": "old1234"})
    client.post("/auth/login", json={"email": "p@p.com", "password": "old1234"})
    r = client.patch(
        "/auth/password",
        json={"current_password": "WRONG", "new_password": "new5678"},
    )
    assert r.status_code == 400


def test_change_password_same_as_current_400(client):
    client.post("/auth/signup", json={"email": "p@p.com", "password": "old1234"})
    client.post("/auth/login", json={"email": "p@p.com", "password": "old1234"})
    r = client.patch(
        "/auth/password",
        json={"current_password": "old1234", "new_password": "old1234"},
    )
    assert r.status_code == 400


def test_change_password_requires_auth_401(client):
    r = client.patch(
        "/auth/password",
        json={"current_password": "x", "new_password": "y1234"},
    )
    assert r.status_code == 401
