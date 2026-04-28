"""Jobs API end-to-end: signup → upload → outline → render → download."""

from pathlib import Path

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def _login(client) -> None:
    client.post("/auth/signup", json={"email": "u@u.com", "password": "pw1234"})
    client.post("/auth/login", json={"email": "u@u.com", "password": "pw1234"})


def test_upload_returns_outline_with_blocks(client):
    _login(client)
    with (FIXTURES / "sample_simple.docx").open("rb") as f:
        r = client.post("/jobs/upload", files={"file": ("sample_simple.docx", f.read())})
    assert r.status_code == 201
    data = r.json()
    assert "job_id" in data
    assert len(data["outline"]["blocks"]) >= 4


def test_get_outline_returns_saved_outline(client):
    _login(client)
    with (FIXTURES / "sample_simple.docx").open("rb") as f:
        up = client.post("/jobs/upload", files={"file": ("sample_simple.docx", f.read())})
    job_id = up.json()["job_id"]
    r = client.get(f"/jobs/{job_id}/outline")
    assert r.status_code == 200
    assert r.json()["job_id"] == job_id


def test_put_outline_persists_level_change(client):
    _login(client)
    with (FIXTURES / "sample_simple.docx").open("rb") as f:
        up = client.post("/jobs/upload", files={"file": ("sample_simple.docx", f.read())})
    body = up.json()
    job_id = body["job_id"]
    outline = body["outline"]
    # 첫 paragraph block의 level을 바꿔서 PUT
    for blk in outline["blocks"]:
        if blk["kind"] == "paragraph":
            blk["level"] = 2
            break
    r = client.put(f"/jobs/{job_id}/outline", json=outline)
    assert r.status_code == 200
    g = client.get(f"/jobs/{job_id}/outline").json()
    first_para = next(b for b in g["blocks"] if b["kind"] == "paragraph")
    assert first_para["level"] == 2


def test_render_then_download(client):
    _login(client)
    with (FIXTURES / "sample_simple.docx").open("rb") as f:
        up = client.post("/jobs/upload", files={"file": ("sample_simple.docx", f.read())})
    job_id = up.json()["job_id"]
    tmpls = client.get("/templates").json()
    builtin = next(t for t in tmpls if t["is_builtin"])
    r = client.post(f"/jobs/{job_id}/render", json={"template_id": builtin["id"], "overrides": {}})
    assert r.status_code == 200
    dl = client.get(f"/jobs/{job_id}/download")
    assert dl.status_code == 200
    assert dl.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    assert len(dl.content) > 1000


def test_jobs_list_returns_user_history(client):
    _login(client)
    with (FIXTURES / "sample_simple.docx").open("rb") as f:
        client.post("/jobs/upload", files={"file": ("a.docx", f.read())})
    with (FIXTURES / "sample_simple.docx").open("rb") as f:
        client.post("/jobs/upload", files={"file": ("b.docx", f.read())})
    r = client.get("/jobs")
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_delete_job_removes_row_and_files(client, tmp_path):
    _login(client)
    with (FIXTURES / "sample_simple.docx").open("rb") as f:
        up = client.post("/jobs/upload", files={"file": ("sample_simple.docx", f.read())})
    job_id = up.json()["job_id"]
    # Render so result file exists
    tmpls = client.get("/templates").json()
    builtin = next(t for t in tmpls if t["is_builtin"])
    client.post(f"/jobs/{job_id}/render", json={"template_id": builtin["id"], "overrides": {}})

    r = client.delete(f"/jobs/{job_id}")
    assert r.status_code == 204

    # No longer in list
    listing = client.get("/jobs").json()
    assert all(j["id"] != job_id for j in listing)

    # Subsequent GET 404
    g = client.get(f"/jobs/{job_id}/outline")
    assert g.status_code == 404


def test_delete_other_users_job_returns_404(client):
    # alice uploads
    client.post("/auth/signup", json={"email": "alice@a.com", "password": "pw1234"})
    client.post("/auth/login", json={"email": "alice@a.com", "password": "pw1234"})
    with (FIXTURES / "sample_simple.docx").open("rb") as f:
        up = client.post("/jobs/upload", files={"file": ("a.docx", f.read())})
    alice_job = up.json()["job_id"]

    client.post("/auth/logout")
    client.post("/auth/signup", json={"email": "bob@b.com", "password": "pw1234"})
    client.post("/auth/login", json={"email": "bob@b.com", "password": "pw1234"})

    r = client.delete(f"/jobs/{alice_job}")
    assert r.status_code == 404
