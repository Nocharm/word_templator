"""Templates CRUD — 사용자 커스텀 격리, 빌트인 보호."""


def _signup_login(client, email="t@t.com"):
    client.post("/auth/signup", json={"email": email, "password": "pw1234"})
    client.post("/auth/login", json={"email": email, "password": "pw1234"})


SAMPLE_SPEC = {
    "fonts": {
        "body": {"korean": "맑은 고딕", "ascii": "Arial", "size_pt": 11},
        "heading": {
            "h1": {"korean": "맑은 고딕", "ascii": "Arial", "size_pt": 16, "bold": True},
            "h2": {"korean": "맑은 고딕", "ascii": "Arial", "size_pt": 14, "bold": True},
            "h3": {"korean": "맑은 고딕", "ascii": "Arial", "size_pt": 12, "bold": True},
            "h4": {"korean": "맑은 고딕", "ascii": "Arial", "size_pt": 11, "bold": True},
            "h5": {"korean": "맑은 고딕", "ascii": "Arial", "size_pt": 10, "bold": True},
        },
    },
    "paragraph": {"line_spacing": 1.5, "alignment": "justify", "first_line_indent_pt": 0},
    "numbering": {"h1": "1.", "h2": "1.1.", "h3": "1.1.1.", "list": "decimal"},
    "table": {
        "border_color": "#000000",
        "border_width_pt": 0.5,
        "header_bg": "#D9D9D9",
        "header_bold": True,
        "cell_font_size_pt": 10,
    },
    "page": {
        "margin_top_mm": 25,
        "margin_bottom_mm": 25,
        "margin_left_mm": 25,
        "margin_right_mm": 25,
    },
}


def test_create_custom_template(client):
    _signup_login(client)
    r = client.post("/templates", json={"name": "My Report", "spec": SAMPLE_SPEC})
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "My Report"
    assert body["is_builtin"] is False
    assert "id" in body


def test_create_with_invalid_spec_returns_422(client):
    _signup_login(client)
    bad = {"fonts": {}}  # 필수 필드 누락
    r = client.post("/templates", json={"name": "Bad", "spec": bad})
    assert r.status_code == 422


def test_list_returns_builtins_plus_own_only(client):
    _signup_login(client)
    client.post("/templates", json={"name": "Mine", "spec": SAMPLE_SPEC})
    r = client.get("/templates")
    rows = r.json()
    builtins = [t for t in rows if t["is_builtin"]]
    customs = [t for t in rows if not t["is_builtin"]]
    assert len(builtins) >= 1  # 적어도 1개 (Phase 2: 3개)
    assert len(customs) == 1
    assert customs[0]["name"] == "Mine"


def test_patch_custom_template_name(client):
    _signup_login(client)
    c = client.post("/templates", json={"name": "X", "spec": SAMPLE_SPEC}).json()
    r = client.patch(f"/templates/{c['id']}", json={"name": "X v2"})
    assert r.status_code == 200
    assert r.json()["name"] == "X v2"


def test_patch_custom_template_spec(client):
    _signup_login(client)
    c = client.post("/templates", json={"name": "X", "spec": SAMPLE_SPEC}).json()
    new_spec = {**SAMPLE_SPEC, "paragraph": {**SAMPLE_SPEC["paragraph"], "line_spacing": 2.0}}
    r = client.patch(f"/templates/{c['id']}", json={"spec": new_spec})
    assert r.status_code == 200
    assert r.json()["spec"]["paragraph"]["line_spacing"] == 2.0


def test_patch_with_invalid_spec_422(client):
    _signup_login(client)
    c = client.post("/templates", json={"name": "X", "spec": SAMPLE_SPEC}).json()
    r = client.patch(f"/templates/{c['id']}", json={"spec": {"fonts": {}}})
    assert r.status_code == 422


def test_delete_custom_template(client):
    _signup_login(client)
    c = client.post("/templates", json={"name": "X", "spec": SAMPLE_SPEC}).json()
    r = client.delete(f"/templates/{c['id']}")
    assert r.status_code == 204
    rows = client.get("/templates").json()
    assert all(t["id"] != c["id"] for t in rows)


def test_cannot_patch_builtin(client):
    _signup_login(client)
    rows = client.get("/templates").json()
    builtin_id = next(t["id"] for t in rows if t["is_builtin"])
    r = client.patch(f"/templates/{builtin_id}", json={"name": "X"})
    assert r.status_code == 403


def test_cannot_delete_builtin(client):
    _signup_login(client)
    rows = client.get("/templates").json()
    builtin_id = next(t["id"] for t in rows if t["is_builtin"])
    r = client.delete(f"/templates/{builtin_id}")
    assert r.status_code == 403


def test_cannot_modify_other_users_template(client):
    _signup_login(client, email="alice@a.com")
    c = client.post("/templates", json={"name": "alice", "spec": SAMPLE_SPEC}).json()
    client.post("/auth/logout")
    _signup_login(client, email="bob@b.com")
    # 다른 유저 템플릿은 GET /templates 에서도 안 보이지만 ID로 직접 호출 시도
    r1 = client.patch(f"/templates/{c['id']}", json={"name": "bob"})
    r2 = client.delete(f"/templates/{c['id']}")
    assert r1.status_code in (403, 404)
    assert r2.status_code in (403, 404)


def test_404_on_unknown_template_id(client):
    import uuid

    _signup_login(client)
    fake = str(uuid.uuid4())
    r = client.patch(f"/templates/{fake}", json={"name": "X"})
    assert r.status_code == 404
