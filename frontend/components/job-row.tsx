"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import type { JobSummary } from "@/lib/types";

export function JobRow({ job }: { job: JobSummary }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`"${job.original_filename}" 삭제하시겠습니까?`)) return;
    setBusy(true);
    try {
      await api.deleteJob(job.id);
      router.refresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const statusColor =
    job.status === "rendered"
      ? "text-success"
      : job.status === "failed"
        ? "text-danger"
        : "text-text-muted";

  return (
    <li className="rounded-token-lg border border-border bg-surface-elevated transition hover:border-border-strong hover:shadow-token-sm">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <Link href={`/editor/${job.id}`} className="min-w-0 flex-1">
          <p className="truncate font-medium">{job.original_filename}</p>
          <p className="mt-1 text-xs text-text-muted">
            <span className={statusColor}>{job.status}</span>
            <span className="mx-2">·</span>
            {new Date(job.created_at).toLocaleString("ko-KR")}
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
          onClick={handleDelete}
          disabled={busy}
          className="rounded-token border border-border px-3 py-1.5 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
        >
          {busy ? "삭제 중..." : "삭제"}
        </button>
      </div>
    </li>
  );
}
