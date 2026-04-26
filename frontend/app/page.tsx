"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { job_id } = await api.upload(file);
      router.push(`/editor/${job_id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">Word Templator</h1>
      <p className="mt-2 text-sm text-gray-600">.docx 파일을 업로드해 표준화하세요.</p>
      <div className="mt-6 rounded border-2 border-dashed p-8 text-center">
        <input type="file" accept=".docx" onChange={handleUpload} disabled={busy} />
        {busy ? <p className="mt-2 text-sm">업로드 중...</p> : null}
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </div>
      <p className="mt-4 text-xs text-gray-500">
        로그인이 필요합니다. <a className="underline" href="/login">로그인</a> · <a className="underline" href="/dashboard">히스토리</a>
      </p>
    </main>
  );
}
