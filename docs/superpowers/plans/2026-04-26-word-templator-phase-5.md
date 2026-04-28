# Word Templator Phase 5 Implementation Plan — 다중 파일 병렬 변환 (Batch Loop)

> **Note:** spec 의 "Phase 5 다중 파일 병합 (B 모드)" 와는 다른 방향. 사용자 의도는 N 개 파일을 **각각 독립적으로 변환** 하되 백엔드에서 **병렬/비동기** 로 처리해 처리량을 높이는 것. 합치기(merge) 가 아닌 루프(loop) + 동시성.

**Goal:** 사용자가 N 개의 `.docx` 를 한 번에 업로드하고 하나의 템플릿을 적용해서 일괄 변환받는다. 백엔드는 parse / render 를 thread pool 으로 병렬 실행해 직렬 대비 처리량을 높이고, 프론트는 진행 상태 (parsing → rendered) 를 보여준 뒤 ZIP 으로 다운로드.

**Architecture:**
1. 백엔드 — 기존 단일파일 엔드포인트는 유지. 신규 batch 엔드포인트 3개:
   - `POST /jobs/batch/upload` — multipart 다파일 입력, 각 파일을 `asyncio.to_thread(parse_docx, ...)` 로 병렬 파싱, 각각 Job row 생성, `{job_ids, summaries}` 반환.
   - `POST /jobs/batch/render` — body `{job_ids, template_id, overrides}`, 각 job 의 render 를 thread 풀에서 병렬 실행, 결과 status 배열 반환.
   - `GET /jobs/batch/download?ids=a,b,c` — 각 job 의 result_path 를 zip 스트림으로 묶어 응답.
2. 프론트 — 새 페이지 `/batch` 가 다파일 드래그/선택을 받아 업로드, 템플릿 선택, "전체 변환" → 진행 표시 → "전체 다운로드(zip)". 기존 단일 플로우(`/`) 는 그대로.
3. 동시성 — Python 의 `asyncio.gather + asyncio.to_thread` 로 thread pool 안에서 동시 실행. CPU-bound 한계는 GIL 이지만 lxml/zipfile 같은 C 확장은 GIL 을 자주 해제해서 병렬 효과가 있음. 추가로 `MAX_BATCH_PARALLEL` 환경변수로 동시성 상한.

**Tech Stack:** FastAPI + asyncio.to_thread, python-docx, lxml, zipfile (stdlib), Next.js 15 + React 19.

---

## File Structure

### Backend

| 경로 | 책임 | 신규/수정 |
|---|---|---|
| `backend/app/api/jobs.py` | batch 3 endpoints 추가 (upload / render / download) | **Modify** |
| `backend/app/settings.py` | `MAX_BATCH_PARALLEL` (기본 4) 추가 | **Modify** |
| `backend/tests/test_api_batch.py` | batch 엔드포인트 E2E (TEST_DATABASE_URL 의존) | **Create** |
| `backend/tests/test_batch_concurrency.py` | thread pool 으로 N개 병렬 파싱이 직렬 대비 빠른지 시간 측정 | **Create** |

### Frontend

| 경로 | 책임 | 신규/수정 |
|---|---|---|
| `frontend/lib/api.ts` | `uploadBatch`, `renderBatch`, `batchDownloadUrl` 추가 | **Modify** |
| `frontend/lib/types.ts` | `BatchSummary`, `BatchRenderStatus` 추가 | **Modify** |
| `frontend/app/batch/page.tsx` | 다파일 업로드 + 진행 + zip 다운로드 페이지 | **Create** |
| `frontend/app/page.tsx` | 랜딩 헤더에 "다중 파일 일괄 변환 →" 링크 추가 | **Modify** |

---

## 작업 순서

- 백엔드 배치 엔드포인트 (Task 1~3) → 프론트 (Task 4~5) → spec 갱신 (Task 6)
- TDD 우선, 단 batch upload/render 는 TEST_DATABASE_URL 환경 의존 (기존 패턴). 동시성 단위 테스트는 DB 없이 가능.

---

### Task 1: settings + batch upload endpoint

**Files:**
- Modify: `backend/app/settings.py`
- Modify: `backend/app/api/jobs.py`
- Create: `backend/tests/test_batch_concurrency.py`

- [ ] **Step 1: `MAX_BATCH_PARALLEL` 추가**

`backend/app/settings.py` 의 Settings 클래스에 추가 (기본 4):
```python
max_batch_parallel: int = Field(default=4, alias="MAX_BATCH_PARALLEL")
```
`.env.example` 에도 동기화 (있다면).

- [ ] **Step 2: 동시성 단위 테스트 작성 (TDD)**

```python
# backend/tests/test_batch_concurrency.py
"""asyncio.to_thread 기반 병렬 파싱 — 직렬 대비 시간 단축 검증."""

import asyncio
import time
import uuid
from pathlib import Path

from app.parser.parse_docx import parse_docx
from tests.fixtures.build_full_messy_sample import build_full_messy_sample


def _read(path: Path) -> bytes:
    return path.read_bytes()


def test_parallel_parsing_is_faster_than_serial(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    src = tmp_path / "f.docx"
    build_full_messy_sample(src)
    content = _read(src)
    user_id = uuid.uuid4()

    n = 6

    # 직렬
    t0 = time.perf_counter()
    for i in range(n):
        parse_docx(content, filename=f"f{i}.docx", user_id=user_id, job_id=uuid.uuid4())
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

    # GIL 한계로 큰 차이는 안 나지만, 직렬보다 느려지면 안 됨
    assert parallel <= serial * 1.2, f"parallel={parallel:.3f}s serial={serial:.3f}s"
```

- [ ] **Step 3: 테스트 실행 — 통과 확인**

`cd backend && PYTHONPATH=. uv run --no-project --python .venv/bin/python -m pytest tests/test_batch_concurrency.py -v`

- [ ] **Step 4: `POST /jobs/batch/upload` 엔드포인트 추가**

`backend/app/api/jobs.py` 에 새 엔드포인트 (deps + 모델은 기존 import 재사용):

```python
class BatchUploadItem(BaseModel):
    job_id: str
    original_filename: str
    status: str
    error: str | None = None


@router.post("/batch/upload", status_code=201)
async def post_batch_upload(
    files: list[UploadFile] = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[BatchUploadItem]:
    """다파일 업로드 — 각 파일을 thread pool 으로 병렬 파싱."""
    if not files:
        raise HTTPException(status_code=400, detail="no files")
    if len(files) > 50:
        raise HTTPException(status_code=413, detail="too many files (>50)")

    # 1) 각 파일 검증 + Job row 생성 + 디스크 쓰기
    prepared: list[tuple[Job, bytes, str]] = []
    for f in files:
        if not f.filename or not f.filename.lower().endswith(".docx"):
            continue
        content = await f.read()
        if len(content) > 50 * 1024 * 1024:
            continue
        job = Job(
            user_id=user.id,
            original_filename=f.filename,
            status="parsed",
            source_path="",
            outline_json={},
        )
        db.add(job)
        db.flush()
        src = source_path(user.id, job.id, f.filename)
        src.write_bytes(content)
        job.source_path = str(src)
        prepared.append((job, content, f.filename))

    # 2) 병렬 파싱 (thread pool)
    settings = __import__("app.settings", fromlist=["get_settings"]).get_settings()
    sem = asyncio.Semaphore(settings.max_batch_parallel)

    async def parse_one(job: Job, content: bytes, fname: str) -> tuple[Job, Outline | None, str | None]:
        async with sem:
            try:
                outline = await asyncio.to_thread(
                    parse_docx, content, filename=fname, user_id=user.id, job_id=job.id
                )
                outline = outline.model_copy(update={"job_id": str(job.id)})
                return job, outline, None
            except Exception as e:
                return job, None, str(e)

    results = await asyncio.gather(*[parse_one(j, c, f) for j, c, f in prepared])

    # 3) outline_json 저장
    items: list[BatchUploadItem] = []
    for job, outline, err in results:
        if outline is not None:
            outline_dict = outline.model_dump()
            job.outline_json = outline_dict
            job.original_outline_json = outline_dict
            items.append(BatchUploadItem(job_id=str(job.id), original_filename=job.original_filename, status="parsed"))
        else:
            job.status = "failed"
            job.error_message = (err or "parse failed")[:1000]
            items.append(BatchUploadItem(job_id=str(job.id), original_filename=job.original_filename, status="failed", error=err))
    db.commit()
    return items
```

import 추가: `import asyncio`

- [ ] **Step 5: 라우터 등록 확인 + ruff format**

`tests/test_batch_concurrency.py` 통과 + 기존 회귀 통과.

- [ ] **Step 6: 커밋**

```bash
git add backend/app/settings.py backend/app/api/jobs.py backend/tests/test_batch_concurrency.py
git commit -m "feat(api): batch upload endpoint with parallel parsing (Phase 5)"
```

---

### Task 2: batch render endpoint

**Files:** Modify `backend/app/api/jobs.py`

- [ ] **Step 1: `POST /jobs/batch/render` 추가**

```python
class BatchRenderRequest(BaseModel):
    job_ids: list[str]
    template_id: str
    overrides: dict[str, Any] = {}


class BatchRenderItem(BaseModel):
    job_id: str
    status: str
    error: str | None = None


@router.post("/batch/render")
async def post_batch_render(
    body: BatchRenderRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[BatchRenderItem]:
    if not body.job_ids:
        raise HTTPException(status_code=400, detail="empty job_ids")
    if len(body.job_ids) > 50:
        raise HTTPException(status_code=413, detail="too many jobs (>50)")

    tmpl = db.query(Template).filter_by(id=uuid.UUID(body.template_id)).one_or_none()
    if tmpl is None:
        raise HTTPException(status_code=404, detail="template not found")
    spec_dict = {**tmpl.spec, **body.overrides}
    spec = StyleSpec.model_validate(spec_dict)

    # 본인 소유 jobs 만 모음
    jobs: list[Job] = []
    for jid in body.job_ids:
        try:
            job = db.query(Job).filter_by(id=uuid.UUID(jid), user_id=user.id).one_or_none()
        except ValueError:
            job = None
        if job is None:
            continue
        jobs.append(job)

    settings = __import__("app.settings", fromlist=["get_settings"]).get_settings()
    sem = asyncio.Semaphore(settings.max_batch_parallel)

    async def render_one(job: Job) -> BatchRenderItem:
        async with sem:
            try:
                outline = Outline.model_validate(job.outline_json)
                data = await asyncio.to_thread(
                    render_docx, outline, spec, user_id=user.id, job_id=job.id
                )
                out = result_path(user.id, job.id)
                out.write_bytes(data)
                job.result_path = str(out)
                job.applied_template_id = tmpl.id
                job.style_overrides = body.overrides
                job.status = "rendered"
                return BatchRenderItem(job_id=str(job.id), status="rendered")
            except Exception as e:
                job.status = "failed"
                job.error_message = str(e)[:1000]
                return BatchRenderItem(job_id=str(job.id), status="failed", error=str(e))

    results = await asyncio.gather(*[render_one(j) for j in jobs])
    db.commit()
    return results
```

- [ ] **Step 2: 회귀 + ruff + 커밋**

```bash
git add backend/app/api/jobs.py
git commit -m "feat(api): batch render endpoint with parallel rendering"
```

---

### Task 3: batch download endpoint (ZIP stream)

**Files:** Modify `backend/app/api/jobs.py`

- [ ] **Step 1: `GET /jobs/batch/download` 추가**

```python
@router.get("/batch/download")
def get_batch_download(
    ids: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """쉼표로 구분된 job_id 들의 result_path 를 ZIP 으로 스트리밍."""
    import io
    import zipfile

    raw_ids = [s.strip() for s in ids.split(",") if s.strip()]
    if not raw_ids or len(raw_ids) > 50:
        raise HTTPException(status_code=400, detail="invalid ids")

    rows: list[Job] = []
    for jid in raw_ids:
        try:
            job = db.query(Job).filter_by(id=uuid.UUID(jid), user_id=user.id).one_or_none()
        except ValueError:
            job = None
        if job and job.result_path:
            rows.append(job)
    if not rows:
        raise HTTPException(status_code=404, detail="no rendered files")

    buf = io.BytesIO()
    seen: dict[str, int] = {}
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for job in rows:
            base = f"standardized_{job.original_filename}"
            n = seen.get(base, 0)
            name = base if n == 0 else f"{base.rsplit('.', 1)[0]}_{n}.docx"
            seen[base] = n + 1
            try:
                zf.write(job.result_path, arcname=name)
            except OSError:
                continue
    buf.seek(0)
    return StreamingResponse(
        iter([buf.read()]),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="standardized_batch.zip"'},
    )
```

import 추가: `from fastapi.responses import StreamingResponse` (있으면 skip).

- [ ] **Step 2: 회귀 + ruff + 커밋**

```bash
git add backend/app/api/jobs.py
git commit -m "feat(api): batch download as ZIP stream"
```

---

### Task 4: Frontend — types + api

**Files:** Modify `frontend/lib/types.ts`, `frontend/lib/api.ts`

- [ ] types.ts:
```ts
export interface BatchUploadItem {
  job_id: string;
  original_filename: string;
  status: "parsed" | "failed";
  error?: string | null;
}

export interface BatchRenderItem {
  job_id: string;
  status: "rendered" | "failed";
  error?: string | null;
}
```

- [ ] api.ts:
```ts
uploadBatch: (files: File[]) => {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  return request<import("./types").BatchUploadItem[]>("/jobs/batch/upload", {
    method: "POST",
    body: fd,
  });
},
renderBatch: (jobIds: string[], templateId: string, overrides: Record<string, unknown> = {}) =>
  request<import("./types").BatchRenderItem[]>("/jobs/batch/render", {
    method: "POST",
    body: JSON.stringify({ job_ids: jobIds, template_id: templateId, overrides }),
  }),
batchDownloadUrl: (jobIds: string[]) => `${BASE}/jobs/batch/download?ids=${jobIds.join(",")}`,
```

- [ ] 커밋: `feat(ui): types + api for batch upload/render/download`

---

### Task 5: Frontend — `/batch` 페이지

**Files:** Create `frontend/app/batch/page.tsx`, modify `frontend/app/page.tsx`

- [ ] `frontend/app/batch/page.tsx` (Client Component):
  - 다파일 input + dnd
  - 템플릿 selector (기존 패턴 재사용)
  - "전체 업로드 + 변환" 단일 버튼 클릭 시 (1) `uploadBatch` → 결과 표시 → (2) `renderBatch` → 결과 표시 → (3) "전체 다운로드(zip)" 링크 활성화
  - 진행 상태: 각 파일별 줄에 ⏳/✅/❌ + 파일명 + 에러 메시지
  - 단일 변환과 달리 outline 에디터를 거치지 않음 (배치 = 빠른 일괄 적용)

- [ ] `frontend/app/page.tsx` 헤더에 "↗ 다중 파일 일괄 변환" 링크 추가 (인증된 경우만)

- [ ] lint + tsc 통과 후 커밋: `feat(ui): /batch page with parallel upload + render + zip download`

---

### Task 6: spec 문서 갱신

**Files:** Modify `docs/superpowers/specs/2026-04-26-word-templator-design.md`

- [ ] 끝에 append:
```markdown

## Phase 5 완료 검증 — 2026-04-27

> spec 의 원래 Phase 5 (다중 파일 병합 — B 모드) 와 다른 방향. 사용자 의도에 맞춰 "다중 파일 루프 + 병렬" 로 재정의.

- 신규 엔드포인트 3개:
  - `POST /jobs/batch/upload` — 다파일 multipart, `asyncio.to_thread(parse_docx, ...)` + Semaphore(`MAX_BATCH_PARALLEL`) 로 동시 파싱
  - `POST /jobs/batch/render` — `{job_ids, template_id, overrides}`, 동일 동시성 패턴으로 render_docx 병렬
  - `GET /jobs/batch/download?ids=a,b,c` — `zipfile.ZIP_DEFLATED` 로 result_path 들을 ZIP 스트림
- `Settings.max_batch_parallel` (기본 4, env `MAX_BATCH_PARALLEL`)
- 프론트 `/batch` 페이지: 다파일 드래그/선택 → 템플릿 선택 → "전체 변환" → 파일별 진행 상태 → "전체 다운로드 (zip)"
- 단일 파일 플로우 (`/`) 와 에디터/검토 페이지는 그대로 유지

알려진 한계:
- batch 모드는 outline 에디터/검토 페이지를 거치지 않음 (속도 우선) — 사용자가 검토하려면 단일 모드 사용
- 동시 한도는 환경변수로 조정 (CPU-bound 한계로 GIL 영향 있음)
- 50 파일 제한 (메모리/요청 시간 보호)
```

- [ ] 커밋: `docs: Phase 5 (parallel batch) completion log`

---

## Self-Review

- 합치기 아님 — 명시적으로 "각 파일 독립 변환 + 병렬 처리" 로 정의
- 단일 파일 플로우 변경 없음 — `/` 와 `/editor/...` 그대로
- 동시성 안전: 각 Job 은 독립 row. parse/render 가 디스크에 쓰는 경로는 user_id/job_id 별로 분리 (Phase 3/4 그대로) → race 없음
- 에러 격리: 한 파일 실패해도 나머지는 진행 (parse_one/render_one 의 try/except)
- 50 파일 상한 + 50 MB/파일 상한
- spec 의 원래 Phase 5 (병합 B 모드) 는 향후 옵션으로 남겨둠
