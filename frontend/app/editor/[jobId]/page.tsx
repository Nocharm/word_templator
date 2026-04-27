"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Outline, StyleSpec, Template } from "@/lib/types";
import { OutlineEditor } from "@/components/outline-editor/OutlineEditor";
import { StyleSpecForm } from "@/components/template-form/StyleSpecForm";
import { LogoutButton } from "@/components/logout-button";

function SaveIndicator({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  if (state === "idle") return null;
  const label = {
    saving: "저장 중...",
    saved: "저장됨",
    error: "저장 실패",
  }[state];
  const cls = {
    saving: "text-text-muted",
    saved: "text-success",
    error: "text-danger",
  }[state];
  return <span className={`text-xs ${cls}`}>{label}</span>;
}

export default function EditorPage() {
  const router = useRouter();
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;
  const [outline, setOutline] = useState<Outline | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTpl, setSelectedTpl] = useState<string>("");
  const [pendingSpec, setPendingSpec] = useState<StyleSpec | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    Promise.all([api.getOutline(jobId), api.listTemplates()])
      .then(([o, t]) => {
        setOutline(o);
        setTemplates(t);
        const builtin = t.find((x) => x.is_builtin);
        if (builtin) {
          setSelectedTpl(builtin.id);
          setPendingSpec(builtin.spec as unknown as StyleSpec);
        }
      })
      .catch((e) => setError((e as Error).message));
  }, [jobId]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTpl) ?? null,
    [templates, selectedTpl],
  );

  function handleSelectTemplate(id: string) {
    setSelectedTpl(id);
    const t = templates.find((x) => x.id === id);
    if (t) setPendingSpec(t.spec as unknown as StyleSpec);
  }

  async function handleSave(next: Outline) {
    setOutline(next);
    setSaveState("saving");
    try {
      await api.putOutline(jobId, next);
      setSaveState("saved");
      setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1500);
    } catch (e) {
      setSaveState("error");
      setError((e as Error).message);
    }
  }

  async function handleRender() {
    if (!selectedTpl || !pendingSpec || !selectedTemplate) return;
    setBusy(true);
    setError(null);
    try {
      // 변경된 spec 전체를 overrides로 보냄. 백엔드는 {...template.spec, ...overrides} 로 병합하므로
      // 사용자가 폼에서 만진 영역(fonts/paragraph/page) 통째로 덮어쓰는 효과.
      const overrides: Record<string, unknown> = {};
      const baseSpec = selectedTemplate.spec as unknown as StyleSpec;
      // 비교해서 다른 top-level 키만 보내면 알뜰. 단순화 위해 다 보냄.
      for (const k of Object.keys(pendingSpec) as (keyof StyleSpec)[]) {
        if (JSON.stringify(pendingSpec[k]) !== JSON.stringify(baseSpec[k])) {
          overrides[k] = pendingSpec[k];
        }
      }
      await api.render(jobId, selectedTpl, overrides);
      // preview 페이지가 동일한 spec 으로 diff 계산하도록 sessionStorage 에 전달
      sessionStorage.setItem(`preview:${jobId}:template_id`, selectedTpl);
      sessionStorage.setItem(`preview:${jobId}:overrides`, JSON.stringify(overrides));
      router.push(`/editor/${jobId}/preview`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !outline) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <div className="rounded-token-lg bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
      </main>
    );
  }
  if (!outline) {
    return <main className="mx-auto max-w-4xl p-6 text-text-muted">로딩 중...</main>;
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{outline.source_filename}</h1>
          <p className="mt-1 text-sm text-text-muted">
            <kbd className="rounded bg-surface px-1.5 py-0.5 text-xs">Tab</kbd>
            <span className="mx-1">/</span>
            <kbd className="rounded bg-surface px-1.5 py-0.5 text-xs">Shift+Tab</kbd>
            으로 문단 레벨 조정 · ⚠️는 휴리스틱 추정
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SaveIndicator state={saveState} />
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="rounded-token border border-border bg-surface-elevated px-4 py-2 text-sm hover:bg-surface"
          >
            히스토리
          </button>
          <LogoutButton />
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-token-lg border border-border bg-surface-elevated p-4 shadow-token-sm">
        <label className="text-sm text-text-muted">템플릿</label>
        <select
          className="flex-1 rounded-token border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary"
          value={selectedTpl}
          onChange={(e) => handleSelectTemplate(e.target.value)}
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.is_builtin ? " · 빌트인" : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleRender}
          disabled={busy || !selectedTpl}
          className="rounded-token bg-primary px-5 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
        >
          {busy ? "변환 중..." : "변환 + 검토 →"}
        </button>
      </div>

      {pendingSpec ? (
        <details className="mt-4 rounded-token-lg border border-border bg-surface-elevated p-4">
          <summary className="cursor-pointer text-sm font-medium text-text-muted">
            ⚙️ 스타일 일부 수정 (이번 변환에만 적용)
          </summary>
          <div className="mt-4">
            <StyleSpecForm key={selectedTpl} initial={pendingSpec} onChange={setPendingSpec} />
          </div>
        </details>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-token bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      ) : null}

      <div className="mt-6">
        <OutlineEditor initial={outline} onChange={handleSave} />
      </div>
    </main>
  );
}
