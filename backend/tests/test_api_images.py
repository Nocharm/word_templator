"""GET /jobs/{id}/images/{idx} E2E."""

from pathlib import Path

from tests.fixtures.build_table_image_sample import build_sample_with_table_and_image


def _login(client, email: str = "img@x.com", password: str = "pw1234") -> None:
    client.post("/auth/signup", json={"email": email, "password": password})
    client.post("/auth/login", json={"email": email, "password": password})


def test_images_route_returns_image(client, tmp_path: Path) -> None:
    _login(client)
    src = tmp_path / "s.docx"
    build_sample_with_table_and_image(src)
    with src.open("rb") as f:
        up = client.post("/jobs/upload", files={"file": ("s.docx", f.read())})
    assert up.status_code == 201, up.text
    job_id = up.json()["job_id"]

    r = client.get(f"/jobs/{job_id}/images/0")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("image/")
    assert len(r.content) > 0


def test_images_route_404_on_missing_idx(client, tmp_path: Path) -> None:
    _login(client)
    src = tmp_path / "s.docx"
    build_sample_with_table_and_image(src)
    with src.open("rb") as f:
        up = client.post("/jobs/upload", files={"file": ("s.docx", f.read())})
    job_id = up.json()["job_id"]

    r = client.get(f"/jobs/{job_id}/images/99")
    assert r.status_code == 404


def test_images_route_404_on_other_users_job(client, tmp_path: Path) -> None:
    # alice uploads
    client.post("/auth/signup", json={"email": "alice@a.com", "password": "pw1234"})
    client.post("/auth/login", json={"email": "alice@a.com", "password": "pw1234"})
    src = tmp_path / "s.docx"
    build_sample_with_table_and_image(src)
    with src.open("rb") as f:
        up = client.post("/jobs/upload", files={"file": ("s.docx", f.read())})
    alice_job = up.json()["job_id"]
    client.post("/auth/logout")

    # bob tries to access
    client.post("/auth/signup", json={"email": "bob@b.com", "password": "pw1234"})
    client.post("/auth/login", json={"email": "bob@b.com", "password": "pw1234"})
    r = client.get(f"/jobs/{alice_job}/images/0")
    assert r.status_code == 404
