"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useT } from "@/components/settings-provider";
import type { StyleSpec, Template } from "@/lib/types";
import { StyleSpecForm } from "@/components/template-form/StyleSpecForm";

type EditState =
  | { mode: "idle" }
  | { mode: "create"; baseSpec: StyleSpec; name: string }
  | { mode: "edit"; id: string; name: string; spec: StyleSpec };

export default function TemplatesPage() {
  const t = useT();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<EditState>({ mode: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

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

  function handleClone(tpl: Template) {
    setEditing({
      mode: "create",
      baseSpec: tpl.spec as unknown as StyleSpec,
      name: `${tpl.name} ${t("templates.copySuffix")}`,
    });
  }

  function handleEdit(tpl: Template) {
    setEditing({ mode: "edit", id: tpl.id, name: tpl.name, spec: tpl.spec as unknown as StyleSpec });
  }

  async function handleDeleteOne(tpl: Template) {
    if (!confirm(t("jobsList.singleDeleteConfirm", { name: tpl.name }))) return;
    try {
      await api.deleteTemplate(tpl.id);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(tpl.id);
        return next;
      });
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

  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleAllCustom() {
    const customIds = templates.filter((tpl) => !tpl.is_builtin).map((tpl) => tpl.id);
    if (selected.size === customIds.length && customIds.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(customIds));
    }
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(t("templates.bulkDeleteConfirm", { n: selected.size }))) return;
    setBusy(true);
    try {
      const ids = Array.from(selected);
      await Promise.all(ids.map((id) => api.deleteTemplate(id)));
      setSelected(new Set());
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const builtins = templates.filter((tpl) => tpl.is_builtin);
  const customs = templates.filter((tpl) => !tpl.is_builtin);
  const allCustomsSelected = customs.length > 0 && selected.size === customs.length;
  const someCustomsSelected = selected.size > 0 && selected.size < customs.length;

  return (
    <main className="mx-auto max-w-4xl p-6 pt-12">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("templates.title")}</h1>
        <p className="mt-1 text-sm text-text-muted">{t("templates.subtitle")}</p>
      </header>

      {error ? (
        <div className="mt-4 rounded-token bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      ) : null}

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">{t("templates.builtinHeader")}</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {builtins.map((tpl) => (
            <article key={tpl.id} className="rounded-token-lg border border-border bg-surface-elevated p-4">
              <p className="font-medium">{tpl.name}</p>
              <p className="mt-1 text-xs text-text-muted">{t("templates.readOnly")}</p>
              <button
                type="button"
                onClick={() => handleClone(tpl)}
                className="mt-3 w-full rounded-token bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover"
              >
                {t("templates.cloneEdit")}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">{t("templates.myHeader")}</h2>
          {customs.length > 0 ? (
            <div className="flex items-center gap-2 text-sm">
              <label className="flex items-center gap-2 text-text-muted">
                <input
                  type="checkbox"
                  checked={allCustomsSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someCustomsSelected;
                  }}
                  onChange={toggleAllCustom}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                {allCustomsSelected ? t("common.clearAll") : t("common.selectAll")}
                {selected.size > 0 ? (
                  <span className="text-primary">· {t("common.selectedCount", { n: selected.size })}</span>
                ) : null}
              </label>
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={selected.size === 0 || busy}
                className="rounded-token border border-border px-3 py-1.5 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
              >
                {busy ? t("common.deleting") : t("common.deleteSelected", { n: selected.size })}
              </button>
            </div>
          ) : null}
        </div>

        {customs.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">{t("templates.empty")}</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {customs.map((tpl) => {
              const isSelected = selected.has(tpl.id);
              return (
                <article
                  key={tpl.id}
                  className={`rounded-token-lg border bg-surface-elevated p-4 transition ${
                    isSelected ? "border-primary" : "border-border"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(tpl.id)}
                      aria-label={t("common.selectAria")}
                      className="mt-1 h-4 w-4 flex-shrink-0 rounded border-border accent-primary"
                    />
                    <p className="flex-1 font-medium">{tpl.name}</p>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleEdit(tpl)}
                      className="flex-1 rounded-token border border-border px-3 py-1.5 text-sm hover:bg-surface"
                    >
                      {t("common.edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteOne(tpl)}
                      className="rounded-token border border-border px-3 py-1.5 text-sm text-danger hover:bg-danger/10"
                    >
                      {t("common.delete")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {editing.mode !== "idle" ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-6">
          <div className="w-full max-w-2xl rounded-token-xl border border-border bg-bg p-6 shadow-token-lg">
            <header className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editing.mode === "create" ? t("templates.modalNew") : t("templates.modalEdit")}
              </h2>
              <button
                type="button"
                onClick={() => setEditing({ mode: "idle" })}
                className="rounded-token border border-border px-2 py-1 text-sm hover:bg-surface"
              >
                {t("common.close")}
              </button>
            </header>

            <label className="mt-4 flex flex-col gap-1 text-sm">
              <span className="text-text-muted">{t("templates.modalName")}</span>
              <input
                type="text"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="form-input"
              />
            </label>

            <div className="mt-4">
              <StyleSpecForm
                key={editing.mode === "edit" ? editing.id : "new"}
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
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!editing.name.trim()}
                className="rounded-token bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
