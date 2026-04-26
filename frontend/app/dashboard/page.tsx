import Link from "next/link";
import { fetchMe } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

async function fetchJobs() {
  const store = await cookies();
  const token = store.get("access_token")?.value;
  if (!token) return [];
  const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://backend:8000";
  const r = await fetch(`${BASE}/jobs`, {
    headers: { Cookie: `access_token=${token}` },
    cache: "no-store",
  });
  if (!r.ok) return [];
  return (await r.json()) as { id: string; original_filename: string; status: string; created_at: string }[];
}

export default async function DashboardPage() {
  const me = await fetchMe();
  if (!me) redirect("/login");
  const jobs = await fetchJobs();

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">히스토리</h1>
        <Link href="/" className="rounded border px-3 py-1 text-sm">새 변환</Link>
      </header>

      <ul className="mt-6 flex flex-col gap-2">
        {jobs.map((j) => (
          <li key={j.id} className="rounded border px-4 py-3">
            <Link href={`/editor/${j.id}`} className="block">
              <p className="font-medium">{j.original_filename}</p>
              <p className="text-xs text-gray-500">
                {j.status} · {new Date(j.created_at).toLocaleString("ko-KR")}
              </p>
            </Link>
          </li>
        ))}
        {jobs.length === 0 ? <p className="text-sm text-gray-500">변환 이력이 없습니다.</p> : null}
      </ul>
    </main>
  );
}
