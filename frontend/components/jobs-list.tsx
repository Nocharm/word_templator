"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { useSettings } from "@/components/settings-provider";
import type { JobSummary } from "@/lib/types";

export function JobsList({ initialJobs }: { initialJobs: JobSummary[] }) {
  const router = useRouter();
  const { t, language } = useSettings();
  const dateLocale = language === "ko" ? "ko-KR" : "en-US";
  const [jobs, setJobs] = useState(initialJobs);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const allSelected = jobs.length > 0 && selected.size === jobs.length;
  const someSelected = selected.size > 0 && selected.size < jobs.length;

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(jobs.map((j) => j.id)));
    }
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(t("jobsList.bulkDeleteConfirm", { n: selected.size }))) return;
    setBusy(true);
    try {
      const ids = Array.from(selected);
      await Promise.all(ids.map((id) => api.deleteJob(id)));
      setJobs((prev) => prev.filter((j) => !selected.has(j.id)));
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSingleDelete(id: string, filename: string) {
    if (!confirm(t("jobsList.singleDeleteConfirm", { name: filename }))) return;
    setBusy(true);
    try {
      await api.deleteJob(id);
      setJobs((prev) => prev.filter((j) => j.id !== id));
      const next = new Set(selected);
      next.delete(id);
      setSelected(next);
      router.refresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (jobs.length === 0) {
    return (
      <div className="mt-12 rounded-token-xl border border-border bg-surface p-12 text-center text-sm text-text-muted">
        {t("jobsList.empty")}
        <div className="mt-4">
          <Link href="/" className="text-primary hover:underline">
            {t("jobsList.firstUpload")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      {/* 전체 선택 / 일괄 삭제 툴바 */}
      <div className="flex items-center justify-between rounded-token-lg border border-border bg-surface-elevated px-4 py-2">
        <label className="flex items-center gap-2 text-sm text-text-muted">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={toggleAll}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          {allSelected ? t("common.clearAll") : t("common.selectAll")}
          {selected.size > 0 ? (
            <span className="ml-2 text-primary">· {t("common.selectedCount", { n: selected.size })}</span>
          ) : null}
        </label>
        <button
          type="button"
          onClick={handleBulkDelete}
          disabled={selected.size === 0 || busy}
          className="rounded-token border border-border px-3 py-1.5 text-sm text-danger hover:bg-danger/10 disabled:opacity-50"
        >
          {busy ? t("common.deleting") : t("common.deleteSelected", { n: selected.size })}
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {jobs.map((job) => {
          const isSelected = selected.has(job.id);
          const statusColor =
            job.status === "rendered"
              ? "text-success"
              : job.status === "failed"
                ? "text-danger"
                : "text-text-muted";
          return (
            <li
              key={job.id}
              className={`rounded-token-lg border bg-surface-elevated transition ${
                isSelected
                  ? "border-primary"
                  : "border-border hover:border-border-strong"
              }`}
            >
              <div className="flex items-center gap-3 px-5 py-4">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(job.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={t("common.selectAria")}
                  className="h-4 w-4 flex-shrink-0 rounded border-border accent-primary"
                />
                <Link href={`/editor/${job.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-medium">{job.original_filename}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    <span className={statusColor}>{job.status}</span>
                    <span className="mx-2">·</span>
                    {new Date(job.created_at).toLocaleString(dateLocale)}
                    {job.applied_template_name ? (
                      <>
                        <span className="mx-2">·</span>
                        <span>{job.applied_template_name}</span>
                      </>
                    ) : null}
                  </p>
                </Link>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSingleDelete(job.id, job.original_filename);
                  }}
                  disabled={busy}
                  className="rounded-token border border-border px-3 py-1.5 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
                >
                  {t("common.delete")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
