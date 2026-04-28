# Word Templator Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 1 MVP 위에 (1) 빌트인 템플릿을 +2개 늘리고, (2) 사용자가 빌트인 위에 일부 필드만 오버라이드해 본인만의 StyleSpec을 저장·관리하고, (3) outline 에디터에서 여러 문단을 동시에 선택해 레벨을 한꺼번에 바꾸고, (4) 휴리스틱·빈 문단·정렬 보존 같은 UX 보강 항목을 묶어 처리.

**Architecture:** 백엔드는 기존 jobs/templates 라우터에 CRUD 엔드포인트 추가, 시드 JSON 추가, 파서·렌더러에 추가 휴리스틱과 정렬 보존만 덧붙임. 프론트엔드는 outline 에디터에 다중 선택 상태(`selectedIds: Set<string>`)와 새 `/templates` 관리 페이지 + 변환 화면의 오버라이드 폼만 추가.

**Tech Stack:** 동일 (FastAPI / Next.js / Postgres). 신규 의존성 없음.

**Spec reference:** `docs/superpowers/specs/2026-04-26-word-templator-design.md` (§8 Phase 2).

**범위 분할:**

- **Phase 2 (정식)** — 스펙 §8 그대로 + 단순 UX (로그아웃, 저장 표시).
- **Phase 2.1 (UX 보강)** — 수동 테스트로 발견된 파서·렌더러 강화 항목.
- **Phase 2.2 (다중 선택 — 사용자 추가 요청)** — outline 에디터 멀티 선택.

---

## Task 1: 빌트인 템플릿 +2 (공문 양식 + 학술 논문)

**Files:**
- Create: `backend/app/templates_seed/official.json`, `backend/app/templates_seed/academic.json`

**Specs (디자인 의도):**
- `공문 양식`: 명조 계열(`바탕`/`Times New Roman`), 본문 12pt, 줄간격 1.6, 양쪽정렬, 들여쓰기 0, 표 헤더 회색 배경. 번호 `1.` / `1.1.` / `1.1.1.`.
- `학술 논문`: `Cambria`/`바탕`, 본문 11pt, 줄간격 2.0, 양쪽정렬, 첫줄 들여쓰기 12pt, H1 18pt bold + center, H2 14pt bold + left, 표 캡션 굵게.

- [ ] **Step 1: `official.json` 작성**

```json
{
  "id_slug": "builtin-official",
  "name": "공문 양식",
  "spec": {
    "fonts": {
      "body": { "korean": "바탕", "ascii": "Times New Roman", "size_pt": 12 },
      "heading": {
        "h1": { "korean": "바탕", "ascii": "Times New Roman", "size_pt": 16, "bold": true },
        "h2": { "korean": "바탕", "ascii": "Times New Roman", "size_pt": 14, "bold": true },
        "h3": { "korean": "바탕", "ascii": "Times New Roman", "size_pt": 12, "bold": true }
      }
    },
    "paragraph": {
      "line_spacing": 1.6,
      "alignment": "justify",
      "first_line_indent_pt": 0
    },
    "numbering": { "h1": "1.", "h2": "1.1.", "h3": "1.1.1.", "list": "decimal" },
    "table": {
      "border_color": "#000000",
      "border_width_pt": 0.75,
      "header_bg": "#E5E5E5",
      "header_bold": true,
      "cell_font_size_pt": 11
    },
    "page": { "margin_top_mm": 30, "margin_bottom_mm": 30, "margin_left_mm": 30, "margin_right_mm": 30 }
  }
}
```

- [ ] **Step 2: `academic.json` 작성**

```json
{
  "id_slug": "builtin-academic",
  "name": "학술 논문",
  "spec": {
    "fonts": {
      "body": { "korean": "바탕", "ascii": "Cambria", "size_pt": 11 },
      "heading": {
        "h1": { "korean": "바탕", "ascii": "Cambria", "size_pt": 18, "bold": true },
        "h2": { "korean": "바탕", "ascii": "Cambria", "size_pt": 14, "bold": true },
        "h3": { "korean": "바탕", "ascii": "Cambria", "size_pt": 12, "bold": true }
      }
    },
    "paragraph": {
      "line_spacing": 2.0,
      "alignment": "justify",
      "first_line_indent_pt": 12
    },
    "numbering": { "h1": "1.", "h2": "1.1.", "h3": "1.1.1.", "list": "decimal" },
    "table": {
      "border_color": "#333333",
      "border_width_pt": 0.5,
      "header_bg": "#F2F2F2",
      "header_bold": true,
      "cell_font_size_pt": 10
    },
    "page": { "margin_top_mm": 25, "margin_bottom_mm": 25, "margin_left_mm": 30, "margin_right_mm": 30 }
  }
}
```

- [ ] **Step 3: 시드 동작 검증**

```bash
docker compose -f infra/docker-compose.yml restart backend
# 그 후 /templates GET 으로 3개 빌트인 보이는지 확인
```

기존 `seed_builtin_templates()` 가 idempotent + 글로빙 방식이라 코드 변경 ❌, JSON 추가만으로 동작.

- [ ] **Step 4: 단위 테스트 갱신**

`backend/tests/test_seed.py` 의 `test_seed_inserts_builtin_report` 가 `len(rows) == 1` 을 단언하는데 이제 3개여야 함. 두 군데 수정:

```python
def test_seed_inserts_builtin_report(db_session):
    seed_builtin_templates(db_session)
    rows = db_session.query(Template).filter_by(is_builtin=True).all()
    assert len(rows) == 3
    names = {r.name for r in rows}
    assert names == {"기본 보고서", "공문 양식", "학술 논문"}


def test_seed_is_idempotent(db_session):
    seed_builtin_templates(db_session)
    seed_builtin_templates(db_session)
    rows = db_session.query(Template).filter_by(is_builtin=True).all()
    assert len(rows) == 3
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/templates_seed/ backend/tests/test_seed.py
git commit -m "feat(seed): add 공문 양식 and 학술 논문 builtin templates"
```

---

## Task 2: Templates CRUD API (POST/PATCH/DELETE)

**Files:**
- Modify: `backend/app/api/templates.py`
- Create/Modify: `backend/tests/test_api_templates.py`

빌트인은 사용자가 못 만들고/수정하고/삭제 못 하게 해야 함.

- [ ] **Step 1: 실패하는 테스트**

`backend/tests/test_api_templates.py`:
```python
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
        },
    },
    "paragraph": {"line_spacing": 1.5, "alignment": "justify", "first_line_indent_pt": 0},
    "numbering": {"h1": "1.", "h2": "1.1.", "h3": "1.1.1.", "list": "decimal"},
    "table": {"border_color": "#000000", "border_width_pt": 0.5, "header_bg": "#D9D9D9", "header_bold": True, "cell_font_size_pt": 10},
    "page": {"margin_top_mm": 25, "margin_bottom_mm": 25, "margin_left_mm": 25, "margin_right_mm": 25},
}


def test_create_custom_template(client):
    _signup_login(client)
    r = client.post("/templates", json={"name": "My Report", "spec": SAMPLE_SPEC})
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "My Report"
    assert body["is_builtin"] is False


def test_list_returns_builtin_plus_own(client):
    _signup_login(client)
    client.post("/templates", json={"name": "Mine", "spec": SAMPLE_SPEC})
    r = client.get("/templates")
    rows = r.json()
    builtin = [t for t in rows if t["is_builtin"]]
    custom = [t for t in rows if not t["is_builtin"]]
    assert len(builtin) >= 1
    assert any(t["name"] == "Mine" for t in custom)


def test_patch_custom_template(client):
    _signup_login(client)
    c = client.post("/templates", json={"name": "X", "spec": SAMPLE_SPEC}).json()
    r = client.patch(f"/templates/{c['id']}", json={"name": "X v2"})
    assert r.status_code == 200
    assert r.json()["name"] == "X v2"


def test_delete_custom_template(client):
    _signup_login(client)
    c = client.post("/templates", json={"name": "X", "spec": SAMPLE_SPEC}).json()
    r = client.delete(f"/templates/{c['id']}")
    assert r.status_code == 204
    rows = client.get("/templates").json()
    assert all(t["id"] != c["id"] for t in rows)


def test_cannot_modify_builtin(client):
    _signup_login(client)
    rows = client.get("/templates").json()
    builtin_id = next(t["id"] for t in rows if t["is_builtin"])
    r = client.patch(f"/templates/{builtin_id}", json={"name": "X"})
    assert r.status_code == 403


def test_cannot_modify_other_users_template(client):
    _signup_login(client, email="alice@a.com")
    c = client.post("/templates", json={"name": "alice", "spec": SAMPLE_SPEC}).json()
    client.post("/auth/logout")
    _signup_login(client, email="bob@b.com")
    r = client.patch(f"/templates/{c['id']}", json={"name": "bob"})
    assert r.status_code in (403, 404)
```

- [ ] **Step 2: 라우터에 CRUD 추가**

`backend/app/api/templates.py` 에 `POST/PATCH/DELETE` 추가. 빌트인이거나 본인 소유가 아니면 403/404. spec 변경은 `StyleSpec.model_validate()` 로 검증 후 저장.

코드 골격:
```python
class TemplateCreate(BaseModel):
    name: str
    spec: dict


class TemplateUpdate(BaseModel):
    name: str | None = None
    spec: dict | None = None


@router.post("", status_code=201, response_model=TemplateOut)
def post_template(body: TemplateCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> TemplateOut:
    StyleSpec.model_validate(body.spec)  # 422 if invalid
    tmpl = Template(owner_id=user.id, name=body.name, is_builtin=False, spec=body.spec)
    db.add(tmpl); db.commit(); db.refresh(tmpl)
    return TemplateOut(...)


@router.patch("/{tmpl_id}", response_model=TemplateOut)
def patch_template(tmpl_id: str, body: TemplateUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> TemplateOut:
    tmpl = db.query(Template).filter_by(id=uuid.UUID(tmpl_id)).one_or_none()
    if tmpl is None or tmpl.is_builtin:
        raise HTTPException(403 if tmpl and tmpl.is_builtin else 404)
    if tmpl.owner_id != user.id:
        raise HTTPException(403)
    if body.name is not None: tmpl.name = body.name
    if body.spec is not None:
        StyleSpec.model_validate(body.spec)
        tmpl.spec = body.spec
    db.commit(); db.refresh(tmpl)
    return TemplateOut(...)


@router.delete("/{tmpl_id}", status_code=204)
def delete_template(tmpl_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> None:
    tmpl = db.query(Template).filter_by(id=uuid.UUID(tmpl_id)).one_or_none()
    if tmpl is None or tmpl.is_builtin:
        raise HTTPException(403 if tmpl and tmpl.is_builtin else 404)
    if tmpl.owner_id != user.id:
        raise HTTPException(403)
    db.delete(tmpl); db.commit()
```

`from app.domain.style_spec import StyleSpec` 추가.

- [ ] **Step 3: 테스트 통과 확인 + 커밋**

```bash
git add backend/app/api/templates.py backend/tests/test_api_templates.py
git commit -m "feat(api): add templates CRUD with builtin protection and ownership"
```

---

## Task 3: 프론트엔드 API 클라이언트 확장 + 템플릿 관리 페이지

**Files:**
- Modify: `frontend/lib/api.ts` (CRUD 추가), `frontend/lib/types.ts` (TemplateCreate/Update)
- Create: `frontend/app/templates/page.tsx`, `frontend/components/template-form/StyleSpecForm.tsx`

- [ ] **Step 1: `lib/api.ts` 에 CRUD 추가**

```ts
createTemplate: (name: string, spec: Record<string, unknown>) =>
  request<Template>("/templates", { method: "POST", body: JSON.stringify({ name, spec }) }),
updateTemplate: (id: string, body: { name?: string; spec?: Record<string, unknown> }) =>
  request<Template>(`/templates/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
deleteTemplate: (id: string) =>
  request<void>(`/templates/${id}`, { method: "DELETE" }),
```

- [ ] **Step 2: `StyleSpecForm.tsx`** — 빌트인 spec을 받아 일부 필드 편집 가능한 폼

대상 필드 (Phase 2 범위):
- 본문 폰트(한글/영문) + 크기
- H1/H2/H3 폰트 크기 + bold
- 줄간격, 정렬
- 페이지 여백 (4 방향)

복잡한 필드(번호 형식·표·들여쓰기)는 초기 빌트인 값 그대로 유지. UI는 `<details>` + `<input type="number">` 위주.

- [ ] **Step 3: `/templates` 페이지**

- 빌트인 3개와 내 커스텀 N개 카드 그리드로 표시
- 빌트인은 "복제" 버튼만 (편집 불가)
- 커스텀은 "이름 변경", "삭제", "편집" 버튼
- 새 커스텀 만들기 → 빌트인 선택 → StyleSpecForm 열림 → 이름 + 수정 → 저장
- 편집 → StyleSpecForm 열림 → 저장 시 PATCH

- [ ] **Step 4: 빌드 검증 + 커밋**

```bash
git add frontend/lib/ frontend/app/templates/ frontend/components/template-form/
git commit -m "feat(frontend): add /templates page with custom template CRUD form"
```

---

## Task 4: 변환 화면 오버라이드 (즉시 적용 폼)

**Files:**
- Modify: `frontend/app/editor/[jobId]/page.tsx`

- [ ] **Step 1: 변환 버튼 옆에 "스타일 일부 수정" 토글 추가**

선택된 템플릿의 spec을 `useState`로 가져와 폼에 노출(StyleSpecForm 재사용). 사용자가 값 변경하면 폼 내부 state만 변함, "변환" 누르면 `api.render(jobId, templateId, overrides)` 형태로 변경된 키만 보냄.

- [ ] **Step 2: API 클라이언트 시그니처 보강**

기존 `api.render(jobId, templateId)` 를 `api.render(jobId, templateId, overrides)` 로 확장. backend는 이미 `overrides` 받을 준비됨 (Phase 1 Task 12).

- [ ] **Step 3: 빌드 + 수동 검증**

샘플 .docx 업로드 → 변환 화면에서 "본문 폰트 크기 12pt"로 변경 → 변환 → 다운로드 후 확인.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(frontend): add inline StyleSpec override form on render page"
```

---

## Task 5: 히스토리 페이지 개선 (재변환 / 삭제 / 적용 템플릿 표시)

**Files:**
- Modify: `frontend/app/dashboard/page.tsx` (서버 컴포넌트 → 클라이언트로 일부 분리), 새 `frontend/components/job-row.tsx`
- Modify: `backend/app/api/jobs.py` (DELETE /jobs/{id})

- [ ] **Step 1: backend DELETE 엔드포인트**

```python
@router.delete("/{job_id}", status_code=204)
def delete_job(job_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> None:
    job = _get_user_job(db, user, job_id)
    db.delete(job); db.commit()
    # 디스크 파일도 정리
    src = Path(job.source_path) if job.source_path else None
    if src and src.exists(): src.unlink()
    if job.result_path and Path(job.result_path).exists(): Path(job.result_path).unlink()
```

- [ ] **Step 2: API + 테스트**

`api.deleteJob(id)` 추가, `tests/test_api_jobs.py` 에 삭제 테스트 추가.

- [ ] **Step 3: 히스토리 카드 UI**

각 job 행에:
- 적용 템플릿 이름(있으면) 노출
- "재변환" 버튼 → editor 페이지로 이동
- "삭제" 버튼 → confirm + DELETE → 새로고침

- [ ] **Step 4: Commit**

---

## Task 6: 로그아웃 버튼 + outline 저장 표시 (UX)

**Files:**
- Modify: `frontend/app/dashboard/page.tsx`, `frontend/app/editor/[jobId]/page.tsx`, `frontend/components/outline-editor/OutlineEditor.tsx`

- [ ] **Step 1: 로그아웃 헤더 메뉴**

dashboard와 editor 페이지에 "로그아웃" 버튼 추가. `api.logout()` 후 `/login` 으로.

- [ ] **Step 2: outline 저장 indicator**

OutlineEditor 의 `onChange` 호출 시 PUT 진행 상태(`saving | saved | error`)를 상위로 노출. 우상단에 "저장됨" / "저장 중..." / "저장 실패" 작게 표시.

- [ ] **Step 3: Commit**

---

# Phase 2.1 — 파서·렌더러 보강

---

## Task 7: 추가 헤딩 휴리스틱

**Files:**
- Modify: `backend/app/parser/detect_heading.py`, `backend/tests/test_detect_heading.py`

추가 패턴:
- `(1)`, `(2)` ... → H2 (괄호 숫자)
- `1)`, `2)` ... → H2 (닫는 괄호)
- `①`, `②` ... `⑩` → H3 (원형 숫자)
- `*** 결론 ***` 같은 `^\*+\s*[^*]+\s*\*+$` → H1
- 점 없는 `^\d+\s` + bold or large → H1
- 표지 감지: 가운데 정렬 + 큰 폰트(>=18pt) + 첫 5문단 이내 → H1

- [ ] **Step 1: 정규식 추가 + 단위 테스트 5개 추가**
- [ ] **Step 2: messy 샘플 재파싱 결과 검증** — 휴리스틱 추가 후 H1/H2 잡힌 수가 늘어나야 함
- [ ] **Step 3: Commit**

---

## Task 8: 빈 문단 정리 + 정렬 정보 보존

**Files:**
- Modify: `backend/app/parser/parse_docx.py`, `backend/app/domain/outline.py`, `backend/app/renderer/render_docx.py`, `backend/app/renderer/apply_style.py`

- [ ] **Step 1: Block 모델에 `alignment: Literal[...] | None` 추가**

`backend/app/domain/outline.py` 의 `Block` 에 `alignment: Literal["left", "center", "right", "justify"] | None = None` 추가.

- [ ] **Step 2: parse_docx 에서 paragraph alignment 추출**

`p.alignment` 가 None이면 None, 있으면 enum → string 매핑.

- [ ] **Step 3: parse_docx 후처리 — 연속 빈 문단 축약**

연속 2개 이상의 빈 paragraph는 1개로 축약(옵션이 아닌 기본값).

- [ ] **Step 4: render_docx — block.alignment 가 있으면 StyleSpec 기본값을 덮어씀**

H레벨이 0이고 alignment가 명시되어 있을 때 본문 정렬 → 그 값으로.

- [ ] **Step 5: 테스트 추가 + 커밋**

---

# Phase 2.2 — 다중 선택 (사용자 추가 요청)

---

## Task 9: Outline 에디터 다중 선택 + 일괄 레벨 변경

**Files:**
- Modify: `frontend/components/outline-editor/OutlineEditor.tsx`, `ParagraphBlock.tsx`

요구 사양:
- **선택 모델**: `selectedIds: Set<string>` 상태를 OutlineEditor 가 보유.
- **선택 조작**:
  - 단순 클릭 → 해당 블록만 선택 (다른 선택 모두 해제)
  - **Shift+Click** → 마지막 선택 ↔ 클릭한 블록 사이의 paragraph 블록 모두 선택 (table/image/field는 건너뜀)
  - **Cmd+Click (mac) / Ctrl+Click (other)** → 토글 (이미 선택된 거면 해제, 아니면 추가)
  - 키보드 포커스 이동(↑/↓)도 단일 선택으로 동작 — 향후 옵션
- **레벨 변경**:
  - Tab / Shift+Tab → 선택된 모든 블록의 `level`을 +1 / -1 (0~3 클램프)
  - 단일 선택일 때도 동일하게 동작 (기존 호환)
- **시각**:
  - 선택된 블록은 `bg-primary/10 border-primary` 배경
  - 다중 선택 중일 때 변환 헤더에 "N개 선택됨" 작게 표시
- **마지막 클릭 추적**: Shift+Click 의 anchor를 위해 `lastClickedId: string | null` 도 보유.

- [ ] **Step 1: OutlineEditor 상태·핸들러 작성**
- [ ] **Step 2: ParagraphBlock 에 isSelected 프롭 + onClick(modifiers) 콜백 추가**
- [ ] **Step 3: Tab 핸들러 — 선택된 모든 paragraph 에 level 변경 적용 후 상위 onChange 1회 호출**
- [ ] **Step 4: 시각 + 카운터**
- [ ] **Step 5: 빌드 + 수동 검증** (messy 샘플로 여러 줄 동시 H2 변경 확인)
- [ ] **Step 6: Commit**

---

# 검증

- 백엔드: 모든 테스트 PASS (37 + 신규 ~10 = 47+)
- 프론트엔드: lint + build 통과
- 통합 round-trip: signup → upload(messy) → 다중 선택으로 H2 일괄 부여 → 커스텀 템플릿 저장 → 적용 → 다운로드 → docx 검증
- 기록: spec 문서에 Phase 2 완료 검증 섹션 추가

---

# 실행 순서

1. Task 1 (시드 +2) — 5분
2. Task 2 (CRUD API) — 백엔드 핵심
3. Task 3 (템플릿 관리 페이지) — 프론트
4. Task 4 (오버라이드 폼)
5. Task 5 (히스토리 개선)
6. Task 6 (UX 보조)
7. Task 7 (휴리스틱)
8. Task 8 (빈문단 + 정렬)
9. Task 9 (다중 선택)
10. 통합 검증

각 Task = 1 commit (PR 단위).
