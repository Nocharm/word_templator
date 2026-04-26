"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Outline, Template } from "@/lib/types";
import { OutlineEditor } from "@/components/outline-editor/OutlineEditor";

export default function EditorPage() {
  const router = useRouter();
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;
  const [outline, setOutline] = useState<Outline | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTpl, setSelectedTpl] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getOutline(jobId), api.listTemplates()])
      .then(([o, t]) => {
        setOutline(o);
        setTemplates(t);
        const builtin = t.find((x) => x.is_builtin);
        if (builtin) setSelectedTpl(builtin.id);
      })
      .catch((e) => setError((e as Error).message));
  }, [jobId]);

  async function handleSave(next: Outline) {
    setOutline(next);
    try {
      await api.putOutline(jobId, next);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleRender() {
    if (!selectedTpl) return;
    setBusy(true);
    setError(null);
    try {
      await api.render(jobId, selectedTpl);
      window.location.href = api.downloadUrl(jobId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <main className="p-8 text-red-600">{error}</main>;
  if (!outline) return <main className="p-8">로딩 중...</main>;

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-xl font-bold">{outline.source_filename}</h1>
      <p className="mt-1 text-xs text-gray-500">
        Tab/Shift+Tab으로 문단 레벨을 조정하세요. ⚠️ 표시는 휴리스틱 추정 결과입니다.
      </p>

      <div className="mt-4 flex items-center gap-3">
        <select
          className="rounded border px-3 py-2"
          value={selectedTpl}
          onChange={(e) => setSelectedTpl(e.target.value)}
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}{t.is_builtin ? " (빌트인)" : ""}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleRender}
          disabled={busy || !selectedTpl}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {busy ? "변환 중..." : "변환 + 다운로드"}
        </button>
        <button type="button" onClick={() => router.push("/dashboard")} className="rounded border px-4 py-2">
          히스토리
        </button>
      </div>

      <div className="mt-6">
        <OutlineEditor initial={outline} onChange={handleSave} />
      </div>
    </main>
  );
}
