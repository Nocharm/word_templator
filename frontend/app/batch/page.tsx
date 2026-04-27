"use client";

import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { BatchRenderItem, BatchUploadItem, Template } from "@/lib/types";
import { LogoutButton } from "@/components/logout-button";

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

function statusLabel(row: FileRow): string {
  if (row.render_status === "rendered") return "변환 완료";
  if (row.render_status === "failed") return `렌더 실패: ${row.render_error ?? ""}`;
  if (row.upload_status === "failed") return `업로드 실패: ${row.upload_error ?? ""}`;
  if (row.upload_status === "parsed") return "업로드 완료";
  return "대기 중";
}

export default function BatchPage() {
  const router = useRouter();
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
      setError(".docx 파일만 선택해주세요");
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
        setError("파싱 성공한 파일이 없습니다.");
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
          <h1 className="text-2xl font-semibold tracking-tight">다중 파일 일괄 변환</h1>
          <p className="mt-1 text-sm text-text-muted">
            여러 .docx 를 한 템플릿으로 동시에 변환합니다. 백엔드는 병렬 처리.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-token border border-border bg-surface-elevated px-3 py-1.5 text-sm hover:bg-surface"
          >
            ← 단일 파일
          </button>
          <LogoutButton />
        </div>
      </header>

      <div className="mt-6 rounded-token-lg border border-border bg-surface-elevated p-6 shadow-token-sm">
        <label className="block">
          <span className="text-sm font-medium text-text">.docx 파일 선택 (최대 50개)</span>
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
          <label className="text-sm text-text-muted">템플릿</label>
          <select
            disabled={busy}
            className="flex-1 rounded-token border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary"
            value={tplId}
            onChange={(e) => setTplId(e.target.value)}
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
            onClick={handleRunAll}
            disabled={busy || rows.length === 0 || !tplId}
            className="rounded-token bg-primary px-5 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
          >
            {phase === "uploading"
              ? "업로드 중..."
              : phase === "rendering"
                ? "변환 중..."
                : `전체 변환 (${rows.length})`}
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
              총 <span className="font-medium text-text">{counts.total}</span> 파일
              {phase === "ready" || counts.ok > 0 || counts.fail > 0 ? (
                <>
                  {" · "}
                  <span className="text-success font-medium">완료 {counts.ok}</span>
                  {counts.fail > 0 ? (
                    <>
                      {" · "}
                      <span className="text-danger font-medium">실패 {counts.fail}</span>
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
                ↓ 전체 다운로드 ({renderedIds.length}개 zip)
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
                <span className="text-xs text-text-muted">{statusLabel(r)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </main>
  );
}
