"""storage.files 경로 헬퍼."""

import uuid

from app.storage.files import job_dir, result_path, source_path


def test_paths_are_under_data_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    user_id = uuid.uuid4()
    job_id = uuid.uuid4()
    d = job_dir(user_id, job_id)
    assert str(d).startswith(str(tmp_path))
    assert d.exists()


def test_source_and_result_paths_distinct(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    user_id = uuid.uuid4()
    job_id = uuid.uuid4()
    src = source_path(user_id, job_id, "report.docx")
    res = result_path(user_id, job_id)
    assert src != res
    assert src.suffix == ".docx"
    assert res.suffix == ".docx"


def test_raw_ooxml_path_creates_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    import uuid

    from app.storage.files import raw_ooxml_path

    uid = uuid.uuid4()
    jid = uuid.uuid4()
    p = raw_ooxml_path(uid, jid, "table-0")
    assert p.parent.exists()
    assert p.name == "table-0.xml"


def test_image_path_extension(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    import uuid

    from app.storage.files import image_path

    jid = uuid.uuid4()
    p = image_path(jid, 0, ".PNG")
    assert p.parent.exists()
    assert p.name == "image-0.png"
