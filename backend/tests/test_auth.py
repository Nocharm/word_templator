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
