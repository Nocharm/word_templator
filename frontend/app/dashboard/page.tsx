import Link from "next/link";
import { fetchMe } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { JobsList } from "@/components/jobs-list";
import { getServerT } from "@/lib/i18n-server";
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
  const [jobs, t] = await Promise.all([fetchJobs(), getServerT()]);

  return (
    <main className="mx-auto max-w-3xl p-6 pt-12">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t("dashboard.title")}</h1>
        <Link
          href="/"
          className="rounded-token bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
        >
          {t("dashboard.newConvert")}
        </Link>
      </header>

      <JobsList initialJobs={jobs} />
    </main>
  );
}
