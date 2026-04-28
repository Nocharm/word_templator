"""asyncio.to_thread 기반 병렬 파싱 — 직렬 대비 시간 단축 검증."""

import asyncio
import time
import uuid

from app.parser.parse_docx import parse_docx
from tests.fixtures.build_full_messy_sample import build_full_messy_sample


def test_parallel_parsing_is_not_slower_than_serial(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    src = tmp_path / "f.docx"
    build_full_messy_sample(src)
    content = src.read_bytes()
    user_id = uuid.uuid4()

    n = 6

    t0 = time.perf_counter()
    for i in range(n):
        parse_docx(
            content,
            filename=f"f{i}.docx",
            user_id=user_id,
            job_id=uuid.uuid4(),
        )
    serial = time.perf_counter() - t0

    async def run() -> None:
        await asyncio.gather(
            *[
                asyncio.to_thread(
                    parse_docx,
                    content,
                    filename=f"f{i}.docx",
                    user_id=user_id,
                    job_id=uuid.uuid4(),
                )
                for i in range(n)
            ]
        )

    t0 = time.perf_counter()
    asyncio.run(run())
    parallel = time.perf_counter() - t0

    # GIL 한계로 큰 차이는 없어도 직렬보다 느려지지 않아야 한다
    assert parallel <= serial * 1.3, f"parallel={parallel:.3f}s serial={serial:.3f}s"


def test_parallel_render_is_not_slower_than_serial(tmp_path, monkeypatch):
    """render_docx 도 동일하게 병렬 호출이 직렬 대비 느려지지 않는지."""
    import json
    from pathlib import Path

    from app.domain.style_spec import StyleSpec
    from app.renderer.render_docx import render_docx

    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    src = tmp_path / "f.docx"
    build_full_messy_sample(src)
    content = src.read_bytes()
    user_id = uuid.uuid4()

    seed = Path(__file__).resolve().parent.parent / "app" / "templates_seed" / "report.json"
    spec = StyleSpec.model_validate(json.loads(seed.read_text(encoding="utf-8"))["spec"])

    # 사전 파싱
    job_ids = [uuid.uuid4() for _ in range(6)]
    outlines = [
        parse_docx(content, filename=f"f{i}.docx", user_id=user_id, job_id=job_ids[i])
        for i in range(6)
    ]

    t0 = time.perf_counter()
    for i, o in enumerate(outlines):
        render_docx(o, spec, user_id=user_id, job_id=job_ids[i])
    serial = time.perf_counter() - t0

    async def run() -> None:
        await asyncio.gather(
            *[
                asyncio.to_thread(render_docx, o, spec, user_id=user_id, job_id=job_ids[i])
                for i, o in enumerate(outlines)
            ]
        )

    t0 = time.perf_counter()
    asyncio.run(run())
    parallel = time.perf_counter() - t0

    assert parallel <= serial * 1.3, f"parallel={parallel:.3f}s serial={serial:.3f}s"
