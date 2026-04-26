import Link from "next/link";
import { fetchMe } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { JobRow } from "@/components/job-row";
import type { JobSummary } from "@/lib/types";

// 서버 컴포넌트 → 컨테이너 내부에서 backend로 직접 fetch
const INTERNAL_API_BASE = process.env.INTERNAL_API_BASE ?? "http://backend:8000";

async function fetchJobs(): Promise<JobSummary[]> {
  const store = await cookies();
  const token = store.get("access_token")?.value;
  if (!token) return [];
  const r = await fetch(`${INTERNAL_API_BASE}/jobs`, {
    headers: { Cookie: `access_token=${token}` },
    cache: "no-store",
  });
  if (!r.ok) return [];
  return (await r.json()) as JobSummary[];
}

export default async function DashboardPage() {
  const me = await fetchMe();
  if (!me) redirect("/login");
  const jobs = await fetchJobs();

  return (
    <main className="mx-auto max-w-3xl p-6 pt-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">히스토리</h1>
          <p className="mt-1 text-sm text-text-muted">{me.email}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/templates"
            className="rounded-token border border-border bg-surface-elevated px-3 py-1.5 text-sm hover:bg-surface"
          >
            템플릿
          </Link>
          <Link
            href="/"
            className="rounded-token bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
          >
            새 변환
          </Link>
        </div>
      </header>

      {jobs.length === 0 ? (
        <div className="mt-12 rounded-token-xl border border-border bg-surface p-12 text-center text-sm text-text-muted">
          변환 이력이 없습니다.
          <div className="mt-4">
            <Link href="/" className="text-primary hover:underline">
              첫 .docx 업로드 →
            </Link>
          </div>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {jobs.map((j) => (
            <JobRow key={j.id} job={j} />
          ))}
        </ul>
      )}
    </main>
  );
}
