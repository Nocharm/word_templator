"""Batch endpoints E2E: 다파일 업로드 → 병렬 렌더 → ZIP 다운로드."""

import io
import zipfile
from pathlib import Path

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def _login(client, email: str = "batch@x.com", password: str = "pw1234") -> None:
    client.post("/auth/signup", json={"email": email, "password": password})
    client.post("/auth/login", json={"email": email, "password": password})


def _file(name: str) -> tuple[str, bytes, str]:
    return (
        name,
        (FIXTURES / "sample_simple.docx").read_bytes(),
        "application/octet-stream",
    )


def test_batch_upload_parses_multiple_files(client):
    _login(client)
    files = [
        ("files", _file("a.docx")),
        ("files", _file("b.docx")),
        ("files", _file("c.docx")),
    ]
    r = client.post("/jobs/batch/upload", files=files)
    assert r.status_code == 201
    items = r.json()
    assert len(items) == 3
    assert all(it["status"] == "parsed" and it["job_id"] for it in items)


def test_batch_upload_skips_non_docx(client):
    _login(client)
    files = [
        ("files", _file("ok.docx")),
        ("files", ("bad.txt", b"hello", "text/plain")),
    ]
    r = client.post("/jobs/batch/upload", files=files)
    assert r.status_code == 201
    items = r.json()
    statuses = sorted(it["status"] for it in items)
    assert statuses == ["failed", "parsed"]


def test_batch_render_then_download_zip(client):
    _login(client)
    files = [("files", _file(f"f{i}.docx")) for i in range(3)]
    up = client.post("/jobs/batch/upload", files=files)
    job_ids = [it["job_id"] for it in up.json() if it["status"] == "parsed"]
    assert len(job_ids) == 3

    tmpls = client.get("/templates").json()
    builtin = next(t for t in tmpls if t["is_builtin"])

    r = client.post(
        "/jobs/batch/render",
        json={"job_ids": job_ids, "template_id": builtin["id"], "overrides": {}},
    )
    assert r.status_code == 200
    rendered = r.json()
    assert all(it["status"] == "rendered" for it in rendered)

    z = client.get(f"/jobs/batch/download?ids={','.join(job_ids)}")
    assert z.status_code == 200
    assert z.headers["content-type"] == "application/zip"
    with zipfile.ZipFile(io.BytesIO(z.content)) as zf:
        names = zf.namelist()
    assert len(names) == 3
    assert all(n.endswith(".docx") for n in names)


def test_batch_render_404_on_other_users_jobs(client):
    # alice
    client.post("/auth/signup", json={"email": "a@x.com", "password": "pw1234"})
    client.post("/auth/login", json={"email": "a@x.com", "password": "pw1234"})
    files = [("files", _file("a.docx"))]
    up = client.post("/jobs/batch/upload", files=files)
    a_job_id = up.json()[0]["job_id"]
    client.post("/auth/logout")

    # bob
    client.post("/auth/signup", json={"email": "b@x.com", "password": "pw1234"})
    client.post("/auth/login", json={"email": "b@x.com", "password": "pw1234"})
    tmpls = client.get("/templates").json()
    builtin = next(t for t in tmpls if t["is_builtin"])

    # bob 이 alice 의 job_id 로 batch render — 본인 job 아니므로 결과 빈 배열
    r = client.post(
        "/jobs/batch/render",
        json={"job_ids": [a_job_id], "template_id": builtin["id"], "overrides": {}},
    )
    assert r.status_code == 200
    assert r.json() == []

    # bob 이 alice 의 job 으로 zip — 404
    z = client.get(f"/jobs/batch/download?ids={a_job_id}")
    assert z.status_code == 404


def test_batch_upload_rejects_too_many_files(client):
    _login(client)
    files = [("files", _file(f"f{i}.docx")) for i in range(51)]
    r = client.post("/jobs/batch/upload", files=files)
    assert r.status_code == 413


def test_batch_render_rejects_empty_job_ids(client):
    _login(client)
    tmpls = client.get("/templates").json()
    builtin = next(t for t in tmpls if t["is_builtin"])
    r = client.post(
        "/jobs/batch/render",
        json={"job_ids": [], "template_id": builtin["id"], "overrides": {}},
    )
    assert r.status_code == 400
