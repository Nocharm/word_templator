"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { StyleSpec, Template } from "@/lib/types";
import { StyleSpecForm } from "@/components/template-form/StyleSpecForm";
import { LogoutButton } from "@/components/logout-button";

type EditState =
  | { mode: "idle" }
  | { mode: "create"; baseSpec: StyleSpec; name: string }
  | { mode: "edit"; id: string; name: string; spec: StyleSpec };

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<EditState>({ mode: "idle" });
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    try {
      setTemplates(await api.listTemplates());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleClone(t: Template) {
    setEditing({ mode: "create", baseSpec: t.spec as unknown as StyleSpec, name: `${t.name} 복제` });
  }

  async function handleEdit(t: Template) {
    setEditing({ mode: "edit", id: t.id, name: t.name, spec: t.spec as unknown as StyleSpec });
  }

  async function handleDelete(t: Template) {
    if (!confirm(`"${t.name}" 삭제하시겠습니까?`)) return;
    try {
      await api.deleteTemplate(t.id);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleSave() {
    if (editing.mode === "idle") return;
    try {
      if (editing.mode === "create") {
        await api.createTemplate(editing.name, editing.baseSpec as unknown as Record<string, unknown>);
      } else {
        await api.updateTemplate(editing.id, {
          name: editing.name,
          spec: editing.spec as unknown as Record<string, unknown>,
        });
      }
      setEditing({ mode: "idle" });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const builtins = templates.filter((t) => t.is_builtin);
  const customs = templates.filter((t) => !t.is_builtin);

  return (
    <main className="mx-auto max-w-4xl p-6 pt-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">템플릿</h1>
          <p className="mt-1 text-sm text-text-muted">빌트인을 복제하거나 직접 만들어 저장하세요.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard" className="rounded-token border border-border bg-surface-elevated px-3 py-1.5 text-sm hover:bg-surface">
            히스토리
          </Link>
          <LogoutButton />
        </div>
      </header>

      {error ? (
        <div className="mt-4 rounded-token bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      ) : null}

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">빌트인</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {builtins.map((t) => (
            <article key={t.id} className="rounded-token-lg border border-border bg-surface-elevated p-4">
              <p className="font-medium">{t.name}</p>
              <p className="mt-1 text-xs text-text-muted">읽기 전용</p>
              <button
                type="button"
                onClick={() => handleClone(t)}
                className="mt-3 w-full rounded-token bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover"
              >
                복제해서 편집
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">내 템플릿</h2>
        {customs.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">아직 만든 템플릿이 없습니다. 빌트인을 복제해 시작하세요.</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {customs.map((t) => (
              <article key={t.id} className="rounded-token-lg border border-border bg-surface-elevated p-4">
                <p className="font-medium">{t.name}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleEdit(t)}
                    className="flex-1 rounded-token border border-border px-3 py-1.5 text-sm hover:bg-surface"
                  >
                    편집
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(t)}
                    className="rounded-token border border-border px-3 py-1.5 text-sm text-danger hover:bg-danger/10"
                  >
                    삭제
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {editing.mode !== "idle" ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-6">
          <div className="w-full max-w-2xl rounded-token-xl border border-border bg-bg p-6 shadow-token-lg">
            <header className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editing.mode === "create" ? "새 템플릿 만들기" : "템플릿 편집"}
              </h2>
              <button
                type="button"
                onClick={() => setEditing({ mode: "idle" })}
                className="rounded-token border border-border px-2 py-1 text-sm hover:bg-surface"
              >
                닫기
              </button>
            </header>

            <label className="mt-4 flex flex-col gap-1 text-sm">
              <span className="text-text-muted">이름</span>
              <input
                type="text"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="form-input"
              />
            </label>

            <div className="mt-4">
              <StyleSpecForm
                initial={editing.mode === "create" ? editing.baseSpec : editing.spec}
                onChange={(next) => {
                  if (editing.mode === "create") setEditing({ ...editing, baseSpec: next });
                  else setEditing({ ...editing, spec: next });
                }}
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing({ mode: "idle" })}
                className="rounded-token border border-border px-4 py-2 text-sm hover:bg-surface"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!editing.name.trim()}
                className="rounded-token bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
