"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useT } from "@/components/settings-provider";
import type { TFunction } from "@/lib/i18n";
import type { Outline, Template } from "@/lib/types";
import { OutlineEditor } from "@/components/outline-editor/OutlineEditor";

function SaveIndicator({
  state,
  t,
}: {
  state: "idle" | "saving" | "saved" | "error";
  t: TFunction;
}) {
  if (state === "idle") return null;
  const label = {
    saving: t("editor.saveSaving"),
    saved: t("editor.saveSaved"),
    error: t("editor.saveFailed"),
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
  const t = useT();
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;
  const [outline, setOutline] = useState<Outline | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTpl, setSelectedTpl] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    Promise.all([api.getOutline(jobId), api.listTemplates()])
      .then(([o, tpls]) => {
        setOutline(o);
        setTemplates(tpls);
        const builtin = tpls.find((x) => x.is_builtin);
        if (builtin) setSelectedTpl(builtin.id);
      })
      .catch((e) => setError((e as Error).message));
  }, [jobId]);

  function handleSelectTemplate(id: string) {
    setSelectedTpl(id);
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
    if (!selectedTpl) return;
    setBusy(true);
    setError(null);
    try {
      await api.render(jobId, selectedTpl, {});
      // preview 페이지가 동일한 템플릿으로 diff 계산하도록 sessionStorage 에 전달
      sessionStorage.setItem(`preview:${jobId}:template_id`, selectedTpl);
      sessionStorage.setItem(`preview:${jobId}:overrides`, "{}");
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
    return <main className="mx-auto max-w-4xl p-6 text-text-muted">{t("common.loading")}</main>;
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
            {t("editor.kbdHint")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SaveIndicator state={saveState} t={t} />
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="rounded-token border border-border bg-surface-elevated px-4 py-2 text-sm hover:bg-surface"
          >
            {t("editor.history")}
          </button>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-token-lg border border-border bg-surface-elevated p-4 shadow-token-sm">
        <label className="text-sm text-text-muted">{t("common.template")}</label>
        <select
          className="flex-1 rounded-token border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary"
          value={selectedTpl}
          onChange={(e) => handleSelectTemplate(e.target.value)}
        >
          {templates.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.name}
              {tpl.is_builtin ? t("common.templateBuiltinSuffix") : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleRender}
          disabled={busy || !selectedTpl}
          className="rounded-token bg-primary px-5 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
        >
          {busy ? t("editor.converting") : t("editor.convertReview")}
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-token bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      ) : null}

      <div className="mt-6">
        <OutlineEditor initial={outline} onChange={handleSave} />
      </div>
    </main>
  );
}
