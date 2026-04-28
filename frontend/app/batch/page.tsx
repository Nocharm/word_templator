"use client";

import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useT } from "@/components/settings-provider";
import type { TFunction } from "@/lib/i18n";
import type { BatchRenderItem, BatchUploadItem, Template } from "@/lib/types";

type Phase = "idle" | "uploading" | "uploaded" | "rendering" | "ready" | "error";

interface FileRow {
  file: File;
  job_id?: string;
  upload_status?: "parsed" | "failed";
  upload_error?: string | null;
  render_status?: "rendered" | "failed";
  render_error?: string | null;
}

function statusIcon(row: FileRow): string {
  if (row.render_status === "rendered") return "✅";
  if (row.render_status === "failed") return "❌";
  if (row.upload_status === "failed") return "❌";
  if (row.upload_status === "parsed") return "🟢";
  return "⏳";
}

function statusLabel(row: FileRow, t: TFunction): string {
  if (row.render_status === "rendered") return t("batch.statusConverted");
  if (row.render_status === "failed") return t("batch.statusRenderFailed", { err: row.render_error ?? "" });
  if (row.upload_status === "failed") return t("batch.statusUploadFailed", { err: row.upload_error ?? "" });
  if (row.upload_status === "parsed") return t("batch.statusUploaded");
  return t("batch.statusPending");
}

export default function BatchPage() {
  const router = useRouter();
  const t = useT();
  const [phase, setPhase] = useState<Phase>("idle");
  const [rows, setRows] = useState<FileRow[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tplId, setTplId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listTemplates()
      .then((ts) => {
        setTemplates(ts);
        const builtin = ts.find((x) => x.is_builtin);
        if (builtin) setTplId(builtin.id);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const arr = Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".docx"));
    if (arr.length === 0) {
      setError(t("batch.errOnlyDocx"));
      return;
    }
    setRows(arr.map((f) => ({ file: f })));
    setPhase("idle");
    setError(null);
  }

  async function handleRunAll() {
    if (rows.length === 0 || !tplId) return;
    setPhase("uploading");
    setError(null);
    try {
      const upload = await api.uploadBatch(rows.map((r) => r.file));
      const byName = new Map<string, BatchUploadItem>(
        upload.map((u) => [u.original_filename, u]),
      );
      const next = rows.map((r) => {
        const u = byName.get(r.file.name);
        if (!u) return r;
        return {
          ...r,
          job_id: u.job_id || undefined,
          upload_status: u.status,
          upload_error: u.error,
        };
      });
      setRows(next);
      setPhase("uploaded");

      const parsedIds = next
        .filter((r) => r.upload_status === "parsed" && r.job_id)
        .map((r) => r.job_id!);
      if (parsedIds.length === 0) {
        setError(t("batch.errNoneParsed"));
        setPhase("error");
        return;
      }

      setPhase("rendering");
      const render = await api.renderBatch(parsedIds, tplId);
      const byJob = new Map<string, BatchRenderItem>(render.map((r) => [r.job_id, r]));
      setRows(
        next.map((r) => {
          if (!r.job_id) return r;
          const rr = byJob.get(r.job_id);
          if (!rr) return r;
          return {
            ...r,
            render_status: rr.status,
            render_error: rr.error,
          };
        }),
      );
      setPhase("ready");
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  }

  const renderedIds = useMemo(
    () => rows.filter((r) => r.render_status === "rendered" && r.job_id).map((r) => r.job_id!),
    [rows],
  );

  const counts = useMemo(() => {
    const ok = rows.filter((r) => r.render_status === "rendered").length;
    const fail = rows.filter(
      (r) => r.render_status === "failed" || r.upload_status === "failed",
    ).length;
    return { ok, fail, total: rows.length };
  }, [rows]);

  const busy = phase === "uploading" || phase === "rendering";

  return (
    <main className="mx-auto max-w-4xl p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("batch.title")}</h1>
          <p className="mt-1 text-sm text-text-muted">{t("batch.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="rounded-token border border-border bg-surface-elevated px-3 py-1.5 text-sm hover:bg-surface"
        >
          {t("batch.singleFile")}
        </button>
      </header>

      <div className="mt-6 rounded-token-lg border border-border bg-surface-elevated p-6 shadow-token-sm">
        <label className="block">
          <span className="text-sm font-medium text-text">{t("batch.selectFiles")}</span>
          <input
            type="file"
            accept=".docx"
            multiple
            disabled={busy}
            onChange={(e) => handleFiles(e.target.files)}
            className="mt-2 block w-full rounded-token border border-border bg-bg px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1 file:text-sm file:text-white"
          />
        </label>

        <div className="mt-4 flex items-center gap-2">
          <label className="text-sm text-text-muted">{t("common.template")}</label>
          <select
            disabled={busy}
            className="flex-1 rounded-token border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary"
            value={tplId}
            onChange={(e) => setTplId(e.target.value)}
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
            onClick={handleRunAll}
            disabled={busy || rows.length === 0 || !tplId}
            className="rounded-token bg-primary px-5 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
          >
            {phase === "uploading"
              ? t("batch.uploading")
              : phase === "rendering"
                ? t("batch.converting")
                : t("batch.convertAll", { n: rows.length })}
          </button>
        </div>

        {error ? (
          <div className="mt-3 rounded-token bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        ) : null}
      </div>

      {rows.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-token-lg border border-border bg-surface-elevated">
          <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2 text-xs text-text-muted">
            <span>
              {t("batch.totalFiles", { n: counts.total })}
              {phase === "ready" || counts.ok > 0 || counts.fail > 0 ? (
                <>
                  {" · "}
                  <span className="text-success font-medium">{t("batch.done", { n: counts.ok })}</span>
                  {counts.fail > 0 ? (
                    <>
                      {" · "}
                      <span className="text-danger font-medium">{t("batch.failed", { n: counts.fail })}</span>
                    </>
                  ) : null}
                </>
              ) : null}
            </span>
            {phase === "ready" && renderedIds.length > 0 ? (
              <a
                href={api.batchDownloadUrl(renderedIds)}
                className="rounded-token bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary-hover"
              >
                {t("batch.downloadAll", { n: renderedIds.length })}
              </a>
            ) : null}
          </div>
          <ul>
            {rows.map((r, i) => (
              <li
                key={`${r.file.name}-${i}`}
                className={clsx(
                  "flex items-center gap-3 border-b border-border/60 px-4 py-2 text-sm last:border-b-0",
                  r.render_status === "failed" || r.upload_status === "failed"
                    ? "bg-danger/5"
                    : r.render_status === "rendered"
                      ? "bg-success/5"
                      : "",
                )}
              >
                <span className="w-5 text-center">{statusIcon(r)}</span>
                <span className="flex-1 truncate font-medium">{r.file.name}</span>
                <span className="text-xs text-text-muted">{statusLabel(r, t)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </main>
  );
}
